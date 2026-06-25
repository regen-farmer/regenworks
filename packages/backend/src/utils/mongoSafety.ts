const BLOCKED_MONGO_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const isPlainObject = (value: unknown): value is Record<string, unknown> => {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
};

const isSafeMongoKey = (key: string) => {
  return !key.startsWith("$") && !key.includes(".") && !BLOCKED_MONGO_KEYS.has(key);
};

export const sanitizeMongoValue = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeMongoValue(item));
  }

  if (isPlainObject(value)) {
    return sanitizeMongoDocument(value);
  }

  return value;
};

export const sanitizeMongoDocument = (value: unknown): Record<string, unknown> => {
  if (!isPlainObject(value)) {
    return {};
  }

  const sanitized: Record<string, unknown> = {};

  for (const [key, childValue] of Object.entries(value)) {
    if (isSafeMongoKey(key)) {
      sanitized[key] = sanitizeMongoValue(childValue);
    }
  }

  return sanitized;
};
