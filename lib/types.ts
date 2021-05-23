import { GraphQLResolveInfo } from "graphql";
import { IdentifierSqlTokenType, SqlTokenType } from "slonik";

export type BuiltInDataType =
  | "bigint"
  | "bigserial"
  | "bit"
  | "bit varying"
  | "boolean"
  | "box"
  | "bytea"
  | "character"
  | "character varying"
  | "cidr"
  | "circle"
  | "date"
  | "double precision"
  | "inet"
  | "integer"
  | "interval"
  | "json"
  | "jsonb"
  | "line"
  | "lseg"
  | "macaddr"
  | "macaddr8"
  | "money"
  | "numeric"
  | "path"
  | "pg_lsn"
  | "pg_snapshot"
  | "point"
  | "polygon"
  | "real"
  | "smallint"
  | "smallserial"
  | "serial"
  | "text"
  | "time"
  | "time with time zone"
  | "timestamp"
  | "timestamp with time zone"
  | "tsquery"
  | "tsvector"
  | "txid_snapshot"
  | "uuid"
  | "xml";

export type ColumnType =
  | {
      kind: BuiltInDataType;
    }
  | { kind: "array"; of: ColumnType }
  | { kind: "enum"; name: string; values: string[] };

export type IdentifiersFrom<T> = {
  [Property in keyof T]: IdentifierSqlTokenType;
};

export interface View {
  columns: { [key: string]: ColumnType };
  name: string;
  query: string;
  type: Record<string, any>;
}

export interface Model<TName, TView extends View, TFields extends string> {
  name: TName;
  fields: ModelFields<TView, TFields>;
  view: TView;
}

export interface AbstractModel<
  TFields extends string,
  TModel extends Model<any, any, TFields>
> {
  name: string;
  models: TModel[];
  commonFields: TFields[];
}

export type ModelFields<
  TView extends View,
  TFields extends string
> = (utilities: {
  field: <TColumns extends keyof TView["type"]>(
    options:
      | {
          column: TColumns;
          nullable?: boolean;
          type?: string;
          resolve?: (
            source: Pick<TView["type"], TColumns>,
            args: any,
            ctx: any,
            info: GraphQLResolveInfo
          ) => any;
        }
      | {
          columns: TColumns[];
          type: string;
          resolve: (
            source: Pick<TView["type"], TColumns>,
            args: any,
            ctx: any,
            info: GraphQLResolveInfo
          ) => any;
        }
  ) => ModelFieldConfig;
}) => Record<TFields, ModelFieldConfig>;

export type ModelFieldConfig =
  | {
      isVirtual: false;
      columns: string[];
      nullable?: boolean;
      type?: string;
      resolve?: (
        source: any,
        args: any,
        ctx: any,
        info: GraphQLResolveInfo
      ) => any;
    }
  | {
      isVirtual: true;
      columns: string[];
      type: string;
      resolve: (
        source: any,
        args: any,
        ctx: any,
        info: GraphQLResolveInfo
      ) => any;
    };

export type OrderByDirection = "ASC" | "DESC";

export type OneToOneRelationship<
  TModelA extends Model<any, any, any>,
  TModelB extends Model<any, any, any> | AbstractModel<any, any>
> = {
  name: string;
  models: [TModelA, TModelB];
  nullable?: boolean;
  args?: string;
  join: (
    modelA: IdentifiersFrom<TModelA["view"]["columns"]>,
    modelB: UnionToIntersection<
      IdentifiersFrom<
        TModelB extends Model<any, any, any>
          ? TModelB["view"]["columns"]
          : TModelB extends AbstractModel<any, any>
          ? AbstractModelViewColumns<TModelB["models"]>
          : never
      >
    >,
    args: any
  ) => SqlTokenType;
};

export type OneToManyRelationship<
  TModelA extends Model<any, any, any>,
  TModelB extends Model<any, any, any> | AbstractModel<any, any>
> = {
  name: string;
  models: [TModelA, TModelB];
  connectionTypePrefix?: string;
  args?: string;
  join: (
    modelA: IdentifiersFrom<TModelA["view"]["columns"]>,
    modelB: UnionToIntersection<
      IdentifiersFrom<
        TModelB extends Model<any, any, any>
          ? TModelB["view"]["columns"]
          : TModelB extends AbstractModel<any, any>
          ? AbstractModelViewColumns<TModelB["models"]>
          : never
      >
    >,
    args: any
  ) => SqlTokenType;
  orderBy: (
    modelB: UnionToIntersection<
      IdentifiersFrom<
        TModelB extends Model<any, any, any>
          ? TModelB["view"]["columns"]
          : TModelB extends AbstractModel<any, any>
          ? AbstractModelViewColumns<TModelB["models"]>
          : never
      >
    >,
    args: any
  ) => [SqlTokenType, OrderByDirection][];
};

export type ManyToManyRelationship<
  TModelA extends Model<any, any, any>,
  TModelB extends Model<any, any, any> | AbstractModel<any, any>,
  TJunctionView extends View,
  TFields extends string
> = {
  name: string;
  models: [TModelA, TModelB];
  connectionTypePrefix?: string;
  junctionView: TJunctionView;
  args?: string;
  join: (
    modelA: IdentifiersFrom<TModelA["view"]["columns"]>,
    junction: IdentifiersFrom<TJunctionView["columns"]>,
    modelB: UnionToIntersection<
      IdentifiersFrom<
        TModelB extends Model<any, any, any>
          ? TModelB["view"]["columns"]
          : TModelB extends AbstractModel<any, any>
          ? AbstractModelViewColumns<TModelB["models"]>
          : never
      >
    >,
    args: any
  ) => [SqlTokenType, SqlTokenType];
  orderBy: (
    modelB: UnionToIntersection<
      IdentifiersFrom<
        TModelB extends Model<any, any, any>
          ? TModelB["view"]["columns"]
          : TModelB extends AbstractModel<any, any>
          ? AbstractModelViewColumns<TModelB["models"]>
          : never
      >
    >,
    junction: IdentifiersFrom<TJunctionView["columns"]>,
    args: any
  ) => [SqlTokenType, OrderByDirection][];
  fields?: ModelFields<TJunctionView, TFields>;
};

export type RelationshipConfig =
  | (OneToOneRelationship<any, any> & { type: "ONE_TO_ONE" })
  | (OneToManyRelationship<any, any> & { type: "ONE_TO_MANY" })
  | (ManyToManyRelationship<any, any, any, any> & { type: "MANY_TO_MANY" });

export type QueryBuilderRelationshipMap = Record<
  string,
  | {
      type: "ONE_TO_ONE";
      model: Model<string, View, string>;
      join: (
        modelA: IdentifiersFrom<any>,
        modelB: IdentifiersFrom<any>,
        args: any
      ) => SqlTokenType;
      columnsByField: Record<string, string[]>;
    }
  | {
      type: "ONE_TO_MANY";
      model: Model<string, View, string>;
      join: (
        modelA: IdentifiersFrom<any>,
        modelB: IdentifiersFrom<any>,
        args: any
      ) => SqlTokenType;
      orderBy: (
        modelB: IdentifiersFrom<any>,
        args: any
      ) => [SqlTokenType, OrderByDirection][];
      columnsByField: Record<string, string[]>;
    }
  | {
      type: "MANY_TO_MANY";
      model: Model<string, View, string>;
      junctionView: View;
      join: (
        modelA: IdentifiersFrom<any>,
        junction: IdentifiersFrom<any>,
        modelB: IdentifiersFrom<any>,
        args: any
      ) => [SqlTokenType, SqlTokenType];
      orderBy: (
        modelB: IdentifiersFrom<any>,
        junction: IdentifiersFrom<any>,
        args: any
      ) => [SqlTokenType, OrderByDirection][];
      columnsByField: Record<string, string[]>;
    }
>;

export type QueryBuilderModelInfo = {
  view: View;
  columnsByField: Record<string, string[]>;
  relationshipMap: QueryBuilderRelationshipMap;
};

export type QueryBuilderAbstractModelInfo = {
  view: View;
};

export type QueryBuilderContext = {
  getIdentifier: (name: string) => string;
};

export type QueryBuilder<
  TModels extends Record<string, Model<any, any, any> | AbstractModel<any, any>>
> = {
  models: {
    [ModelName in keyof TModels]: {
      findOne: (options: {
        info: GraphQLResolveInfo;
        where: (
          view: UnionToIntersection<
            IdentifiersFrom<
              TModels[ModelName] extends Model<any, any, any>
                ? TModels[ModelName]["view"]["columns"]
                : TModels[ModelName] extends AbstractModel<any, any>
                ? AbstractModelViewColumns<TModels[ModelName]["models"]>
                : never
            >
          >
        ) => SqlTokenType;
      }) => Promise<unknown>;
      getRelayConnection: (options: {
        info: GraphQLResolveInfo;
        where?: (
          view: UnionToIntersection<
            IdentifiersFrom<
              TModels[ModelName] extends Model<any, any, any>
                ? TModels[ModelName]["view"]["columns"]
                : TModels[ModelName] extends AbstractModel<any, any>
                ? AbstractModelViewColumns<TModels[ModelName]["models"]>
                : never
            >
          >
        ) => SqlTokenType;
        orderBy: (
          view: UnionToIntersection<
            IdentifiersFrom<
              TModels[ModelName] extends Model<any, any, any>
                ? TModels[ModelName]["view"]["columns"]
                : TModels[ModelName] extends AbstractModel<any, any>
                ? AbstractModelViewColumns<TModels[ModelName]["models"]>
                : never
            >
          >
        ) => [SqlTokenType, OrderByDirection][];
      }) => Promise<unknown>;
    };
  };
};

export type AbstractModelViewColumns<T> = T extends readonly (infer TModel)[]
  ? TModel extends Model<infer TName, infer TView, any>
    ? TView["columns"] & { __typename: TName }
    : never
  : never;

export type UnionToIntersection<U> = (
  U extends any ? (k: U) => void : never
) extends (k: infer I) => void
  ? I
  : never;

export type CreateSchemaComponentsConfig<
  TModels extends Record<string, Model<any, any, any> | AbstractModel<any, any>>
> = {
  models: TModels;
  relationships: RelationshipConfig[];
  customTypeMapper?: { [key in BuiltInDataType]?: string };
};
