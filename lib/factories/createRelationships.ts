import {
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
      TModelA extends Model<any>,
      TModelB extends Model<any>,
      TView extends View
    >(
      relationship: ManyToManyRelationship<TModelA, TModelB, TView>
    ) => RelationshipConfig;
    oneToMany: <TModelA extends Model<any>, TModelB extends Model<any>>(
      relationship: OneToManyRelationship<TModelA, TModelB>
    ) => RelationshipConfig;
    oneToOne: <TModelA extends Model<any>, TModelB extends Model<any>>(
      relationship: OneToOneRelationship<TModelA, TModelB>
    ) => RelationshipConfig;
  }) => RelationshipConfig[]
): RelationshipConfig[] => {
  return factory({
    manyToMany: <
      TModelA extends Model<any>,
      TModelB extends Model<any>,
      TView extends View
    >(
      relationship: ManyToManyRelationship<TModelA, TModelB, TView>
    ) => {
      return { ...relationship, type: "MANY_TO_MANY" };
    },
    oneToMany: <TModelA extends Model<any>, TModelB extends Model<any>>(
      relationship: OneToManyRelationship<TModelA, TModelB>
    ) => {
      return { ...relationship, type: "ONE_TO_MANY" };
    },
    oneToOne: <TModelA extends Model<any>, TModelB extends Model<any>>(
      relationship: OneToOneRelationship<TModelA, TModelB>
    ) => {
      return { ...relationship, type: "ONE_TO_ONE" };
    },
  });
};
