import type { JsonValue } from "../../model-protocol/contracts.js";
import { SensitiveDataError } from "./errors.js";

const SENSITIVE_VALUE =
  /(?:\bbearer\s*[=:]\s*\S+|\bbearer\s+[a-z0-9._~+\/=\-]{16,}(?=$|[^a-z0-9._~+\/=\-])|\b(?:sk|api)[-_][a-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/iu;

const SENSITIVE_TEXT_FIELD =
  /(?:^|["'\s{,;])(?:[a-z0-9_-]*api[ _-]?key|authorization|proxy[-_]?authorization|cookie|set[ _-]?cookie|access[-_]?token|refresh[-_]?token|client[-_]?secret|password|token|private[-_]?reasoning|raw[-_]?environment)["']?\s*[:=]/iu;

const normalizeKey = (key: string): string => key.normalize("NFKC").toLowerCase().replace(/[^a-z0-9]/gu, "");

const isSensitiveKey = (key: string): boolean => {
  const normalized = normalizeKey(key);
  return normalized === "authorization"
    || normalized === "proxyauthorization"
    || normalized === "cookie"
    || normalized === "setcookie"
    || normalized.endsWith("apikey")
    || normalized.endsWith("accesstoken")
    || normalized.endsWith("refreshtoken")
    || normalized === "token"
    || normalized.endsWith("token")
    || normalized.endsWith("clientsecret")
    || normalized.endsWith("password")
    || normalized === "privatereasoning"
    || normalized === "rawenvironment";
};

const visit = (value: JsonValue, path: string): void => {
  // JSON is also used for private recovery envelopes. Do not only inspect
  // field names there: a credential-shaped header can be smuggled through a
  // nominally harmless string field such as an identifier or media type.
  if (typeof value === "string") {
    assertPersistableText(value, path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (isSensitiveKey(key)) {
        throw new SensitiveDataError(`Sensitive field rejected at ${path}.${key}.`);
      }
      visit(nested, `${path}.${key}`);
    }
  }
};

export const assertPersistableJson = (value: JsonValue, path = "payload"): void => visit(value, path);

export const assertPersistableText = (value: string, path = "text"): void => {
  const normalized = value.normalize("NFKC");
  if (SENSITIVE_VALUE.test(normalized) || SENSITIVE_TEXT_FIELD.test(normalized)) {
    throw new SensitiveDataError(`Sensitive value rejected at ${path}.`);
  }
};

export const assertPersistableBytes = (value: Uint8Array, path = "bytes"): void => {
  const decoded = new Set<string>();
  for (const encoding of ["utf-8", "utf-16le", "utf-16be"] as const) {
    decoded.add(new TextDecoder(encoding).decode(value));
  }
  for (const text of decoded) assertPersistableText(text, path);
};

export const containsSensitiveCanary = (text: string, canary: string): boolean => text.includes(canary);
