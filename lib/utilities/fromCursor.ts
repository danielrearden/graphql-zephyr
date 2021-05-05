export const fromCursor = (cursor: string): any[] => {
  return JSON.parse(Buffer.from(cursor, "base64").toString());
};
