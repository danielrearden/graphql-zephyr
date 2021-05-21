import { sql } from "slonik";
import { createRelationships } from "../../../../lib/factories";
import { Person } from "./Person";
import { Post } from "./Post";

export const PersonRelationships = createRelationships(({ oneToMany }) => [
  oneToMany({
    name: "posts",
    models: [Person, Post],
    join: (person, post) => sql`${person.id} = ${post.person_id}`,
    orderBy: (post) => [[post.id, "ASC"]],
  }),
]);
