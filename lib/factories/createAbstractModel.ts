import { AbstractModel, Model } from "../types";

export const createAbstractModel = <
  TFields extends string,
  TModel extends Model<any, any, TFields>
>({
  name,
  models,
  commonFields,
}: AbstractModel<TFields, TModel>): AbstractModel<TFields, TModel> => {
  return { name, models, commonFields };
};
