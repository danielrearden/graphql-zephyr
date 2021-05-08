import { sql } from "slonik";
import { createRelationships } from "../../../../lib/factories";
import { Comment } from "./Comment";
import { Person } from "./Person";

export const CommentRelationships = createRelationships(({ oneToOne }) => [
  oneToOne({
    name: "author",
    models: [Comment, Person],
    join: (comment, person) => sql`${comment.person_id} = ${person.id}`,
  }),
]);
