import { makeExecutableSchema } from "@graphql-tools/schema";
import merge from "deepmerge";
import { graphql, GraphQLResolveInfo } from "graphql";
import { createPool, sql } from "slonik";
// @ts-ignore
import { createQueryLoggingInterceptor } from "slonik-interceptor-query-logging";
import { createSchemaComponents } from "../../lib/factories";
import { models, relationships } from "./__fixtures__/models";
import data from "./__fixtures__/data.json";
import { fromGlobalId, toGlobalId } from "../../lib/utilities";

const POSTGRES_DSN = process.env.POSTGRES_DSN ?? "postgres://";

describe("createComponents", () => {
  const pool = createPool(POSTGRES_DSN, {
    interceptors: [createQueryLoggingInterceptor()],
  });

  beforeAll(async () => {
    await pool.query(sql`
      CREATE TABLE person (
        id serial PRIMARY KEY,
        full_name text NOT NULL
      );
      CREATE TABLE post (
        id serial PRIMARY KEY,
        body text NOT NULL,
        person_id integer NOT NULL REFERENCES person (id)
      );
      CREATE TABLE comment (
        id serial PRIMARY KEY,
        body text NOT NULL,
        person_id integer NOT NULL REFERENCES person (id),
        post_id integer NOT NULL REFERENCES post (id)
      );
      CREATE TABLE post_like (
        id serial PRIMARY KEY,
        liked_at timestamptz DEFAULT now(),
        person_id integer NOT NULL REFERENCES person (id),
        post_id integer NOT NULL REFERENCES post (id)
      );
      CREATE INDEX ON post (person_id);
      CREATE INDEX ON comment (person_id);
      CREATE INDEX ON comment (post_id);
      CREATE INDEX ON post_like (person_id);
      CREATE INDEX ON post_like (post_id);
    `);
    await pool.query(sql`
      INSERT INTO person (id, full_name)
      SELECT * FROM ${sql.unnest(data.person, ["int4", "text"])};
    `);
    await pool.query(sql`
      INSERT INTO post (id, body, person_id)
      SELECT * FROM ${sql.unnest(data.post, ["int4", "text", "int4"])};
    `);
    await pool.query(sql`
      INSERT INTO comment (id, body, person_id, post_id)
      SELECT * FROM ${sql.unnest(data.comment, [
        "int4",
        "text",
        "int4",
        "int4",
      ])};
    `);
    await pool.query(sql`
      INSERT INTO post_like (id, person_id, post_id)
      SELECT * FROM ${sql.unnest(data.post_like, ["int4", "int4", "int4"])};
    `);
  });

  test("type definition and resolver generation", async () => {
    const { typeDefs, resolvers, schema } = createSchemaComponents({
      models,
      relationships,
    });
    expect(typeDefs).toMatchSnapshot();
    expect(resolvers).toMatchSnapshot();
    expect(schema).toMatchSnapshot();
  });

  test("findOne", async () => {
    const { typeDefs, resolvers, createQueryBuilder } = createSchemaComponents({
      models,
      relationships,
    });
    const queryBuilder = createQueryBuilder(pool);
    const schema = makeExecutableSchema({
      typeDefs: [
        typeDefs,
        `
          type Query {
            person(id: ID!): Person
          }
        `,
      ],
      resolvers: merge(resolvers, {
        Query: {
          person: async (
            _root: any,
            args: any,
            _ctx: any,
            info: GraphQLResolveInfo
          ) => {
            return queryBuilder.models.Person.findOne({
              info,
              where: (view) => sql`${view.id} = ${fromGlobalId(args.id).id}`,
            });
          },
        },
      }),
    });
    const { data, errors } = await graphql(
      schema,
      `
        {
          person(id: "${toGlobalId("Person", 1)}") {
            id
            fullName
            posts {
              pageInfo {
                ...PageInfoFragment
              }
              edges {
                cursor
                node {
                  id
                  body
                  comments {
                    pageInfo {
                      ...PageInfoFragment
                    }
                    edges {
                      cursor
                      node {
                        id
                        body
                        author {
                          id
                          fullName
                        }
                      }
                    }
                  }
                  likedBy {
                    pageInfo {
                      ...PageInfoFragment
                    }
                    edges {
                      likedAt
                      cursor
                      node {
                        id
                        fullName
                      }
                    }
                  }
                }
              }
            }
          }
        }

        fragment PageInfoFragment on PageInfo {
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
      `
    );
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();
  });

  test("getRelayConnection", async () => {
    const { typeDefs, resolvers, createQueryBuilder } = createSchemaComponents({
      models,
      relationships,
    });
    const queryBuilder = createQueryBuilder(pool);
    const schema = makeExecutableSchema({
      typeDefs: [
        typeDefs,
        `
          type Query {
            people(first: Int, after: String): PersonConnection!
          }
        `,
      ],
      resolvers: merge(resolvers, {
        Query: {
          people: async (
            _root: any,
            _args: any,
            _ctx: any,
            info: GraphQLResolveInfo
          ) => {
            return queryBuilder.models.Person.getRelayConnection({
              info,
              orderBy: (view) => [[view.full_name, "DESC"]],
            });
          },
        },
      }),
    });
    const { data, errors } = await graphql(
      schema,
      `
        {
          people(first: 3) {
            pageInfo {
              ...PageInfoFragment
            }
            edges {
              cursor
              node {
                id
                fullName
                posts {
                  pageInfo {
                    ...PageInfoFragment
                  }
                  edges {
                    cursor
                    node {
                      id
                      body
                    }
                  }
                }
              }
            }
          }
        }

        fragment PageInfoFragment on PageInfo {
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
      `
    );
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();
  });

  test("forward pagination", async () => {
    const { typeDefs, resolvers, createQueryBuilder } = createSchemaComponents({
      models,
      relationships,
    });
    const queryBuilder = createQueryBuilder(pool);
    const schema = makeExecutableSchema({
      typeDefs: [
        typeDefs,
        `
          type Query {
            post(id: ID!): Post
          }
        `,
      ],
      resolvers: merge(resolvers, {
        Query: {
          post: async (
            _root: any,
            args: any,
            _ctx: any,
            info: GraphQLResolveInfo
          ) => {
            return queryBuilder.models.Post.findOne({
              info,
              where: (view) => sql`${view.id} = ${fromGlobalId(args.id).id}`,
            });
          },
        },
      }),
    });
    const { data, errors } = await graphql(
      schema,
      `
        {
          post(id: "${toGlobalId("Post", 67)}") {
            a: comments(first: 2) {
              ...CommentFragment
            }
            b: comments(first: 1, after: "WzEyXQ==") {
              ...CommentFragment
            }
            c: comments(first: 2, after: "WzEyXQ==") {
              ...CommentFragment
            }
            d: comments(first: 2, after: "WzY2XQ==") {
              ...CommentFragment
            }
          }
        }

        fragment CommentFragment on PostCommentsConnection {
          pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
          }
          edges {
            cursor
            node {
              id
              body
            }
          }
        }
      `
    );
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();
  });

  test("backward pagination", async () => {
    const { typeDefs, resolvers, createQueryBuilder } = createSchemaComponents({
      models,
      relationships,
    });
    const queryBuilder = createQueryBuilder(pool);
    const schema = makeExecutableSchema({
      typeDefs: [
        typeDefs,
        `
          type Query {
            post(id: ID!): Post
          }
        `,
      ],
      resolvers: merge(resolvers, {
        Query: {
          post: async (
            _root: any,
            args: any,
            _ctx: any,
            info: GraphQLResolveInfo
          ) => {
            return queryBuilder.models.Post.findOne({
              info,
              where: (view) => sql`${view.id} = ${fromGlobalId(args.id).id}`,
            });
          },
        },
      }),
    });
    const { data, errors } = await graphql(
      schema,
      `
        {
          post(id: "${toGlobalId("Post", 67)}") {
            a: comments(last: 2) {
              ...CommentFragment
            }
            b: comments(last: 1, before: "WzY2XQ==") {
              ...CommentFragment
            }
            c: comments(last: 2, before: "WzY2XQ==") {
              ...CommentFragment
            }
            d: comments(last: 2, before: "WzEyXQ==") {
              ...CommentFragment
            }
          }
        }

        fragment CommentFragment on PostCommentsConnection {
          pageInfo {
            startCursor
            endCursor
            hasNextPage
            hasPreviousPage
          }
          edges {
            cursor
            node {
              id
              body
            }
          }
        }
      `
    );
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();
  });

  test("abstract models", async () => {
    const { typeDefs, resolvers, createQueryBuilder } = createSchemaComponents({
      models,
      relationships,
    });
    const queryBuilder = createQueryBuilder(pool);
    const schema = makeExecutableSchema({
      typeDefs: [
        typeDefs,
        `
        type Query {
          node(id: ID!): Node
        }
      `,
      ],
      resolvers: merge(resolvers, {
        Query: {
          node: async (
            _root: any,
            args: any,
            _ctx: any,
            info: GraphQLResolveInfo
          ) => {
            return queryBuilder.models.Node.findOne({
              info,
              where: (view) => {
                const { id, typeName } = fromGlobalId(args.id);
                return sql`${view.__typename} = ${typeName} AND ${view.id} = ${id}`;
              },
            });
          },
        },
      }),
    });
    const { data, errors } = await graphql(
      schema,
      `
        {
          a: node(id: "${toGlobalId("Post", 1)}") {
            id
            ... on Post {
              body
            }
            ... on Person {
              fullName
            }
          }
          b: node(id: "${toGlobalId("Person", 1)}") {
            id
            ... on Post {
              body
            }
            ... on Person {
              fullName
            }
          }
        }
      `
    );
    expect(errors).toBeUndefined();
    expect(data).toMatchSnapshot();
  });

  afterAll(async () => {
    await pool.query(sql`
      DROP TABLE post_like;
      DROP TABLE comment;
      DROP TABLE post;
      DROP TABLE person;
    `);

    await pool.end();
  });
});
