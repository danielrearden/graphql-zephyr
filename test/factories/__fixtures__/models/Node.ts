import { createAbstractModel } from "../../../../lib/factories";
import { Comment } from "./Comment";
import { Person } from "./Person";
import { Post } from "./Post";

export const Node = createAbstractModel({
  name: "Node",
  models: [Post, Person, Comment],
  commonFields: ["id"],
});
