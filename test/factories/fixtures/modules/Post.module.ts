import { sql } from "slonik";
import { createModel, createRelationships } from "../../../../lib/factories";
import { views } from "../views";

export const model = createModel({
  name: "Post",
  view: views.Post,
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

export const relationships = createRelationships(
  ({ oneToMany, manyToMany }) => [
    oneToMany({
      name: "comments",
      models: [
        model,
        import("./Comment.module").then((module) => module.model),
      ],
      join: (post, comment) => sql`${post.id} = ${comment.post_id}`,
      orderBy: (comment) => [[comment.id, "ASC"]],
    }),
    manyToMany({
      name: "likedBy",
      models: [model, import("./Person.module").then((module) => module.model)],
      junctionView: views.PostLike,
      join: (post, postLike, person) => [
        sql`${post.id} = $${postLike.post_id}`,
        sql`${postLike.person_id} = ${person.id}`,
      ],
      orderBy: (person) => [[person.id, "ASC"]],
    }),
  ]
);
