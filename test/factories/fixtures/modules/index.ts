import { Comment } from "./Comment";
import { CommentRelationships } from "./CommentRelationships";
import { Person } from "./Person";
import { PersonRelationships } from "./PersonRelationships";
import { Post } from "./Post";
import { PostRelationships } from "./PostRelationships";

export const models = { Comment, Person, Post };

export const relationships = [
  ...CommentRelationships,
  ...PersonRelationships,
  ...PostRelationships,
];
