import { Model, View } from "../types";

export const createModel = <TView extends View>({
  fields,
  name,
  view,
}: Model<TView>): Model<TView> => {
  return { fields, name, view };
};
