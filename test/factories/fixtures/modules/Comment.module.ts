import { sql } from "slonik";
import { createModel, createRelationships } from "../../../../lib/factories";
import { views } from "../views";

export const model = createModel({
  name: "Comment",
  view: views.Comment,
  fields: ({ field }) => {
    return [
      field({
        name: "id",
      }),
      field({
        name: "body",
      }),
    ];
  },
});

export const relationships = createRelationships(({ oneToOne }) => [
  oneToOne({
    name: "author",
    models: [model, import("./Person.module").then((module) => module.model)],
    join: (comment, person) => sql`${comment.person_id} = ${person.id}`,
  }),
]);
