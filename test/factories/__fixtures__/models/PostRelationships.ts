import { sql } from "slonik";
import { createRelationships } from "../../../../lib/factories";
import { views } from "../views";
import { Comment } from "./Comment";
import { Person } from "./Person";
import { Post } from "./Post";

export const PostRelationships = createRelationships(
  ({ oneToMany, manyToMany }) => [
    oneToMany({
      name: "comments",
      models: [Post, Comment],
      join: (post, comment) => sql`${post.id} = ${comment.post_id}`,
      orderBy: (comment) => [[comment.id, "ASC"]],
    }),
    manyToMany({
      name: "likedBy",
      models: [Post, Person],
      junctionView: views.PostLike,
      join: (post, postLike, person) => [
        sql`${post.id} = ${postLike.post_id}`,
        sql`${postLike.person_id} = ${person.id}`,
      ],
      orderBy: (person) => [[person.id, "ASC"]],
    }),
  ]
);
