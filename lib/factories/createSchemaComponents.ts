import { buildSchema, GraphQLResolveInfo, GraphQLSchema } from "graphql";
import {
  parseResolveInfo,
  ResolveTree,
  simplifyParsedResolveInfoFragmentWithType,
} from "graphql-parse-resolve-info";
import {
  DatabasePoolType,
  sql,
  SqlTokenType,
  TaggedTemplateLiteralInvocationType,
} from "slonik";
import { raw } from "slonik-sql-tag-raw";
import { assertValidConfig } from "../assertions";
import {
  AbstractModel,
  BuiltInDataType,
  ColumnType,
  CreateSchemaComponentsConfig,
  Model,
  ModelFieldConfig,
  OrderByDirection,
  QueryBuilder,
  QueryBuilderAbstractModelInfo,
  QueryBuilderContext,
  QueryBuilderModelInfo,
  QueryBuilderRelationshipMap,
  View,
} from "../types";
import {
  formatEnumName,
  fromCursor,
  getIdentifierMap,
  toCursor,
  toGlobalId,
  upperFirst,
} from "../utilities";

// @todo make this configurable
const DEFAULT_LIMIT = 500;

const getOrderByDirection = (
  direction: "ASC" | "DESC",
  isBackwardPagination: boolean
): SqlTokenType => {
  switch (direction) {
    case "ASC":
      return isBackwardPagination ? sql`DESC` : sql`ASC`;
    case "DESC":
      return isBackwardPagination ? sql`ASC` : sql`DESC`;
  }
};

const getFieldType = (
  fieldName: string,
  field: ModelFieldConfig,
  columnType: ColumnType,
  customTypeMapper?: { [key in BuiltInDataType]?: string }
): string => {
  let type = field.type;

  if (!field.isVirtual && !type) {
    type = `${
      fieldName === "id"
        ? "ID"
        : convertViewColumnTypeToGraphQLType(columnType, customTypeMapper)
    }${field.nullable ? "" : "!"}`;
  }

  return type as string;
};

const convertViewColumnTypeToGraphQLType = (
  columnType: ColumnType,
  customTypeMapper: { [key in BuiltInDataType]?: string } = {}
): string => {
  if (columnType.kind === "array") {
    return `[${convertViewColumnTypeToGraphQLType(
      columnType.of,
      customTypeMapper
    )}!]`;
  } else if (columnType.kind === "enum") {
    return formatEnumName(columnType.name);
  } else {
    const customType = customTypeMapper[columnType.kind];
    if (customType) {
      return customType;
    }

    switch (columnType.kind) {
      case "boolean":
        return "Boolean";
      case "double precision":
      case "numeric":
      case "real":
        return "Float";
      case "integer":
      case "serial":
      case "smallint":
      case "smallserial":
        return "Int";
    }
  }

  return "String";
};

export const createSchemaComponents = <
  TModels extends Record<string, Model<any, any, any> | AbstractModel<any, any>>
>(
  config: CreateSchemaComponentsConfig<TModels>
): {
  createQueryBuilder: (pool: DatabasePoolType) => QueryBuilder<TModels>;
  resolvers: Record<string, any>;
  schema: GraphQLSchema;
  typeDefs: string;
} => {
  assertValidConfig(config);

  const { models, relationships, customTypeMapper } = config;
  const modelInfoMap: Record<string, QueryBuilderModelInfo> = {};
  const abstractModelInfoMap: Record<
    string,
    QueryBuilderAbstractModelInfo
  > = {};
  const interfacesByType: Record<string, string[]> = {};
  const resolvers: any = {};
  const typeDefinitions = [
    [
      "type PageInfo {",
      "  endCursor: String",
      "  hasNextPage: Boolean!",
      "  hasPreviousPage: Boolean!",
      "  startCursor: String",
      "}",
    ].join("\n"),
  ];
  const enumTypes = new Map<string, string>();

  for (const model of Object.values(models).filter(
    (model): model is AbstractModel<any, any> => "models" in model
  )) {
    // Get the columns for the underlying views
    const columns: Record<string, ColumnType> = {};
    for (const memberModel of model.models) {
      for (const columnName of Object.keys(memberModel.view.columns)) {
        const columnType = memberModel.view.columns[columnName];
        columns[columnName] = columnType;
      }
    }

    // Build a view using the views for each member type
    const view = {
      name: model.name,
      columns: {
        ...columns,
        __typename: {
          kind: "text" as const,
        },
      },
      type: {},
      query: model.models
        .map((memberModel, index) => {
          const identifier = `"t${index + 1}"`;
          return `
              SELECT
                ${[
                  `'${memberModel.name}' "__typename"`,
                  ...Object.keys(columns).map((columnName) => {
                    return `${
                      memberModel.view.columns[columnName]
                        ? `${identifier}."${columnName}"`
                        : `null::${columns[columnName].kind}`
                    } "${columnName}"`;
                  }),
                ].join(",\n")}
              FROM (
                ${memberModel.view.query}
              ) ${identifier}
            `;
        })
        .join("\nUNION\n"),
    };

    abstractModelInfoMap[model.name] = {
      view,
    };

    const fieldDefinitions = [];

    // Create interface field definitions for any common fields
    if (model.commonFields.length) {
      const fields = (model.models[0] as Model<any, any, any>).fields({
        field: (options) => {
          return "column" in options
            ? {
                ...options,
                columns: [options.column] as string[],
                isVirtual: false,
              }
            : {
                ...options,
                columns: options.columns as string[],
                isVirtual: true,
              };
        },
      });
      for (const fieldName of Object.keys(fields).filter((fieldName) =>
        model.commonFields.includes(fieldName)
      )) {
        const field = fields[fieldName];

        fieldDefinitions.push(
          `  ${fieldName}: ${getFieldType(
            fieldName,
            field,
            model.models[0].view.columns[fieldName],
            customTypeMapper
          )}`
        );
      }
    }

    // If we have field definitions, this is an interface, otherwise it is a union
    typeDefinitions.push(
      fieldDefinitions.length
        ? [`interface ${model.name} {`, ...fieldDefinitions, "}"].join("\n")
        : `union ${model.name} = ${model.models
            .map((model) => model.name)
            .join(" | ")}`
    );

    // If this is an interface, add its member types to the interface map
    if (fieldDefinitions) {
      for (const memberModel of model.models) {
        if (!interfacesByType[memberModel.name]) {
          interfacesByType[memberModel.name] = [];
        }
        interfacesByType[memberModel.name].push(model.name);
      }
    }
  }

  for (const model of Object.values(models).filter(
    (model): model is Model<any, any, any> => "fields" in model
  )) {
    const view: View = model.view;
    const fieldDefinitions = [];
    const fields = model.fields({
      field: (options) => {
        return "column" in options
          ? {
              ...options,
              columns: [options.column] as string[],
              isVirtual: false,
            }
          : {
              ...options,
              columns: options.columns as string[],
              isVirtual: true,
            };
      },
    });
    const columnsByField: Record<string, string[]> = {};
    const relationshipMap: QueryBuilderRelationshipMap = {};

    // Add the type to the resolver map
    resolvers[model.name] = {};

    // Add regular and virtual fields to the field definitions for the type
    for (const fieldName of Object.keys(fields)) {
      const field = fields[fieldName];

      fieldDefinitions.push(
        `  ${fieldName}: ${getFieldType(
          fieldName,
          field,
          view.columns[fieldName],
          customTypeMapper
        )}`
      );

      // If a custom resolver was provided, add it to the resolver map
      if (field.resolve) {
        resolvers[model.name][fieldName] = field.resolve;
      } else {
        resolvers[model.name][fieldName] = (source: any) => {
          return fieldName === "id"
            ? toGlobalId(model.name, source[field.columns[0]])
            : source[field.columns[0]];
        };
      }

      // Capture column dependencies for each field
      columnsByField[fieldName] = field.columns;
    }

    // Add field definitions for each relationships and any related type definitions
    const modelRelationships = relationships.filter(
      ({ models }) => models[0] === model
    );
    for (const relationship of modelRelationships) {
      const relatedModel = relationship.models[1];

      // @todo support returning a plain list instead of always returning a Relay Connection
      if (relationship.type === "ONE_TO_ONE") {
        fieldDefinitions.push(
          `  ${relationship.name}${
            relationship.args ? `(${relationship.args})` : ""
          }: ${relatedModel.name}${Boolean(relationship.nullable) ? "" : "!"}`
        );
      } else {
        const connectionTypePrefix =
          relationship.connectionTypePrefix ??
          `${model.name}${upperFirst(relationship.name)}`;
        const connectionTypeName = connectionTypePrefix + "Connection";
        const edgeTypeName = connectionTypePrefix + "Edge";

        // @todo allow pagination parameters to be customized
        fieldDefinitions.push(
          `  ${
            relationship.name
          }(after: String, before: String, first: Int, last: Int${
            relationship.args ? `, ${relationship.args}` : ""
          }): ${connectionTypeName}!`
        );

        // Add the connection and edge types to the type definitions
        typeDefinitions.push(
          [
            `type ${connectionTypeName} {`,
            `  edges: [${edgeTypeName}!]!`,
            "  pageInfo: PageInfo!",
            "}",
          ].join("\n"),
          [
            `type ${edgeTypeName} {`,
            `  cursor: String!`,
            `  node: ${relatedModel.name}!`,
            "}",
          ].join("\n")
        );

        // Add resolver logic for the connection field
        resolvers[model.name][relationship.name] = (
          source: any,
          args: any,
          _ctx: any,
          info: GraphQLResolveInfo
        ) => {
          // Note: If an alias was used, the query builder will return the data under that property name instead.
          const alias = info.path.key;
          const { aggregates, edges: originalEdges = [] } = source[alias] as {
            aggregates?: any;
            edges?: { cursor: any[]; node: any }[];
          };
          const { after, before, first, last } = args;

          // If last or before are not present, we assume forward pagination
          const isBackwardPagination = last != null || before != null;
          const limit = (isBackwardPagination ? last : first) ?? DEFAULT_LIMIT;
          const hasMore = originalEdges.length > limit;

          const edges = originalEdges.slice(0, limit).map((edge) => {
            return {
              cursor: toCursor(edge.cursor),
              node: edge.node,
            };
          });

          if (isBackwardPagination) {
            edges.reverse();
          }

          const pageInfo = {
            endCursor: edges[edges.length - 1]?.cursor ?? null,
            hasNextPage: isBackwardPagination ? before != null : hasMore,
            hasPreviousPage: isBackwardPagination ? hasMore : after != null,
            startCursor: edges[0]?.cursor ?? null,
          };

          return {
            ...aggregates,
            edges,
            pageInfo,
          };
        };
      }

      // Capture the relationship details so they can be used by the query builder
      relationshipMap[relationship.name] = {
        model: relatedModel,
        ...relationship,
      };
    }

    // Add the type for the model to the type definitions
    // @todo allow additional properties to be exposed on each edge
    const implementations = interfacesByType[model.name]
      ? ` implements ${interfacesByType[model.name].join(" & ")} `
      : " ";
    typeDefinitions.push(
      [`type ${model.name}${implementations}{`, ...fieldDefinitions, "}"].join(
        "\n"
      ),
      [
        `type ${model.name}Connection {`,
        `  edges: [${model.name}Edge!]!`,
        "  pageInfo: PageInfo!",
        "}",
      ].join("\n"),
      [
        `type ${model.name}Edge {`,
        `  cursor: String!`,
        `  node: ${model.name}!`,
        "}",
      ].join("\n")
    );

    modelInfoMap[model.name] = {
      columnsByField,
      relationshipMap,
      view: model.view,
    };

    // Generate a GraphQL enum for any Postgres enum type used in the view
    for (let columnType of Object.values(view.columns)) {
      // We want to get the underlying element type if the original type is an array
      while (columnType.kind === "array") {
        columnType = columnType.of;
      }

      if (columnType.kind === "enum" && !enumTypes.has(columnType.name)) {
        enumTypes.set(
          columnType.name,
          [
            `enum ${formatEnumName(columnType.name)} {`,
            ...columnType.values.map((value) => `  ${value}`),
            "}",
          ].join("\n")
        );
      }
    }
  }

  const getConnectionComponents = (fieldsMap: {
    [key: string]: ResolveTree;
  }): { edges: boolean; aggregates: { count: boolean } } => {
    const fields = Object.values(fieldsMap);

    return {
      edges: Boolean(
        fields.find(
          (field) => field.name === "edges" || field.name === "pageInfo"
        )
      ),
      aggregates: {
        count: Boolean(
          fields.find(
            (field) => field.name === "edges" || field.name === "pageInfo"
          )
        ),
      },
    };
  };

  const getNodeResolveTree = (fields: {
    [key: string]: ResolveTree;
  }): ResolveTree | undefined => {
    if (fields.edges) {
      const edgesFields = simplifyParsedResolveInfoFragmentWithType(
        fields.edges,
        schema.getType(Object.keys(fields.edges.fieldsByTypeName)[0])!
      ).fields as any;

      return edgesFields.node;
    }

    return undefined;
  };

  const buildConcreteOrAbstractNodeJsonValue = (
    model: Model<any, any, any> | AbstractModel<any, any>,
    tableAlias: string,
    resolveTree: ResolveTree | undefined,
    context: QueryBuilderContext
  ): SqlTokenType => {
    if ("models" in model) {
      return buildAbstractNodeJsonValue(
        model,
        tableAlias,
        resolveTree,
        context
      );
    } else {
      return buildConcreteNodeJsonValue(
        model,
        tableAlias,
        resolveTree
          ? simplifyParsedResolveInfoFragmentWithType(
              resolveTree,
              schema.getType(model.name)!
            ).fields
          : undefined,
        context
      );
    }
  };

  const buildAbstractNodeJsonValue = (
    model: AbstractModel<any, any>,
    tableAlias: string,
    resolveTree: ResolveTree | undefined,
    context: QueryBuilderContext
  ): SqlTokenType => {
    return sql`
      CASE ${sql.identifier([tableAlias, "__typename"])}
      ${sql.join(
        model.models.map((model) => {
          return sql`WHEN '${raw(
            model.name
          )}' THEN ${buildConcreteNodeJsonValue(
            model,
            tableAlias,
            resolveTree?.fieldsByTypeName[model.name],
            context
          )}`;
        }),
        sql`\n`
      )}
      END
    `;
  };

  const buildConcreteNodeJsonValue = (
    model: Model<any, any, any>,
    tableAlias: string,
    fields:
      | {
          [str: string]: ResolveTree;
        }
      | undefined,
    context: QueryBuilderContext
  ): SqlTokenType => {
    if (!fields) {
      return sql`json_build_object()`;
    }

    const { getIdentifier } = context;
    const { columnsByField, relationshipMap, view } = modelInfoMap[model.name];
    const jsonBuildObjectArgs: SqlTokenType[] = [
      raw("'__typename'"),
      raw(`'${model.name}'`),
    ];
    const selectedColumns = new Map<string, string>();
    for (const selectedField of Object.values(fields)) {
      if (columnsByField[selectedField.name]) {
        columnsByField[selectedField.name].forEach((column) => {
          selectedColumns.set(column, column);
        });
      } else if (relationshipMap[selectedField.name]) {
        const relationship = relationshipMap[selectedField.name];
        const otherTableAlias = getIdentifier(relationship.model.view.name);

        if (relationship.type === "ONE_TO_ONE") {
          const where = relationship.join(
            getIdentifierMap(tableAlias, view.columns),
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );
          jsonBuildObjectArgs.push(
            raw(`'${selectedField.alias}'`),
            sql`(${buildNodeQuery(
              relationship.model,
              otherTableAlias,
              selectedField,
              where,
              context
            )})`
          );
        } else if (relationship.type === "ONE_TO_MANY") {
          const where = relationship.join(
            getIdentifierMap(tableAlias, view.columns),
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );
          const orderBy = relationship.orderBy(
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );

          jsonBuildObjectArgs.push(
            raw(`'${selectedField.alias}'`),
            sql`(${buildRelayConnectionQuery(
              relationship.model,
              otherTableAlias,
              selectedField,
              where,
              orderBy,
              context
            )})`
          );
        } else if (relationship.type === "MANY_TO_MANY") {
          const junctionAlias = getIdentifier(relationship.junctionView.name);
          const where = relationship.join(
            getIdentifierMap(tableAlias, view.columns),
            getIdentifierMap(junctionAlias, relationship.junctionView.columns),
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            selectedField.args
          );
          const orderBy = relationship.orderBy(
            getIdentifierMap(otherTableAlias, relationship.model.view.columns),
            getIdentifierMap(junctionAlias, relationship.junctionView.columns),
            selectedField.args
          );
          jsonBuildObjectArgs.push(
            raw(`'${selectedField.alias}'`),
            sql`(${buildJunctionRelayConnectionQuery(
              relationship.model,
              otherTableAlias,
              relationship.junctionView,
              junctionAlias,
              selectedField,
              where,
              orderBy,
              context
            )})`
          );
        }
      }
    }
    for (const column of selectedColumns.values()) {
      jsonBuildObjectArgs.push(
        raw(`'${column}'`),
        sql.identifier([tableAlias, column])
      );
    }

    return sql`json_build_object(${sql.join(jsonBuildObjectArgs, sql`, `)})`;
  };

  const buildNodeQuery = (
    model: Model<any, any, any> | AbstractModel<any, any>,
    tableAlias: string,
    resolveTree: ResolveTree,
    where: SqlTokenType,
    context: QueryBuilderContext
  ): TaggedTemplateLiteralInvocationType<any> => {
    const view =
      "models" in model
        ? abstractModelInfoMap[model.name].view
        : modelInfoMap[model.name].view;

    return sql`
      SELECT
        ${buildConcreteOrAbstractNodeJsonValue(
          model,
          tableAlias,
          resolveTree,
          context
        )}
      FROM (${raw(view.query)}) ${sql.identifier([tableAlias])}
      WHERE
        ${where}
      LIMIT 1
    `;
  };

  const buildRelayConnectionQuery = (
    model: Model<any, any, any> | AbstractModel<any, any>,
    tableAlias: string,
    resolveTree: ResolveTree,
    where: SqlTokenType,
    orderBy: [SqlTokenType, OrderByDirection][],
    context: QueryBuilderContext
  ): TaggedTemplateLiteralInvocationType<any> => {
    const view =
      "models" in model
        ? abstractModelInfoMap[model.name].view
        : modelInfoMap[model.name].view;
    const { fields } = simplifyParsedResolveInfoFragmentWithType(
      resolveTree,
      schema.getType(Object.keys(resolveTree.fieldsByTypeName)[0])!
    );
    const connectionComponents = getConnectionComponents(fields);
    const { after, before, first, last } = resolveTree.args;
    const isBackwardPagination = last != null || before != null;
    const limit =
      (isBackwardPagination ? (last as number) : (first as number)) ??
      DEFAULT_LIMIT;
    const cursor = (before || after) as string | null | undefined;
    const orderByExpression = sql.join(
      orderBy.map(
        ([expression, direction]) =>
          sql`${expression} ${getOrderByDirection(
            direction,
            isBackwardPagination
          )}`
      ),
      sql`, `
    );

    let cursorConditions: SqlTokenType = sql`true`;
    if (cursor) {
      const values = fromCursor(cursor);
      cursorConditions = sql.join(
        orderBy.map((_expression, outerIndex) => {
          const expressions = orderBy.slice(0, outerIndex + 1);

          return sql`(${sql.join(
            expressions.map(([expression, direction], innerIndex) => {
              let comparisonOperator = sql`=`;
              if (innerIndex === expressions.length - 1) {
                comparisonOperator =
                  direction === (isBackwardPagination ? "DESC" : "ASC")
                    ? sql`>`
                    : sql`<`;
              }
              return sql`${expression} ${comparisonOperator} ${
                values[innerIndex] ?? null
              }`;
            }),
            sql` AND `
          )})`;
        }),
        sql` OR `
      );
    }

    const edges = connectionComponents.edges
      ? sql`
        'edges', (
          SELECT
            coalesce(json_agg(
              json_build_object(
                'cursor', json_build_array(${sql.join(
                  orderBy.map(([expression]) => expression),
                  sql`, `
                )}),
                'node', ${buildConcreteOrAbstractNodeJsonValue(
                  model,
                  tableAlias,
                  getNodeResolveTree(fields),
                  context
                )}
              )
              ORDER BY ${orderByExpression}
            ), '[]'::json)
          FROM (${raw(view.query)}) ${sql.identifier([tableAlias])}
          WHERE
            (${where}) AND (${cursorConditions})
          LIMIT ${limit + 1}
        )
      `
      : null;
    const aggregates = connectionComponents.aggregates
      ? sql`
        'aggregates', (
          SELECT
            json_build_object(
              'count', count(*)
            )
          FROM (${raw(view.query)}) ${sql.identifier([tableAlias])}
          WHERE
            ${where}
        )
      `
      : null;

    return sql`
      SELECT
        json_build_object(
          ${sql.join([edges, aggregates].filter(Boolean), sql`,\n`)}
        )
    `;
  };

  const buildJunctionRelayConnectionQuery = (
    model: Model<any, any, any> | AbstractModel<any, any>,
    tableAlias: string,
    junctionView: View,
    junctionTableAlias: string,
    resolveTree: ResolveTree,
    where: [SqlTokenType, SqlTokenType],
    orderBy: [SqlTokenType, OrderByDirection][],
    context: QueryBuilderContext
  ): TaggedTemplateLiteralInvocationType<any> => {
    const view =
      "models" in model
        ? abstractModelInfoMap[model.name].view
        : modelInfoMap[model.name].view;

    const { fields } = simplifyParsedResolveInfoFragmentWithType(
      resolveTree,
      schema.getType(Object.keys(resolveTree.fieldsByTypeName)[0])!
    );
    const connectionComponents = getConnectionComponents(fields);
    const { after, before, first, last } = resolveTree.args;
    const isBackwardPagination = last != null || before != null;
    const limit =
      (isBackwardPagination ? (last as number) : (first as number)) ??
      DEFAULT_LIMIT;
    const cursor = (before || after) as string | null | undefined;
    const orderByExpression = sql.join(
      orderBy.map(
        ([expression, direction]) =>
          sql`${expression} ${getOrderByDirection(
            direction,
            isBackwardPagination
          )}`
      ),
      sql`, `
    );

    let cursorConditions: SqlTokenType = sql`true`;
    if (cursor) {
      const values = fromCursor(cursor);
      cursorConditions = sql.join(
        orderBy.map((_expression, outerIndex) => {
          const expressions = orderBy.slice(0, outerIndex + 1);

          return sql`(${sql.join(
            expressions.map(([expression, direction], innerIndex) => {
              let comparisonOperator = sql`=`;
              if (innerIndex === expressions.length - 1) {
                comparisonOperator =
                  direction === (isBackwardPagination ? "DESC" : "ASC")
                    ? sql`>`
                    : sql`<`;
              }
              return sql`${expression} ${comparisonOperator} ${
                values[innerIndex] ?? null
              }`;
            }),
            sql` AND `
          )})`;
        }),
        sql` OR `
      );
    }

    const edges = connectionComponents.edges
      ? sql`
        'edges', (
          SELECT
            coalesce(json_agg(
              json_build_object(
                'cursor', json_build_array(${sql.join(
                  orderBy.map(([expression]) => expression),
                  sql`, `
                )}),
                'node', ${buildConcreteOrAbstractNodeJsonValue(
                  model,
                  tableAlias,
                  getNodeResolveTree(fields),
                  context
                )}
              )
              ORDER BY ${orderByExpression}
            ), '[]'::json)
          FROM (${raw(view.query)}) ${sql.identifier([tableAlias])}
          INNER JOIN (${raw(junctionView.query)}) ${sql.identifier([
          junctionTableAlias,
        ])} ON
            ${where[0]} 
          WHERE
            (${where[1]}) AND (${cursorConditions})
          LIMIT ${limit + 1}
        )
      `
      : null;
    const aggregates = connectionComponents.aggregates
      ? sql`
        'aggregates', (
          SELECT
            json_build_object(
              'count', count(*)
            )
          FROM (${raw(view.query)}) ${sql.identifier([tableAlias])}
          INNER JOIN ((${raw(junctionView.query)})) ${sql.identifier([
          junctionTableAlias,
        ])} ON
            ${where[0]} 
          WHERE
            ${where[1]}
        )
      `
      : null;

    return sql`
      SELECT
        json_build_object(
          ${sql.join([edges, aggregates].filter(Boolean), sql`,\n`)}
        )
    `;
  };

  const createContext = (): QueryBuilderContext => {
    let keyCounts: Record<string, number> = {};

    return {
      getIdentifier: (name: string) => {
        const key = name[0].toLowerCase();
        if (!keyCounts[key]) {
          keyCounts[key] = 1;
        } else {
          keyCounts[key] = keyCounts[key] + 1;
        }

        return `${key}${keyCounts[key]}`;
      },
    };
  };

  const createQueryBuilder = (pool: DatabasePoolType) => {
    return {
      models: Object.keys(models).reduce((acc, mappedModelName) => {
        const model = models[mappedModelName];
        acc[mappedModelName as keyof TModels] = {
          findOne: async ({ info, where }) => {
            const view =
              "models" in model
                ? abstractModelInfoMap[model.name].view
                : modelInfoMap[model.name].view;
            const context = createContext();
            const tableAlias = context.getIdentifier(view.name);
            const fieldInfo = parseResolveInfo(info) as ResolveTree;

            const query = buildNodeQuery(
              model,
              tableAlias,
              fieldInfo,
              where(getIdentifierMap(tableAlias, view.columns) as any),
              context
            );

            return pool.maybeOneFirst(query);
          },
          getRelayConnection: async ({ info, orderBy, where }) => {
            const view =
              "models" in model
                ? abstractModelInfoMap[model.name].view
                : modelInfoMap[model.name].view;
            const context = createContext();
            const tableAlias = context.getIdentifier(view.name);
            const fieldInfo = parseResolveInfo(info) as ResolveTree;

            const query = buildRelayConnectionQuery(
              model,
              tableAlias,
              fieldInfo,
              where
                ? where(getIdentifierMap(tableAlias, view.columns) as any)
                : sql`true`,
              orderBy(getIdentifierMap(tableAlias, view.columns) as any),
              context
            );

            const {
              aggregates,
              edges: originalEdges = [],
            } = await pool.oneFirst(query);
            const { after, before, first, last } = fieldInfo.args;

            // If last or before are not present, we assume forward pagination
            const isBackwardPagination = last != null || before != null;
            const limit =
              (isBackwardPagination ? last : first) ?? DEFAULT_LIMIT;
            const hasMore = originalEdges.length > limit;

            const edges = originalEdges
              .slice(0, limit)
              .map((edge: { cursor: any[]; node: any }) => {
                return {
                  cursor: toCursor(edge.cursor),
                  node: edge.node,
                };
              });

            if (isBackwardPagination) {
              edges.reverse();
            }

            const pageInfo = {
              endCursor: edges[edges.length - 1]?.cursor ?? null,
              hasNextPage: isBackwardPagination ? before != null : hasMore,
              hasPreviousPage: isBackwardPagination ? hasMore : after != null,
              startCursor: edges[0]?.cursor ?? null,
            };

            return {
              ...aggregates,
              edges,
              pageInfo,
            };
          },
        };

        return acc;
      }, {} as QueryBuilder<TModels>["models"]),
    };
  };

  const typeDefs = [...typeDefinitions, ...enumTypes.values()].join("\n\n");
  const schema = buildSchema(typeDefs);

  return {
    createQueryBuilder,
    resolvers,
    typeDefs,
    schema,
  };
};
