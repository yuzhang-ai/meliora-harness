import { createHash } from "node:crypto";

export class StrictJsonErrorV1 extends Error {
  constructor(
    readonly code: string,
    readonly path: string,
    message: string
  ) {
    super(`${path}: ${message}`);
    this.name = "StrictJsonErrorV1";
  }
}

export const assertStrictJsonV1 = (
  value: unknown,
  path = "input",
  seen = new Set<object>()
): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new StrictJsonErrorV1("non_finite_number", path, "Number must be finite.");
    return;
  }
  if (typeof value !== "object") throw new StrictJsonErrorV1("non_json_value", path, "Value is not JSON.");
  const object = value as object;
  if (seen.has(object)) throw new StrictJsonErrorV1("cyclic_value", path, "Cycles are not allowed.");
  seen.add(object);
  if (Array.isArray(value)) {
    if (Object.getPrototypeOf(value) !== Array.prototype) throw new StrictJsonErrorV1("invalid_prototype", path, "Array prototype is invalid.");
    if (Reflect.ownKeys(value).some((key) => typeof key === "symbol" || (key !== "length" && !/^(?:0|[1-9]\d*)$/u.test(String(key))))) throw new StrictJsonErrorV1("named_or_symbol_array_property", path, "Array has a non-index property.");
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, index)) throw new StrictJsonErrorV1("sparse_array", `${path}[${index}]`, "Sparse arrays are not allowed.");
      assertStrictJsonV1(value[index], `${path}[${index}]`, seen);
    }
  } else {
    if (Object.getPrototypeOf(value) !== Object.prototype) throw new StrictJsonErrorV1("invalid_prototype", path, "Expected a plain object.");
    for (const key of Reflect.ownKeys(value)) {
      if (typeof key !== "string") throw new StrictJsonErrorV1("symbol_key", path, "Symbol keys are not allowed.");
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, "value")) throw new StrictJsonErrorV1("accessor_property", `${path}.${key}`, "Accessors are not allowed.");
      assertStrictJsonV1(descriptor.value, `${path}.${key}`, seen);
    }
  }
  seen.delete(object);
};

export const canonicalJsonV1 = (value: unknown): string => {
  assertStrictJsonV1(value);
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJsonV1).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalJsonV1(record[key])}`).join(",")}}`;
};

export const hashCanonicalJsonV1 = (value: unknown) =>
  createHash("sha256").update(canonicalJsonV1(value), "utf8").digest("hex");

export const hashUtf8V1 = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

export const strictRecordV1 = (
  value: unknown,
  keys: readonly string[],
  path: string
): Record<string, unknown> => {
  assertStrictJsonV1(value, path);
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new StrictJsonErrorV1("expected_object", path, "Expected a plain object.");
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) throw new StrictJsonErrorV1("exact_keys_mismatch", path, `Expected keys: ${expected.join(",")}.`);
  return value as Record<string, unknown>;
};

export const requiredStringV1 = (value: unknown, path: string, max = 20_000) => {
  if (typeof value !== "string" || !value.trim() || value.length > max) throw new StrictJsonErrorV1("invalid_string", path, "Expected a bounded non-empty string.");
  return value;
};

export const assertPublicSafeStringV1 = (value: string, path: string) => {
  if (/(?:bearer\s+[a-z0-9._-]+|(?:secret|api[_ -]?key|password|token)\s*[:=]\s*\S+|chain[- ]of[- ]thought|hidden\s+reasoning|private\s+context|raw\s+tool\s+output)/iu.test(value)) {
    throw new StrictJsonErrorV1(
      "public_event_sensitive_data",
      path,
      "Sensitive or private string content is not allowed in Public Events."
    );
  }
  return value;
};

export const requiredModelIdentityV1 = (value: unknown, path: string) => {
  const text = requiredStringV1(value, path, 160);
  if (text !== text.trim() || /[\u0000-\u001F\u007F-\u009F]/u.test(text)) {
    throw new StrictJsonErrorV1(
      "invalid_string",
      path,
      "Model identity must be trimmed and must not contain control characters."
    );
  }
  return assertPublicSafeStringV1(text, path);
};

export const requiredIdV1 = (value: unknown, path: string) => {
  const text = requiredStringV1(value, path, 160);
  if (!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,159}$/u.test(text)) throw new StrictJsonErrorV1("invalid_identity", path, "Identity is invalid.");
  return text;
};

/**
 * React owns the editor mount identity. `useId()` values are opaque and may
 * legally start with `_` or `:`; normal product/document identities must keep
 * using `requiredIdV1` instead of widening their grammar.
 */
export const requiredRuntimeMountIdV1 = (value: unknown, path: string) => {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 160 ||
    value !== value.trim() ||
    /[\u0000-\u001F\u007F-\u009F]/u.test(value)
  ) {
    throw new StrictJsonErrorV1(
      "invalid_identity",
      path,
      "Runtime mount identity is invalid."
    );
  }
  return value;
};

export const requiredTimestampV1 = (value: unknown, path: string) => {
  const text = requiredStringV1(value, path, 40);
  if (!Number.isFinite(Date.parse(text)) || new Date(text).toISOString() !== text) throw new StrictJsonErrorV1("invalid_timestamp", path, "Expected canonical ISO timestamp.");
  return text;
};

export const requiredHashV1 = (value: unknown, path: string, allowGenesis = false) => {
  if (allowGenesis && value === "GENESIS") return value;
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new StrictJsonErrorV1("invalid_hash", path, "Expected lowercase SHA-256.");
  return value;
};
