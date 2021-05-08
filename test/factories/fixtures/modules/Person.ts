import { createModel } from "../../../../lib/factories";
import { views } from "../views";

export const Person = createModel({
  name: "Person",
  view: views.Person,
  fields: ({ field, virtualField }) => {
    return [
      field({
        name: "id",
      }),
      virtualField({
        name: "fullName",
        columns: ["full_name"],
        resolve: ({ full_name }) => full_name,
        type: "String!",
      }),
    ];
  },
});
