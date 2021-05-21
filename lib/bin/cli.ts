import { Command } from "commander";
import globby from "globby";
import { readFileSync, writeFileSync } from "fs";
import { stringify } from "javascript-stringify";
import { resolve as resolvePath } from "path";
import { createPool, sql } from "slonik";
import { raw } from "slonik-sql-tag-raw";
import { BuiltInDataType, ColumnType } from "../types";

const convertColumnTypeToTSType = (columnType: ColumnType): string => {
  if (columnType.kind === "array") {
    return `${convertColumnTypeToTSType(columnType.of)}[]`;
  } else if (columnType.kind === "enum") {
    return `(${columnType.values.map((value) => `"${value}"`).join(" | ")})`;
  } else {
    switch (columnType.kind) {
      case "boolean":
        return "boolean";
      case "double precision":
      case "integer":
      case "numeric":
      case "real":
      case "serial":
      case "smallint":
      case "smallserial":
        return "number";
      default:
        return "string";
    }
  }
};

export const cli = new Command("GraphQL Zephyr CLI")
  .description("Generates GraphQL Zephyr view files from SQL files", {
    input: "Glob pattern matching the the SQL files to use",
    output: "Path where to write the generated file",
  })
  .arguments("<input> <output>")
  .option(
    "-c, --connection <dsn>",
    "PostgreSQL connection string (defaults to POSTGRES_DSN environment variable)"
  )
  .action(
    async (
      input: string,
      output: string,
      { connection }: { connection?: string }
    ) => {
      const outputPath = resolvePath(process.cwd(), output);
      const filenames = await globby(input);
      const pool = createPool(
        connection ?? process.env.POSTGRES_DSN ?? "postgres://"
      );
      const views: {
        name: string;
        columns: { [key: string]: ColumnType };
        query: string;
      }[] = [];

      try {
        const enumTypes = (
          await pool.any<{
            name: string;
            values: string;
          }>(sql`
          SELECT
            pg_type.typname "name",
            array_agg(pg_enum.enumlabel) "values"
          FROM pg_type
          INNER JOIN pg_enum ON pg_enum.enumtypid = pg_type.oid
          GROUP BY pg_type.typname;
        `)
        ).map((enumType) => {
          return {
            name: enumType.name,
            values: enumType.values.replace(/\{|\}/g, "").split(","),
          };
        });

        for (const filename of filenames) {
          const viewName = filename
            .split("/")
            .pop()!
            .replace(/\.[a-z0-9]+$/i, "");
          const query = readFileSync(
            resolvePath(process.cwd(), filename),
            "utf-8"
          )
            .trim()
            .replace(/;$/, "");
          try {
            await pool.query(sql`
            CREATE TEMP TABLE ${sql.identifier([viewName])} AS
            ${raw(query)}
          `);
          } catch (error) {
            console.log(
              `Error occurred while parsing SQL query at "${filename}"`
            );

            throw error;
          }

          const { rows: columns } = await pool.query<{
            name: string;
            type: string;
          }>(sql`
            SELECT
              column_name "name",
              udt_name::regtype "type"
            FROM information_schema.columns
            WHERE
              table_name = ${viewName}
          `);
          views.push({
            name: viewName,
            query,
            columns: columns.reduce<{ [key: string]: ColumnType }>(
              (acc, column) => {
                let type: ColumnType = {
                  kind: column.type.replace(/\[\]/g, "") as BuiltInDataType,
                };

                const enumType = enumTypes.find(
                  (enumType) => enumType.name === type.kind
                );
                if (enumType) {
                  type = { kind: "enum", ...enumType };
                }

                let arrayCount = column.type.match(/\[\]/g)?.length ?? 0;

                while (arrayCount > 0) {
                  type = { kind: "array", of: type };
                  arrayCount--;
                }

                acc[column.name] = type;

                return acc;
              },
              {}
            ),
          });
        }
      } finally {
        await pool.end();
      }

      const content = [
        "export const views = {",
        ...views.map((view) => {
          return [
            `  ${view.name}: {`,
            `    name: "${view.name}",`,
            "    query: `",
            ...view.query
              .trim()
              .split("\n")
              .map((line) => `      ${line}`),
            "    `,",
            "    columns: {",
            ...Object.keys(view.columns).map((columnName) => {
              const columnType = view.columns[columnName];
              const lines = stringify(
                columnType,
                function (value, _indent, fn) {
                  if (typeof value === "string") {
                    return '"' + value.replace(/"/g, '\\"') + '"';
                  }

                  return fn(value);
                },
                2
              )!.split("\n");
              const firstLine = lines.shift()!;
              const lastLine = lines.pop()!;
              return [
                `      ${columnName}: ${firstLine}`,
                ...lines.map((line) => `      ${line}`),
                `      ${lastLine} as const,`,
              ].join("\n");
            }),
            "    },",
            `    type: {} as { ${Object.keys(view.columns)
              .map((columnName) => {
                return `${columnName}: ${convertColumnTypeToTSType(
                  view.columns[columnName]
                )}`;
              })
              .join("; ")} },`,
            "  },",
          ].join("\n");
        }),
        "}",
        "",
      ].join("\n");

      writeFileSync(outputPath, content);
    }
  );
