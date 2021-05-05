import { upperFirst } from "./upperFirst";

export const formatEnumName = (name: string) => {
  return upperFirst(name) + "Enum";
};
