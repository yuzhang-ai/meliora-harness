import type { JsonValue } from "../../model-protocol/contracts.js";
import { SensitiveDataError } from "./errors.js";

const SENSITIVE_KEY =
  /^(authorization|proxy-authorization|cookie|set-cookie|api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password|private[_-]?reasoning|raw[_-]?environment)$/iu;

const SENSITIVE_VALUE =
  /(?:\bbearer\s+[a-z0-9._~+\/-]+=*|\b(?:sk|api)[-_][a-z0-9_-]{12,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----)/iu;

const visit = (value: JsonValue, path: string): void => {
  if (typeof value === "string" && SENSITIVE_VALUE.test(value)) {
    throw new SensitiveDataError(`Sensitive value rejected at ${path}.`);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (SENSITIVE_KEY.test(key)) {
        throw new SensitiveDataError(`Sensitive field rejected at ${path}.${key}.`);
      }
      visit(nested, `${path}.${key}`);
    }
  }
};

export const assertPersistableJson = (value: JsonValue, path = "payload"): void => visit(value, path);

export const assertPersistableText = (value: string, path = "text"): void => {
  if (SENSITIVE_VALUE.test(value)) {
    throw new SensitiveDataError(`Sensitive value rejected at ${path}.`);
  }
};

export const containsSensitiveCanary = (text: string, canary: string): boolean => text.includes(canary);
