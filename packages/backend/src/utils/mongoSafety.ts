import mongoose from "mongoose";

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

/**
 * `{ $in: ids }` that survives mongoose's sanitizeFilter (set globally in
 * app.ts). Without `trusted`, sanitizeFilter rewrites it to
 * `{ $eq: { $in: ... } }`, which fails or matches nothing. Only use with ids
 * the server has checked or read from the database, never raw request input.
 */
export const inIds = (ids: readonly unknown[]) => mongoose.trusted({ $in: [...ids] });

/** `{ $exists: true, $ne: null }` that survives sanitizeFilter. */
export const isSet = () => mongoose.trusted({ $exists: true, $ne: null });

/**
 * Fields a user may not change through a general update: who owns a record
 * and which other records it links to. Changing them would let an owner
 * point their record at someone else's data.
 */
const PROTECTED_FIELDS = [
  "_id",
  "id",
  "owner",
  "user",
  "layer",
  "parcel",
  "layers",
  "projects",
  "rows",
  "areas",
  "activities",
  "assets",
  "budgets",
  "soiltests",
  "saptests",
  "systemdesign",
];

export const withoutProtectedFields = (value: Record<string, unknown>) => {
  const out = { ...value };
  for (const key of PROTECTED_FIELDS) delete out[key];
  return out;
};
