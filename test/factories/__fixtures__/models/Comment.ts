import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Comment = createModel({
  name: "Comment",
  view: views.Comment,
  fields: ({ field }) => {
    return {
      id: field({
        column: "id",
      }),
      body: field({
        column: "body",
      }),
    };
  },
});
