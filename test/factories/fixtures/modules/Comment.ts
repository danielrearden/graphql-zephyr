import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Comment = createModel({
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
