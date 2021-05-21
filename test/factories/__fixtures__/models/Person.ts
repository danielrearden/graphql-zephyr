import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Person = createModel({
  name: "Person",
  view: views.Person,
  fields: ({ field }) => {
    return {
      id: field({
        column: "id",
      }),
      fullName: field({
        columns: ["full_name"],
        resolve: ({ full_name }) => full_name,
        type: "String!",
      }),
    };
  },
});
