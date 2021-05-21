import { Comment } from "./Comment";
import { CommentRelationships } from "./CommentRelationships";
import { Node } from "./node";
import { Person } from "./Person";
import { PersonRelationships } from "./PersonRelationships";
import { Post } from "./Post";
import { PostRelationships } from "./PostRelationships";

export const models = { Comment, Node, Person, Post };

export const relationships = [
  ...CommentRelationships,
  ...PersonRelationships,
  ...PostRelationships,
];
