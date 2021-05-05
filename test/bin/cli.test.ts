import { readFileSync, unlinkSync } from "fs";
import { createPool, sql } from "slonik";
import { cli } from "../../lib/bin/cli";

const POSTGRES_DSN = process.env.POSTGRES_DSN ?? "postgres://";

describe("cli", () => {
  const pool = createPool(POSTGRES_DSN);
  beforeAll(async () => {
    await pool.query(sql`
      DO $$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'mood') THEN
          CREATE TYPE mood AS ENUM ('sad', 'ok', 'happy');
        END IF;
      END$$;
    `);

    await pool.query(sql`
      CREATE TABLE IF NOT EXISTS test_table (
        a varchar(10), b char(3), c int4, d integer[], e numeric, f mood, g mood[]
      );
    `);
  });

  test("basic functionality", async () => {
    await cli.parseAsync([
      "/usr/local/bin/node",
      "/bin/index.js",
      "test/bin/fixtures/views/*.sql",
      "test/temp/views.ts",
    ]);

    const views = readFileSync("test/temp/views.ts", "utf-8");

    expect(views).toMatchInlineSnapshot(`
      "export const views = {
        TestView: {
          name: \\"TestView\\",
          query: \`
            SELECT
              a, b, c, d, e, f, g
            FROM test_table;
          \`,
          columns: {
            a: {
              kind: \\"character varying\\"
            } as const,
            b: {
              kind: \\"character\\"
            } as const,
            c: {
              kind: \\"integer\\"
            } as const,
            d: {
              kind: \\"array\\",
              of: {
                kind: \\"integer\\"
              }
            } as const,
            e: {
              kind: \\"numeric\\"
            } as const,
            f: {
              kind: \\"enum\\",
              name: \\"mood\\",
              values: [
                \\"sad\\",
                \\"ok\\",
                \\"happy\\"
              ]
            } as const,
            g: {
              kind: \\"array\\",
              of: {
                kind: \\"enum\\",
                name: \\"mood\\",
                values: [
                  \\"sad\\",
                  \\"ok\\",
                  \\"happy\\"
                ]
              }
            } as const,
          },
          type: {} as { a: string; b: string; c: number; d: number[]; e: number; f: (\\"sad\\" | \\"ok\\" | \\"happy\\"); g: (\\"sad\\" | \\"ok\\" | \\"happy\\")[] },
        },
      }
      "
    `);
  });

  afterAll(async () => {
    unlinkSync("test/temp/views.ts");

    await pool.query(sql`
      DROP TABLE IF EXISTS test_table;

      DROP TYPE IF EXISTS mood;
    `);

    await pool.end();
  });
});
