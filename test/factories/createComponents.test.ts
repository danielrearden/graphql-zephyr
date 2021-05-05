import { makeExecutableSchema } from "@graphql-tools/schema";
import merge from "deepmerge";
import { graphql, GraphQLResolveInfo } from "graphql";
import { createPool, sql } from "slonik";
// @ts-ignore
import { createQueryLoggingInterceptor } from "slonik-interceptor-query-logging";

import { createSchemaComponents } from "../../lib/factories";
import { modules } from "./fixtures/modules";

const POSTGRES_DSN = process.env.POSTGRES_DSN ?? "postgres://";

describe("createComponents", () => {
  const pool = createPool(POSTGRES_DSN, {
    interceptors: [createQueryLoggingInterceptor()],
  });

  test("generates the correct typeDefs and resolvers", async () => {
    const { typeDefs, resolvers } = await createSchemaComponents(modules);
    expect(typeDefs).toMatchInlineSnapshot(`
      "type PageInfo {
        endCursor: String!
        hasNextPage: Boolean!
        hasPreviousPage: Boolean!
        startCursor: String!
      }

      type Comment {
        id: Int!
        body: String!
        author: Person!
      }

      type PersonPostsConnection {
        edges: [PersonPostsEdge!]!
        pageInfo: PageInfo!
      }

      type PersonPostsEdge {
        cursor: String!
        node: Post!
      }

      type Person {
        id: Int!
        fullName: String!
        posts(after: String, before: String, first: Int, last: Int): PersonPostsConnection!
      }

      type PostCommentsConnection {
        edges: [PostCommentsEdge!]!
        pageInfo: PageInfo!
      }

      type PostCommentsEdge {
        cursor: String!
        node: Comment!
      }

      type PostLikedByConnection {
        edges: [PostLikedByEdge!]!
        pageInfo: PageInfo!
      }

      type PostLikedByEdge {
        cursor: String!
        node: Person!
      }

      type Post {
        id: Int!
        body: String!
        comments(after: String, before: String, first: Int, last: Int): PostCommentsConnection!
        likedBy(after: String, before: String, first: Int, last: Int): PostLikedByConnection!
      }"
    `);
    expect(resolvers).toMatchInlineSnapshot(`
      Object {
        "Comment": Object {},
        "Person": Object {
          "fullName": [Function],
          "posts": [Function],
        },
        "Post": Object {
          "comments": [Function],
          "likedBy": [Function],
        },
      }
    `);
  });

  test("builds and executes queries", async () => {
    const {
      typeDefs,
      resolvers,
      createQueryBuilder,
    } = await createSchemaComponents(modules);
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
            const node = await queryBuilder.models.Person.findOne({
              info,
              where: (view) => sql`${view.id} = ${args.id}`,
            });
            console.log(node);
            return node;
          },
        },
      }),
    });
    const { data, errors } = await graphql(
      schema,
      `
        {
          person(id: 1) {
            id
            fullName
            posts {
              edges {
                node {
                  id
                }
              }
            }
          }
        }
      `
    );
    console.log("data", data);
    console.log("errors", errors);
  });

  afterAll(async () => {
    await pool.end();
  });
});
