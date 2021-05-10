import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Comment = createModel({
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
