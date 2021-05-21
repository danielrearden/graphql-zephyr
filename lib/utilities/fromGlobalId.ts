export const fromGlobalId = (
  globalId: string,
  typeName?: string[] | string
): {
  id: number;
  typeName: string;
} => {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(globalId, "base64").toString());
  } catch {
    throw new Error(`Malformed Global Id. Invalid value ${globalId}`);
  }
  try {
    if (Array.isArray(payload) && payload.length === 2) {
      if (typeName !== undefined) {
        if (typeName.length > 0 && !typeName.includes(payload[0])) {
          throw new Error(
            `Mismatched type in global ID "${globalId}". Expected "${typeName}" but received "${payload[0]}".`
          );
        } else if (payload[0] !== typeName && typeof typeName === "string") {
          throw new Error(
            `Mismatched type in global ID "${globalId}". Expected "${typeName}" but received "${payload[0]}".`
          );
        }
      }

      return {
        id: payload[1],
        typeName: payload[0],
      };
    }
  } catch (error) {
    throw new Error(error);
  }

  throw new Error("Unexpected error");
};
