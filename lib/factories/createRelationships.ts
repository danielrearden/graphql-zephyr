import {
  AbstractModel,
  ManyToManyRelationship,
  Model,
  OneToManyRelationship,
  OneToOneRelationship,
  RelationshipConfig,
  View,
} from "../types";

export const createRelationships = (
  factory: (utilities: {
    manyToMany: <
      TModelA extends Model<any, any, any>,
      TModelB extends Model<any, any, any> | AbstractModel<any, any>,
      TView extends View,
      TFields extends string
    >(
      relationship: ManyToManyRelationship<TModelA, TModelB, TView, TFields>
    ) => RelationshipConfig;
    oneToMany: <
      TModelA extends Model<any, any, any>,
      TModelB extends Model<any, any, any> | AbstractModel<any, any>
    >(
      relationship: OneToManyRelationship<TModelA, TModelB>
    ) => RelationshipConfig;
    oneToOne: <
      TModelA extends Model<any, any, any>,
      TModelB extends Model<any, any, any> | AbstractModel<any, any>
    >(
      relationship: OneToOneRelationship<TModelA, TModelB>
    ) => RelationshipConfig;
  }) => RelationshipConfig[]
): RelationshipConfig[] => {
  return factory({
    manyToMany: (relationship: ManyToManyRelationship<any, any, any, any>) => {
      return { ...relationship, type: "MANY_TO_MANY" };
    },
    oneToMany: (relationship: OneToManyRelationship<any, any>) => {
      return { ...relationship, type: "ONE_TO_MANY" };
    },
    oneToOne: (relationship: OneToOneRelationship<any, any>) => {
      return { ...relationship, type: "ONE_TO_ONE" };
    },
  });
};
