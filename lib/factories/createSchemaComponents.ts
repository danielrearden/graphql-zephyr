import { buildSchema, GraphQLResolveInfo, GraphQLSchema } from "graphql";
import {
  DatabasePoolType,
  sql,
  SqlTokenType,
  TaggedTemplateLiteralInvocationType,
} from "slonik";
import { raw } from "slonik-sql-tag-raw";
import {
  BuiltInDataType,
  ColumnType,
  FieldInfo,
  Model,
  OrderByDirection,
  QueryBuilder,
  QueryBuilderContext,
  QueryBuilderRelationshipMap,
  RelationshipConfig,
  View,
} from "../types";
import {
  formatEnumName,
  fromCursor,
  getIdentifierMap,
  parseResolveInfo,
  toCursor,
  upperFirst,
} from "../utilities";

// @todo make this configurable
const DEFAULT_LIMIT = 500;

const ORDER_BY_DIRECTION = {
  ASC: sql`ASC`,
  DESC: sql`DESC`,
} as const;

const convertViewColumnTypeToGraphQLType = (
  columnType: ColumnType,
  customTypeMapper: { [key in BuiltInDataType]?: string } = {}
): string => {
  if (columnType.kind === "array") {
    return `[${convertViewColumnTypeToGraphQLType(
      columnType.of,
      customTypeMapper
    )}!]`;
  } else if (columnType.kind === "enum") {
    return formatEnumName(columnType.name);
  } else {
    const customType = customTypeMapper[columnType.kind];
    if (customType) {
      return customType;
    }

    switch (columnType.kind) {
      case "boolean":
        return "Boolean";
      case "double precision":
      case "numeric":
      case "real":
        return "Float";
      case "integer":
      case "serial":
      case "smallint":
      case "smallserial":
        return "Int";
    }
  }

  return "String";
};

export const createSchemaComponents = <
  TModels extends Record<string, Model<any>>
>({
  models,
  relationships,
  customTypeMapper,
}: {
  models: TModels;
  relationships: RelationshipConfig[];
  customTypeMapper?: { [key in BuiltInDataType]?: string };
}): {
  createQueryBuilder: (pool: DatabasePoolType) => QueryBuilder<TModels>;
  resolvers: Record<string, any>;
  schema: GraphQLSchema;
  typeDefs: string;
} => {
  const modelInfo = {} as Record<
    string,
    {
      columnsByField: Record<string, string[]>;
      relationshipMap: QueryBuilderRelationshipMap;
    }
  >;
  const resolvers: any = {};
  const typeDefinitions = [
    [
      "type PageInfo {",
      "  endCursor: String!",
      "  hasNextPage: Boolean!",
      "  hasPreviousPage: Boolean!",
      "  startCursor: String!",
      "}",
    ].join("\n"),
  ];
  const enumTypes = new Map<string, string>();

  for (const model of Object.values(models)) {
    const view: View = model.view;
    const fieldDefinitions = [];
    const fields = model.fields({
      field: (options) => ({
        ...options,
        name: options.name as string,
        column: options.name as string,
        isVirtual: false,
      }),
      virtualField: (options) => ({
        ...options,
        name: options.name as string,
        columns: options.columns as string[],
        isVirtual: true,
      }),
    });
    const columnsByField: Record<string, string[]> = {};
    const relationshipMap: QueryBuilderRelationshipMap = {};

    // Add the type to the resolver map
    resolvers[model.name] = {};

    // Add regular and virtual fields to the field definitions for the type
    for (const field of fields) {
      let type = field.type;

      if (!field.isVirtual && !type) {
        type = `${convertViewColumnTypeToGraphQLType(
          view.columns[field.name],
          customTypeMapper
        )}${field.nullable ? "" : "!"}`;
      }

      fieldDefinitions.push(`  ${field.name}: ${type}`);

      // If a custom resolver was provided, add it to the resolver map
      if (field.resolve) {
        resolvers[model.name][field.name] = field.resolve;
      }

      // Capture column dependencies for each field
      columnsByField[field.name] = field.isVirtual
        ? field.columns
        : [field.name];
    }

    // Add field definitions for each relationships and any related type definitions
    const modelRelationships = relationships.filter(
      ({ models }) => models[0].name === model.name
    );
    for (const relationship of modelRelationships) {
      const relatedModel = relationship.models[1];

      // @todo support returning a plain list instead of always returning a Relay Connection
      if (relationship.type === "ONE_TO_ONE") {
        fieldDefinitions.push(
          `  ${relationship.name}${
            relationship.args ? `(${relationship.args})` : ""
          }: ${relatedModel.name}${Boolean(relationship.nullable) ? "" : "!"}`
        );
      } else {
        const connectionTypePrefix =
          relationship.connectionTypePrefix ??
          `${model.name}${upperFirst(relationship.name)}`;
        const connectionTypeName = connectionTypePrefix + "Connection";
        const edgeTypeName = connectionTypePrefix + "Edge";

        // @todo allow pagination parameters to be customized
        fieldDefinitions.push(
          `  ${
            relationship.name
          }(after: String, before: String, first: Int, last: Int${
            relationship.args ? `, ${relationship.args}` : ""
          }): ${connectionTypeName}!`
        );

        // Add the connection and edge types to the type definitions
        typeDefinitions.push(
          [
            `type ${connectionTypeName} {`,
            `  edges: [${edgeTypeName}!]!`,
            "  pageInfo: PageInfo!",
            "}",
          ].join("\n"),
          [
            `type ${edgeTypeName} {`,
            `  cursor: String!`,
            `  node: ${relatedModel.name}!`,
            "}",
          ].join("\n")
        );

        // Add resolver logic for the connection field
        resolvers[model.name][relationship.name] = (
          source: any,
          args: any,
          _ctx: any,
          info: GraphQLResolveInfo
        ) => {
          // Note: If an alias was used, the query builder will return the data under that property name instead.
          const alias = info.path.key;
          const { aggregates, edges: originalEdges = [] } = source[alias] as {
            aggregates?: any;
            edges?: { cursor: any[]; node: any }[];
          };
          const { after, before, first, last } = args;

          // If last or before are not present, we assume forward pagination
          const isBackwardPagination = last != null || before != null;
          const limit = (isBackwardPagination ? last : first) ?? DEFAULT_LIMIT;
          const hasMore = originalEdges.length > limit;
          const edges = originalEdges.slice(0, limit).map((edge) => {
            return {
              cursor: toCursor(edge.cursor),
              node: edge.node,
            };
          });

          if (isBackwardPagination) {
            edges.reverse();
          }

          const pageInfo = {
            endCursor: edges[edges.length - 1]?.cursor ?? null,
            hasNextPage: isBackwardPagination ? before != null : hasMore,
            hasPreviousPage: isBackwardPagination ? hasMore : after != null,
            startCursor: edges[0]?.cursor ?? null,
          };

          return {
            ...aggregates,
            edges,
            pageInfo,
          };
        };
      }

      // Capture the relationship details so they can be used by the query builder
      relationshipMap[relationship.name] = {
        model: relatedModel,
        ...relationship,
      };
    }

    // Add the type for the model to the type definitions
    // @todo allow additional properties to be exposed on each edge
    typeDefinitions.push(
      [`type ${model.name} {`, ...fieldDefinitions, "}"].join("\n"),
      [
        `type ${model.name}Connection {`,
        `  edges: [${model.name}Edge!]!`,
        "  pageInfo: PageInfo!",
        "}",
      ].join("\n"),
      [
        `type ${model.name}Edge {`,
        `  cursor: String!`,
        `  node: ${model.name}!`,
        "}",
      ].join("\n")
    );

    modelInfo[model.name] = { columnsByField, relationshipMap };

    // Generate a GraphQL enum for any Postgres enum type used in the view
    for (let columnType of Object.values(view.columns)) {
      // We want to get the underlying element type if the original type is an array
      while (columnType.kind === "array") {
        columnType = columnType.of;
      }

      if (columnType.kind === "enum" && !enumTypes.has(columnType.name)) {
        enumTypes.set(
          columnType.name,
          [
            `enum ${formatEnumName(columnType.name)} {`,
            ...columnType.values.map((value) => `  ${value}`),
            "}",
          ].join("\n")
        );
      }
    }
  }

  const buildNodeJsonObject = (
    model: Model<View>,
    tableAlias: string,
    fieldInfo: FieldInfo | undefined,
    context: QueryBuilderContext
  ): SqlTokenType => {
    if (!fieldInfo) {
      return sql`json_build_object()`;
    }

    const { getIdentifier } = context;
    const { columnsByField, relationshipMap } = modelInfo[model.name];

    const jsonBuildObjectArgs = [];
    const selectedColumns = new Map<string, string>();
    for (const selectedField of Object.values(fieldInfo.fields)) {
      if (columnsByField[selectedField.name]) {
        columnsByField[selectedField.name].forEach((column) => {
          selectedColumns.set(column, column);
        });
      } else if (relationshipMap[selectedField.name]) {
        const relationship = relationshipMap[selectedField.name];
        const otherTableAlias = getIdentifier(relationship.model.view.name);

        if (relationship.type === "ONE_TO_ONE") {
          const where = relationship.join(
            getIdentifierMap(tableAlias, model.view.columns),
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );
          jsonBuildObjectArgs.push(
            raw(`'${selectedField.alias}'`),
            sql`(${buildNodeQuery(
              relationship.model,
              otherTableAlias,
              selectedField,
              where,
              context
            )})`
          );
        } else if (relationship.type === "ONE_TO_MANY") {
          const where = relationship.join(
            getIdentifierMap(tableAlias, model.view.columns),
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );
          const orderBy = relationship.orderBy(
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );

          jsonBuildObjectArgs.push(
            raw(`'${selectedField.alias}'`),
            sql`(${buildRelayConnectionQuery(
              relationship.model,
              otherTableAlias,
              selectedField,
              where,
              orderBy,
              context
            )})`
          );
        } else if (relationship.type === "MANY_TO_MANY") {
          const junctionAlias = getIdentifier(relationship.junctionView.name);
          const where = relationship.join(
            getIdentifierMap(tableAlias, model.view.columns),
            getIdentifierMap(junctionAlias, relationship.junctionView.columns),
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );
          const orderBy = relationship.orderBy(
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            getIdentifierMap(junctionAlias, relationship.junctionView.columns),
            selectedField.args
          );
          jsonBuildObjectArgs.push(
            raw(`'${selectedField.alias}'`),
            sql`(${buildJunctionRelayConnectionQuery(
              relationship.model,
              otherTableAlias,
              relationship.junctionView,
              junctionAlias,
              selectedField,
              where,
              orderBy,
              context
            )})`
          );
        }
      }
    }
    for (const column of selectedColumns.values()) {
      jsonBuildObjectArgs.push(
        raw(`'${column}'`),
        sql.identifier([tableAlias, column])
      );
    }

    return sql`json_build_object(${sql.join(jsonBuildObjectArgs, sql`, `)})`;
  };

  const buildNodeQuery = (
    model: Model<View>,
    tableAlias: string,
    fieldInfo: FieldInfo,
    where: SqlTokenType,
    context: QueryBuilderContext
  ): TaggedTemplateLiteralInvocationType<any> => {
    // Add the view to all views used by the query
    const { views } = context;
    if (!views.has(model.view.name)) {
      views.set(model.view.name, model.view);
    }

    return sql`
      SELECT
        ${buildNodeJsonObject(model, tableAlias, fieldInfo, context)}
      FROM ${sql.identifier([model.view.name])} ${sql.identifier([tableAlias])}
      WHERE
        ${where}
      LIMIT 1
    `;
  };

  const buildRelayConnectionQuery = (
    model: Model<View>,
    tableAlias: string,
    fieldInfo: FieldInfo,
    where: SqlTokenType,
    orderBy: [SqlTokenType, OrderByDirection][],
    context: QueryBuilderContext
  ): TaggedTemplateLiteralInvocationType<any> => {
    // Add the view to all views used by the query
    const { views } = context;
    if (!views.has(model.view.name)) {
      views.set(model.view.name, model.view);
    }

    const shouldFetchAggregates = Boolean(fieldInfo.fields["count"]);
    const shouldFetchEdges = Boolean(
      fieldInfo.fields["edges"] || fieldInfo.fields["pageInfo"]
    );
    const orderByExpression = sql.join(
      orderBy.map(
        ([expression, direction]) =>
          sql`${expression} ${ORDER_BY_DIRECTION[direction]}`
      ),
      sql`, `
    );
    const { after, before, first, last } = fieldInfo.args;
    const isBackwardPagination = last != null || before != null;
    const limit = (isBackwardPagination ? last : first) ?? DEFAULT_LIMIT;
    const cursor = before || after;

    let cursorConditions: SqlTokenType = sql`true`;
    if (cursor) {
      const values = fromCursor(cursor);
      cursorConditions = sql.join(
        orderBy.map((_expression, outerIndex) => {
          const expressions = orderBy.slice(0, outerIndex + 1);

          return sql`(${sql.join(
            expressions.map(([expression, direction], innerIndex) => {
              let comparisonOperator = sql`=`;
              if (innerIndex === expressions.length - 1) {
                comparisonOperator =
                  direction === (isBackwardPagination ? "DESC" : "ASC")
                    ? sql`>`
                    : sql`<`;
              }
              return sql`${expression} ${comparisonOperator} ${
                values[innerIndex] ?? null
              }`;
            }),
            sql` AND `
          )})`;
        }),
        sql` OR `
      );
    }

    const edges = shouldFetchEdges
      ? sql`
        'edges', (
          SELECT
            coalesce(json_agg(
              json_build_object(
                'cursor', json_build_array(${sql.join(
                  orderBy.map(([expression]) => expression),
                  sql`, `
                )}),
                'node', ${buildNodeJsonObject(
                  model,
                  tableAlias,
                  fieldInfo.fields["edges"]?.fields["node"],
                  context
                )}
              )
              ORDER BY ${orderByExpression}
            ), '[]'::json)
          FROM ${sql.identifier([model.view.name])} ${sql.identifier([
          tableAlias,
        ])}
          WHERE
            (${where}) AND (${cursorConditions})
          LIMIT ${limit + 1}
        )
      `
      : null;
    const aggregates = shouldFetchAggregates
      ? sql`
        'aggregates', (
          SELECT
            json_build_object(
              'count', count(*)
            )
          FROM ${sql.identifier([model.view.name])} ${sql.identifier([
          tableAlias,
        ])}
          WHERE
            ${where}
        ),
      `
      : null;

    return sql`
      SELECT
        json_build_object(
          ${sql.join([edges, aggregates].filter(Boolean), sql`,\n`)}
        )
    `;
  };

  const buildJunctionRelayConnectionQuery = (
    model: Model<View>,
    tableAlias: string,
    junctionView: View,
    junctionTableAlias: string,
    fieldInfo: FieldInfo,
    where: [SqlTokenType, SqlTokenType],
    orderBy: [SqlTokenType, OrderByDirection][],
    context: QueryBuilderContext
  ): TaggedTemplateLiteralInvocationType<any> => {
    // Add the views to all views used by the query
    const { views } = context;
    if (!views.has(model.view.name)) {
      views.set(model.view.name, model.view);
    }
    if (!views.has(junctionView.name)) {
      views.set(junctionView.name, junctionView);
    }

    const shouldFetchAggregates = Boolean(fieldInfo.fields["count"]);
    const shouldFetchEdges = Boolean(
      fieldInfo.fields["edges"] || fieldInfo.fields["pageInfo"]
    );
    const orderByExpression = sql.join(
      orderBy.map(
        ([expression, direction]) =>
          sql`${expression} ${ORDER_BY_DIRECTION[direction]}`
      ),
      sql`, `
    );
    const { after, before, first, last } = fieldInfo.args;
    const isBackwardPagination = last != null || before != null;
    const limit = (isBackwardPagination ? last : first) ?? DEFAULT_LIMIT;
    const cursor = before || after;

    let cursorConditions: SqlTokenType = sql`true`;
    if (cursor) {
      const values = fromCursor(cursor);
      cursorConditions = sql.join(
        orderBy.map((_expression, outerIndex) => {
          const expressions = orderBy.slice(0, outerIndex + 1);

          return sql`(${sql.join(
            expressions.map(([expression, direction], innerIndex) => {
              let comparisonOperator = sql`=`;
              if (innerIndex === expressions.length - 1) {
                comparisonOperator =
                  direction === (isBackwardPagination ? "DESC" : "ASC")
                    ? sql`>`
                    : sql`<`;
              }
              return sql`${expression} ${comparisonOperator} ${
                values[innerIndex] ?? null
              }`;
            }),
            sql` AND `
          )})`;
        }),
        sql` OR `
      );
    }

    const edges = shouldFetchEdges
      ? sql`
        'edges', (
          SELECT
            coalesce(json_agg(
              json_build_object(
                'cursor', json_build_array(${sql.join(
                  orderBy.map(([expression]) => expression),
                  sql`, `
                )}),
                'node', ${buildNodeJsonObject(
                  model,
                  tableAlias,
                  fieldInfo.fields["edges"]?.fields["node"],
                  context
                )}
              )
              ORDER BY ${orderByExpression}
            ), '[]'::json)
          FROM ${sql.identifier([model.view.name])} ${sql.identifier([
          tableAlias,
        ])}
          INNER JOIN ${sql.identifier([junctionView.name])} ${sql.identifier([
          junctionTableAlias,
        ])} ON
            ${where[0]} 
          WHERE
            (${where[1]}) AND (${cursorConditions})
          LIMIT ${limit + 1}
        )
      `
      : null;
    const aggregates = shouldFetchAggregates
      ? sql`
        'aggregates', (
          SELECT
            json_build_object(
              'count', count(*)
            )
          FROM FROM ${sql.identifier([model.view.name])} ${sql.identifier([
          tableAlias,
        ])}
          INNER JOIN ${sql.identifier([junctionView.name])} ${sql.identifier([
          junctionTableAlias,
        ])} ON
            ${where[0]} 
          WHERE
            ${where[1]}
        ),
      `
      : null;

    return sql`
      SELECT
        json_build_object(
          ${sql.join([edges, aggregates].filter(Boolean), sql`,\n`)}
        )
    `;
  };

  const createContext = (): QueryBuilderContext => {
    let keyCounts: Record<string, number> = {};

    return {
      getIdentifier: (name: string) => {
        const key = name[0].toLowerCase();
        if (!keyCounts[key]) {
          keyCounts[key] = 1;
        } else {
          keyCounts[key] = keyCounts[key] + 1;
        }

        return `${key}${keyCounts[key]}`;
      },
      views: new Map(),
    };
  };

  const createQueryBuilder = (pool: DatabasePoolType) => {
    return {
      models: Object.keys(models).reduce((acc, modelName) => {
        acc[modelName as keyof TModels] = {
          findOne: async ({ info, where }) => {
            const model = models[modelName];
            const context = createContext();
            const tableAlias = context.getIdentifier(model.view.name);
            const fieldInfo = parseResolveInfo(info)!;

            const query = buildNodeQuery(
              model,
              tableAlias,
              fieldInfo,
              where(getIdentifierMap(tableAlias, model.view.columns) as any),
              context
            );

            return pool.maybeOneFirst(sql`
              WITH
                ${sql.join(
                  Array.from(context.views.values()).map((view) => {
                    return sql`${sql.identifier([view.name])} AS (${raw(
                      view.query
                    )})`;
                  }),
                  sql`,\n`
                )}
              ${query}
            `);
          },
          getRelayConnection: async ({ info, orderBy, where }) => {
            const model = models[modelName];
            const context = createContext();
            const tableAlias = context.getIdentifier(model.view.name);
            const fieldInfo = parseResolveInfo(info)!;

            const query = buildRelayConnectionQuery(
              model,
              tableAlias,
              fieldInfo,
              where
                ? where(getIdentifierMap(tableAlias, model.view.columns) as any)
                : sql`true`,
              orderBy(getIdentifierMap(tableAlias, model.view.columns) as any),
              context
            );

            return pool.oneFirst(sql`
              WITH
                ${sql.join(
                  Array.from(context.views.values()).map((view) => {
                    return sql`${sql.identifier([view.name])} AS (${raw(
                      view.query
                    )})`;
                  }),
                  sql`,\n`
                )}
              ${query}
            `);
          },
        };

        return acc;
      }, {} as QueryBuilder<TModels>["models"]),
    };
  };

  const typeDefs = [...typeDefinitions, ...enumTypes.values()].join("\n\n");
  const schema = buildSchema(typeDefs);

  return {
    createQueryBuilder,
    resolvers,
    typeDefs,
    schema,
  };
};
