import { sql } from "slonik";
import { createModel, createRelationships } from "../../../../lib/factories";
import { views } from "../views";

export const model = createModel({
  name: "Person",
  view: views.Person,
  fields: ({ field, virtualField }) => {
    return [
      field({
        name: "id",
      }),
      virtualField({
        name: "fullName",
        columns: ["full_name"],
        resolve: ({ full_name }) => full_name,
        type: "String!",
      }),
    ];
  },
});

export const relationships = createRelationships(({ oneToMany }) => [
  oneToMany({
    name: "posts",
    models: [model, import("./Post.module").then((module) => module.model)],
    join: (person, post) => sql`${person.id} = ${post.person_id}`,
    orderBy: (post) => [[post.id, "ASC"]],
  }),
]);
