import {
  CANVAS_RUNTIME_V1_CONTRACTS,
  hashCanonicalV1,
  hashCanvasCommandBatchEnvelopeV1,
  type CanvasCapabilitiesV1,
  type CanvasCommandBatchEnvelopeV1,
  type CanvasCommandReceiptV1,
  type CanonicalCanvasPointerV1,
} from "./store-contracts";

export const CANVAS_PORT_V1_CONTRACTS = {
  documentState: "canvas-document-state-v1",
} as const;

export type JsonPrimitiveV1 = string | number | boolean | null;
export type JsonValueV1 =
  | JsonPrimitiveV1
  | JsonValueV1[]
  | { [key: string]: JsonValueV1 };

const FORBIDDEN_JSON_KEYS = new Set(["__proto__", "prototype", "constructor"]);

export class CanvasPortContractErrorV1 extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "CanvasPortContractErrorV1";
    this.code = code;
    this.path = path;
  }
}

const contractFail = (code: string, path: string, message: string): never => {
  throw new CanvasPortContractErrorV1(code, path, message);
};

const decodeJsonValueInternal = (
  value: unknown,
  path: string,
  ancestors: WeakSet<object>
): JsonValueV1 => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      return contractFail("json_non_finite_number", path, "JSON numbers must be finite.");
    }
    return value;
  }
  if (typeof value !== "object") {
    return contractFail("json_invalid_value", path, `Unsupported JSON value: ${typeof value}.`);
  }
  const objectValue = value as object;
  if (ancestors.has(objectValue)) {
    return contractFail("json_cycle", path, "JSON values cannot contain cycles.");
  }
  // WeakSet is not iterable, so reuse the active stack and remove on return.
  ancestors.add(objectValue);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.prototype.hasOwnProperty.call(value, index)) {
          return contractFail(
            "json_sparse_array",
            `${path}[${index}]`,
            "JSON arrays cannot contain sparse holes."
          );
        }
      }
      for (const key of Object.keys(value)) {
        const index = Number(key);
        if (!Number.isSafeInteger(index) || index < 0 || String(index) !== key) {
          return contractFail(
            "json_invalid_array_property",
            `${path}.${key}`,
            "JSON arrays cannot contain named properties."
          );
        }
      }
      return value.map((item, index) =>
        decodeJsonValueInternal(item, `${path}[${index}]`, ancestors)
      );
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      return contractFail("json_invalid_object", path, "Expected a plain JSON object.");
    }
    const output: Record<string, JsonValueV1> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_JSON_KEYS.has(key)) {
        return contractFail(
          "json_forbidden_key",
          `${path}.${key}`,
          "Prototype-sensitive JSON keys are forbidden."
        );
      }
      output[key] = decodeJsonValueInternal(item, `${path}.${key}`, ancestors);
    }
    return output;
  } finally {
    ancestors.delete(objectValue);
  }
};

export const decodeJsonValueV1 = (value: unknown, path = "json"): JsonValueV1 =>
  decodeJsonValueInternal(value, path, new WeakSet<object>());

export const cloneJsonValueV1 = (value: JsonValueV1): JsonValueV1 =>
  decodeJsonValueV1(value);

export type CanvasDocumentStateV1 = {
  contractVersion: typeof CANVAS_PORT_V1_CONTRACTS.documentState;
  documentId: string;
  schemaVersion: string;
  revision: string;
  normalizedState: JsonValueV1;
};

const nonEmptyString = (value: unknown, path: string) => {
  if (typeof value !== "string" || !value.trim()) {
    return contractFail("invalid_string", path, "Expected a non-empty string.");
  }
  return value;
};

export const decodeCanvasDocumentStateV1 = (
  value: unknown,
  path = "documentState"
): CanvasDocumentStateV1 => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return contractFail("invalid_document_state", path, "Expected an object.");
  }
  const input = value as Record<string, unknown>;
  const expectedKeys = [
    "contractVersion",
    "documentId",
    "schemaVersion",
    "revision",
    "normalizedState",
  ];
  for (const key of expectedKeys) {
    if (!(key in input)) contractFail("missing_field", `${path}.${key}`, "Field is required.");
  }
  for (const key of Object.keys(input)) {
    if (!expectedKeys.includes(key)) {
      contractFail("unknown_field", `${path}.${key}`, "Field is not allowed.");
    }
  }
  if (input.contractVersion !== CANVAS_PORT_V1_CONTRACTS.documentState) {
    contractFail(
      "invalid_contract_version",
      `${path}.contractVersion`,
      `Expected ${CANVAS_PORT_V1_CONTRACTS.documentState}.`
    );
  }
  return {
    contractVersion: CANVAS_PORT_V1_CONTRACTS.documentState,
    documentId: nonEmptyString(input.documentId, `${path}.documentId`),
    schemaVersion: nonEmptyString(input.schemaVersion, `${path}.schemaVersion`),
    revision: nonEmptyString(input.revision, `${path}.revision`),
    normalizedState: decodeJsonValueV1(input.normalizedState, `${path}.normalizedState`),
  };
};

const documentFingerprintInput = (document: CanvasDocumentStateV1) => ({
  documentId: document.documentId,
  normalizedState: document.normalizedState,
  revision: document.revision,
  schemaVersion: document.schemaVersion,
});

export const hashCanvasDocumentStateV1 = (document: CanvasDocumentStateV1) =>
  hashCanonicalV1(documentFingerprintInput(document));

export const toCanonicalCanvasPointerV1 = (
  document: CanvasDocumentStateV1
): CanonicalCanvasPointerV1 => ({
  contractVersion: CANVAS_RUNTIME_V1_CONTRACTS.canonicalCanvasPointer,
  documentId: document.documentId,
  schemaVersion: document.schemaVersion,
  revision: document.revision,
  stateFingerprint: hashCanvasDocumentStateV1(document),
});

export type CanvasAdapterErrorCodeV1 =
  | "idempotency_conflict"
  | "transport_response_lost"
  | "readback_mismatch";

export type CanvasAdapterWriteCertaintyV1 = "definite_no_write" | "unknown";
export type CanvasAdapterRetryDispositionV1 = "exact_replay_only" | "do_not_retry";

export type CanvasAdapterErrorIdentityV1 = {
  documentId: string;
  batchId: string;
  idempotencyKey: string;
  commandEnvelopeHash: string;
};

const adapterErrorFacts = (code: CanvasAdapterErrorCodeV1) =>
  code === "idempotency_conflict"
    ? ({
        writeCertainty: "definite_no_write",
        retryDisposition: "do_not_retry",
      } as const)
    : ({
        writeCertainty: "unknown",
        retryDisposition: "exact_replay_only",
      } as const);

export class CanvasAdapterErrorV1 extends Error {
  readonly code: CanvasAdapterErrorCodeV1;
  readonly writeCertainty: CanvasAdapterWriteCertaintyV1;
  readonly retryDisposition: CanvasAdapterRetryDispositionV1;
  readonly documentId: string;
  readonly batchId: string;
  readonly idempotencyKey: string;
  readonly commandEnvelopeHash: string;

  constructor(code: CanvasAdapterErrorCodeV1, identity: CanvasAdapterErrorIdentityV1) {
    const facts = adapterErrorFacts(code);
    super(`${code}: ${identity.documentId}/${identity.batchId}`);
    this.name = "CanvasAdapterErrorV1";
    this.code = code;
    this.writeCertainty = facts.writeCertainty;
    this.retryDisposition = facts.retryDisposition;
    this.documentId = identity.documentId;
    this.batchId = identity.batchId;
    this.idempotencyKey = identity.idempotencyKey;
    this.commandEnvelopeHash = identity.commandEnvelopeHash;
  }

  toJSON() {
    return {
      code: this.code,
      writeCertainty: this.writeCertainty,
      retryDisposition: this.retryDisposition,
      documentId: this.documentId,
      batchId: this.batchId,
      idempotencyKey: this.idempotencyKey,
      commandEnvelopeHash: this.commandEnvelopeHash,
    };
  }
}

export const canvasAdapterErrorIdentityV1 = (
  envelope: CanvasCommandBatchEnvelopeV1
): CanvasAdapterErrorIdentityV1 => ({
  documentId: envelope.documentId,
  batchId: envelope.batchId,
  idempotencyKey: envelope.idempotencyKey,
  commandEnvelopeHash: hashCanvasCommandBatchEnvelopeV1(envelope),
});

export interface CanvasPortV1 {
  getCapabilities(): Promise<CanvasCapabilitiesV1>;
  getDocumentState(input: { documentId: string }): Promise<CanvasDocumentStateV1>;
  applyCommandBatch(input: {
    envelope: CanvasCommandBatchEnvelopeV1;
    commandPayload: unknown;
  }): Promise<CanvasCommandReceiptV1>;
}
