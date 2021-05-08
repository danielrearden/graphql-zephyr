import { makeExecutableSchema } from "@graphql-tools/schema";
import merge from "deepmerge";
import { graphql, GraphQLResolveInfo } from "graphql";
import { createPool, sql } from "slonik";
// @ts-ignore
import { createQueryLoggingInterceptor } from "slonik-interceptor-query-logging";

import { createSchemaComponents } from "../../lib/factories";
import { models, relationships } from "./fixtures/modules";

const POSTGRES_DSN = process.env.POSTGRES_DSN ?? "postgres://";

describe("createComponents", () => {
  const pool = createPool(POSTGRES_DSN, {
    interceptors: [createQueryLoggingInterceptor()],
  });

  test.only("generates the correct typeDefs and resolvers", async () => {
    const { typeDefs, resolvers, schema } = createSchemaComponents({
      models,
      relationships,
    });
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
    expect(schema).toMatchInlineSnapshot(`
      GraphQLSchema {
        "__validationErrors": undefined,
        "_directives": Array [
          "@include",
          "@skip",
          "@deprecated",
          "@specifiedBy",
        ],
        "_implementationsMap": Object {},
        "_mutationType": undefined,
        "_queryType": undefined,
        "_subTypeMap": Object {},
        "_subscriptionType": undefined,
        "_typeMap": Object {
          "Boolean": "Boolean",
          "Comment": "Comment",
          "Int": "Int",
          "PageInfo": "PageInfo",
          "Person": "Person",
          "PersonPostsConnection": "PersonPostsConnection",
          "PersonPostsEdge": "PersonPostsEdge",
          "Post": "Post",
          "PostCommentsConnection": "PostCommentsConnection",
          "PostCommentsEdge": "PostCommentsEdge",
          "PostLikedByConnection": "PostLikedByConnection",
          "PostLikedByEdge": "PostLikedByEdge",
          "String": "String",
          "__Directive": "__Directive",
          "__DirectiveLocation": "__DirectiveLocation",
          "__EnumValue": "__EnumValue",
          "__Field": "__Field",
          "__InputValue": "__InputValue",
          "__Schema": "__Schema",
          "__Type": "__Type",
          "__TypeKind": "__TypeKind",
        },
        "astNode": undefined,
        "description": undefined,
        "extensionASTNodes": Array [],
        "extensions": undefined,
      }
    `);
  });

  test("builds and executes queries", async () => {
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
