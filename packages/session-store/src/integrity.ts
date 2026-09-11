import { createHash } from "node:crypto";

import type { JsonValue } from "../../model-protocol/contracts.js";

const normalize = (value: JsonValue): JsonValue => {
  if (Array.isArray(value)) return value.map(normalize);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
};

export const canonicalJson = (value: JsonValue): string => JSON.stringify(normalize(value));

export const hashBytes = (value: Uint8Array | string): string =>
  createHash("sha256").update(value).digest("hex");

export const hashJson = (value: JsonValue): string => hashBytes(canonicalJson(value));
