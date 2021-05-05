# GraphQL Sprout

> Grow SQL queries from the root up! 🌱

## Usage

**Step 1:** Specify the views that will be used by your models using plain SQL

```sql
-- views/Person.sql

SELECT
  id,
  full_name
FROM person
```

Here we're using a single table, but views can be queries of arbitrary complexity, including joins, subqueries, etc.

**Step 2:** Generate the views from the SQL files using the CLI

```shell
graphql-sprout views/*.sql generated/views.ts
```

This creates a TypeScript file for you like this:

```typescript
export const views = {
  Person: {
    name: "Person",
    query: `
      SELECT
        id,
        full_name
      FROM person;
    `,
    columns: {
      id: {
        kind: "integer",
      } as const,
      full_name: {
        kind: "text",
      } as const,
    },
    type: {} as { id: number; full_name: string },
  },
  // and more...
};
```

**Step 3:** Create your models, specifying both fields and relationships with other models

```typescript
// Person.module.ts

import { sql } from "slonik";
import { createModel, createRelationships } from "graphql-sprout";
import { views } from "../views";

export const model = createModel({
  name: "Person",
  view: views.Person,
  fields: ({ field, virtualField }) => {
    return [
      // Regular fields map directly to columns in your view
      field({
        name: "id",
      }),
      // Virtual fields let you specify a dependency on one or more columns and provide custom resolver logic
      virtualField({
        name: "fullName",
        // Note: this is an arbitrary example. In practice, you'd just return "fullName" as a column on your view.
        columns: ["full_name"],
        // The resolver here is correctly typed based on the generated view
        resolve: ({ full_name }) => full_name,
        // For regular columns, the types are implied from the view columns, but here we have to specify our own
        type: "String!",
      }),
    ];
  },
});

export const relationships = createRelationships(({ oneToMany }) => [
  oneToMany({
    name: "posts",
    // We can pass a Promise here so that we can use dynamic imports and avoid issues with circular dependencies
    models: [model, import("./Post.module").then((module) => module.model)],
    // How the two models will be joined by the query builder. Each parameter here is typed based on the model's associated view columns
    join: (person, post) => sql`${person.id} = ${post.person_id}`,
  }),
]);
```

**Step 4:** Use your models to generate components for a base GraphQL schema

```typescript
import { createSchemaComponents } from "graphql-sprout";
import * as Person from "./Person.module";
import * as Post from "./Post.module";

const {
  typeDefs,
  resolvers,
  createQueryBuilder,
} = await createSchemaComponents({ Person, Post });
```

This generates base type definitions and resolvers that you can build on top of when creating your schema.

```graphql
type PageInfo {
  endCursor: String!
  hasNextPage: Boolean!
  hasPreviousPage: Boolean!
  startCursor: String!
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
  posts(
    after: String
    before: String
    first: Int
    last: Int
  ): PersonPostsConnection!
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
  likedBy(
    after: String
    before: String
    first: Int
    last: Int
  ): PostLikedByConnection!
}
```

**Step 5:** Use the query builder inside your schema to generate complete SQL queries right from the root of your schema.

```typescript
import { createPool } from "slonik";

const pool = createPool("postgres://");
const queryBuilder = createQueryBuilder(pool);
```

Then in your resolver:

```typescript
function resolve(parent, args, ctx, info) {
  return ctx.queryBuilder.models.Person.getRelayConnection({
    info,
    where: (person) => sql`${person.full_name} ilike 'c%'`,
    orderBy: (person) => [[person.id, "DESC"]],
  });
}
```

The query builder will inspect your request using the `info` parameter and build a single database query based on it.
