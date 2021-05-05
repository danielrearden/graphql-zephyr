export const toCursor = (values: any[]): string => {
  return Buffer.from(JSON.stringify(values)).toString("base64");
};
