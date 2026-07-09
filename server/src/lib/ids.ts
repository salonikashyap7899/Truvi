/**
 * UUID validation helper — replaces Mongoose's `isValidObjectId` now that
 * primary keys are Postgres UUIDs.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONGO_OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

export function isValidId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    (UUID_REGEX.test(value) || MONGO_OBJECT_ID_REGEX.test(value))
  );
}
