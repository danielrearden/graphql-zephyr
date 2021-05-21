export const toGlobalId = (typeName: string, id: number | string): string => {
  return Buffer.from(JSON.stringify([typeName, id])).toString("base64");
};
