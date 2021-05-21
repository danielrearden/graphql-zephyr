import {
  AbstractModel,
  ColumnType,
  CreateSchemaComponentsConfig,
  Model,
} from "../types";

export const assertValidConfig = <
  TModels extends Record<string, Model<any, any, any> | AbstractModel<any, any>>
>({
  models: modelsMap,
  relationships,
}: CreateSchemaComponentsConfig<TModels>): void => {
  const models = Object.values(modelsMap);
  const modelNames = new Set<string>();
  const errors = [];

  for (const model of models) {
    if (modelNames.has(model.name)) {
      errors.push(`* Duplicate model name found: "${model.name}".`);
    } else {
      modelNames.add(model.name);
    }

    if ("models" in model) {
      const columnInfoByName: Record<string, Record<string, ColumnType>> = {};
      for (const memberModel of model.models) {
        for (const columnName of Object.keys(memberModel.view.columns)) {
          const columnType = memberModel.view.columns[columnName];
          if (!columnInfoByName[columnName]) {
            columnInfoByName[columnName] = {};
          }
          columnInfoByName[columnName][memberModel.name] = columnType;
        }
      }

      // Verify that the types for each column are compatible
      for (const columnName of Object.keys(columnInfoByName)) {
        const columnInfo = columnInfoByName[columnName];
        Object.keys(columnInfo).forEach((aModelName) => {
          const aColumnType = columnInfo[aModelName];
          Object.keys(columnInfo).forEach((bModelName) => {
            const bColumnType = columnInfo[bModelName];
            if (JSON.stringify(aColumnType) !== JSON.stringify(bColumnType)) {
              errors.push(
                [
                  `* Underlying views for abstract model ${model.name} are incompatible. Mismatch for column ${columnName}:`,
                  `  ${aModelName}`,
                  `  ${JSON.stringify(aColumnType)}`,
                  "  ---",
                  `  ${bModelName}`,
                  `  ${JSON.stringify(bColumnType)}`,
                ].join("\n")
              );
            }
          });
        });
      }
    }
  }

  for (const relationship of relationships) {
    for (const model of relationship.models) {
      if (!models.includes(model)) {
        errors.push(
          `* Model "${model.name}" referenced by relationship "${relationship.name}" but not found in models map.`
        );
      }
    }
  }

  if (errors.length) {
    console.log(
      "GraphQL Sprout configuration is invlid. The following issues were found:"
    );
    errors.forEach(console.log);

    throw new Error("Invalid GraphQL Sprout configuration");
  }
};
