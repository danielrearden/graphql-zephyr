import { sql } from "slonik";
import { View } from "../types";

export const getIdentifierMap = (
  tableName: string,
  columns: View["columns"]
) => {
  return Object.fromEntries(
    Object.entries(columns).map(([columnName]) => [
      columnName,
      sql.identifier([tableName, columnName]),
    ])
  );
};
