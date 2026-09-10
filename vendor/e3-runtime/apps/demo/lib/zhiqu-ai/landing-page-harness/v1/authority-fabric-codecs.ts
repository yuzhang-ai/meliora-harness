import {
  StrictJsonErrorV1,
  assertStrictJsonV1,
  canonicalJsonV1,
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredStringV1,
  requiredTimestampV1,
} from "./strict-json";

export const compareCodeUnitV1 = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

export const strictRecordShapeV1 = (
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
  path: string
): Record<string, unknown> => {
  assertStrictJsonV1(value, path);
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype
  ) {
    throw new StrictJsonErrorV1("expected_object", path, "Expected a plain object.");
  }
  const record = value as Record<string, unknown>;
  const allowed = new Set([...required, ...optional]);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new StrictJsonErrorV1(
        "exact_keys_mismatch",
        `${path}.${key}`,
        "Unknown field is not allowed."
      );
    }
  }
  for (const key of required) {
    if (!Object.hasOwn(record, key)) {
      throw new StrictJsonErrorV1(
        "required_field_missing",
        `${path}.${key}`,
        "Required field is missing."
      );
    }
  }
  return record;
};

export const requiredEnumV1 = <T extends string>(
  value: unknown,
  values: readonly T[],
  path: string
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new StrictJsonErrorV1(
      "invalid_enum",
      path,
      `Expected one of: ${values.join(",")}.`
    );
  }
  return value as T;
};

export const requiredBooleanV1 = (value: unknown, path: string) => {
  if (typeof value !== "boolean") {
    throw new StrictJsonErrorV1("invalid_boolean", path, "Expected boolean.");
  }
  return value;
};

export const requiredSafeIntegerV1 = (
  value: unknown,
  path: string,
  minimum = 0,
  maximum = Number.MAX_SAFE_INTEGER
) => {
  if (
    !Number.isSafeInteger(value) ||
    (value as number) < minimum ||
    (value as number) > maximum
  ) {
    throw new StrictJsonErrorV1(
      "invalid_integer",
      path,
      `Expected a safe integer in ${minimum}..${maximum}.`
    );
  }
  return value as number;
};

export const requiredVersionV1 = (value: unknown, path: string) => {
  const version = requiredStringV1(value, path, 80);
  if (
    version !== version.trim() ||
    !/^[A-Za-z0-9][A-Za-z0-9.+_-]{0,79}$/u.test(version)
  ) {
    throw new StrictJsonErrorV1("invalid_version", path, "Version is invalid.");
  }
  return version;
};

export const requiredCanonicalJsonTextV1 = (value: unknown, path: string) => {
  const text = requiredStringV1(value, path, 200_000);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new StrictJsonErrorV1("invalid_json_text", path, "Expected JSON text.");
  }
  assertStrictJsonV1(parsed, path);
  if (canonicalJsonV1(parsed) !== text) {
    throw new StrictJsonErrorV1(
      "non_canonical_json_text",
      path,
      "JSON text must use canonical encoding."
    );
  }
  return text;
};

export const decodeCanonicalStringSetV1 = (
  value: unknown,
  path: string,
  options: Readonly<{
    maxItems?: number;
    allowEmpty?: boolean;
    kind?: "id" | "hash" | "version" | "string";
    requireCanonical?: boolean;
  }> = {}
) => {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new StrictJsonErrorV1("invalid_array", path, "Expected an array.");
  }
  const maxItems = options.maxItems ?? 128;
  if ((!options.allowEmpty && value.length === 0) || value.length > maxItems) {
    throw new StrictJsonErrorV1("array_budget_invalid", path, "Array size is invalid.");
  }
  const decoded = value.map((entry, index) => {
    const itemPath = `${path}[${index}]`;
    if (options.kind === "hash") return requiredHashV1(entry, itemPath);
    if (options.kind === "version") return requiredVersionV1(entry, itemPath);
    if (options.kind === "string") return requiredStringV1(entry, itemPath, 240);
    return requiredIdV1(entry, itemPath);
  });
  const normalized = [...decoded].sort(compareCodeUnitV1);
  if (new Set(normalized).size !== normalized.length) {
    throw new StrictJsonErrorV1("duplicate_array_entry", path, "Entries must be unique.");
  }
  if (
    options.requireCanonical &&
    decoded.some((entry, index) => entry !== normalized[index])
  ) {
    throw new StrictJsonErrorV1(
      "non_canonical_order",
      path,
      "Persisted collection must already be code-unit sorted."
    );
  }
  return normalized;
};

export const assertCanonicalArrayV1 = <T>(
  value: readonly T[],
  key: (entry: T) => string,
  path: string
) => {
  for (let index = 1; index < value.length; index += 1) {
    if (compareCodeUnitV1(key(value[index - 1]!), key(value[index]!)) >= 0) {
      throw new StrictJsonErrorV1(
        "non_canonical_order",
        `${path}[${index}]`,
        "Persisted collection must be unique and code-unit sorted."
      );
    }
  }
  return value;
};

export const hashWithoutKeysV1 = (
  value: Readonly<Record<string, unknown>>,
  omitted: readonly string[]
) =>
  hashCanonicalJsonV1(
    Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.includes(key)))
  );

export {
  requiredHashV1,
  requiredIdV1,
  requiredStringV1,
  requiredTimestampV1,
};
