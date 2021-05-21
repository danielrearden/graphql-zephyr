import { Model, View } from "../types";

export const createModel = <
  TName extends string,
  TView extends View,
  TFields extends string
>({
  name,
  fields,
  view,
}: Model<TName, TView, TFields>): Model<TName, TView, TFields> => {
  return { name, fields, view };
};
