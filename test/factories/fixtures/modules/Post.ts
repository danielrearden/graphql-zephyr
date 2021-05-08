import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Post = createModel({
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
