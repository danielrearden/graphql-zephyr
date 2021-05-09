import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Comment = createModel({
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
