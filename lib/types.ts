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

export interface FieldInfo {
  name: string;
  alias: string;
  args: Record<string, any>;
  fields: Record<string, FieldInfo>;
}

export type IdentifiersFrom<T> = {
  [Property in keyof T]: IdentifierSqlTokenType;
};

export interface View {
  columns: { [key: string]: ColumnType };
  name: string;
  query: string;
  type: Record<string, any>;
}

export interface Model<TView extends View> {
  fields: ModelFields<TView>;
  name: string;
  view: TView;
}

export type ModelFields<TView extends View> = (utilities: {
  field: <TColumns extends keyof TView["type"]>(options: {
    name: TColumns;
    nullable?: boolean;
    type?: string;
    resolve?: (
      source: Pick<TView["type"], TColumns>,
      args: any,
      ctx: any,
      info: GraphQLResolveInfo
    ) => any;
  }) => ModelFieldConfig;
  virtualField: <TColumns extends keyof TView["type"]>(options: {
    name: string;
    type: string;
    columns: TColumns[];
    resolve: (
      source: Pick<TView["type"], TColumns>,
      args: any,
      ctx: any,
      info: GraphQLResolveInfo
    ) => any;
  }) => ModelFieldConfig;
}) => ModelFieldConfig[];

export type ModelFieldConfig =
  | {
      isVirtual: false;
      name: string;
      column: string;
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
      name: string;
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
  TModelA extends Model<any>,
  TModelB extends Model<any>
> = {
  name: string;
  models: [TModelA, TModelB];
  nullable?: boolean;
  args?: string;
  join: (
    modelA: IdentifiersFrom<TModelA["view"]["columns"]>,
    modelB: IdentifiersFrom<TModelB["view"]["columns"]>,
    args: any
  ) => SqlTokenType;
};

export type OneToManyRelationship<
  TModelA extends Model<any>,
  TModelB extends Model<any>
> = {
  name: string;
  models: [TModelA, TModelB];
  connectionTypePrefix?: string;
  args?: string;
  join: (
    modelA: IdentifiersFrom<TModelA["view"]["columns"]>,
    modelB: IdentifiersFrom<TModelB["view"]["columns"]>,
    args: any
  ) => SqlTokenType;
  orderBy: (
    modelB: IdentifiersFrom<TModelB["view"]["columns"]>,
    args: any
  ) => [SqlTokenType, OrderByDirection][];
};

export type ManyToManyRelationship<
  TModelA extends Model<any>,
  TModelB extends Model<any>,
  TJunctionView extends View
> = {
  name: string;
  models: [TModelA, TModelB];
  connectionTypePrefix?: string;
  junctionView: TJunctionView;
  args?: string;
  join: (
    modelA: IdentifiersFrom<TModelA["view"]["columns"]>,
    junction: IdentifiersFrom<TJunctionView["columns"]>,
    modelB: IdentifiersFrom<TModelB["view"]["columns"]>,
    args: any
  ) => [SqlTokenType, SqlTokenType];
  orderBy: (
    modelB: IdentifiersFrom<TModelB["view"]["columns"]>,
    junction: IdentifiersFrom<TJunctionView["columns"]>,
    args: any
  ) => [SqlTokenType, OrderByDirection][];
};

export type RelationshipConfig =
  | (OneToOneRelationship<any, any> & { type: "ONE_TO_ONE" })
  | (OneToManyRelationship<any, any> & { type: "ONE_TO_MANY" })
  | (ManyToManyRelationship<any, any, any> & { type: "MANY_TO_MANY" });

export type QueryBuilderRelationshipMap = Record<
  string,
  | {
      type: "ONE_TO_ONE";
      model: Model<View>;
      join: (
        modelA: IdentifiersFrom<any>,
        modelB: IdentifiersFrom<any>,
        args: any
      ) => SqlTokenType;
    }
  | {
      type: "ONE_TO_MANY";
      model: Model<View>;
      join: (
        modelA: IdentifiersFrom<any>,
        modelB: IdentifiersFrom<any>,
        args: any
      ) => SqlTokenType;
      orderBy: (
        modelB: IdentifiersFrom<any>,
        args: any
      ) => [SqlTokenType, OrderByDirection][];
    }
  | {
      type: "MANY_TO_MANY";
      model: Model<View>;
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
    }
>;

export type QueryBuilderContext = {
  getIdentifier: (name: string) => string;
  views: Map<string, View>;
};

export type QueryBuilder<TModels extends Record<string, Model<any>>> = {
  models: {
    [ModelName in keyof TModels]: {
      findOne: (options: {
        info: GraphQLResolveInfo;
        where: (
          view: IdentifiersFrom<TModels[ModelName]["view"]["columns"]>
        ) => SqlTokenType;
      }) => Promise<unknown>;
      getRelayConnection: (options: {
        info: GraphQLResolveInfo;
        where?: (
          view: IdentifiersFrom<TModels[ModelName]["view"]["columns"]>
        ) => SqlTokenType;
        orderBy: (
          view: IdentifiersFrom<TModels[ModelName]["view"]["columns"]>
        ) => [SqlTokenType, OrderByDirection][];
      }) => Promise<unknown>;
    };
  };
};
