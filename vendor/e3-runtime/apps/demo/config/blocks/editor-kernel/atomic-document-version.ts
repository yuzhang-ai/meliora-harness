import { projectAtomicDocumentGraph } from "./atomic-document-graph";

type UnknownRecord = Record<string, unknown>;

export type AtomicDocumentPointer = Readonly<{
  revision: number;
  atomicFingerprint: string;
  fingerprintAlgorithm: string;
}>;

export type AtomicDocumentSnapshot<T> = Readonly<{
  data: T;
  pointer: AtomicDocumentPointer;
  rootId: string;
  nodeCount: number;
}>;

export type AtomicFingerprintPort = Readonly<{
  fingerprint: (atomicFact: unknown) => string;
  id: string;
}>;

const isRecord = (value: unknown): value is UnknownRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

export const cloneAndDeepFreeze = <T>(value: T): T => {
  const clone = structuredClone(value);
  const freeze = (entry: unknown): unknown => {
    if (Array.isArray(entry)) {
      entry.forEach((item) => freeze(item));
      return Object.freeze(entry);
    }
    if (entry && typeof entry === "object") {
      Object.values(entry).forEach((item) => freeze(item));
      return Object.freeze(entry);
    }
    return entry;
  };
  return freeze(clone) as T;
};

export const canonicalAtomicJson = (
  value: unknown,
  inArray = false
): string => {
  if (value === undefined) return inArray ? "null" : "";
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Atomic fingerprint rejects non-finite numbers.");
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value
      .map((item) => canonicalAtomicJson(item, true))
      .join(",")}]`;
  }
  if (isRecord(value)) {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(
        ([key, item]) =>
          `${JSON.stringify(key)}:${canonicalAtomicJson(item, false)}`
      )
      .join(",")}}`;
  }
  throw new Error(`Atomic fingerprint rejects ${typeof value} values.`);
};

const fnv1a64 = (value: string, seed: bigint) => {
  const prime = BigInt("1099511628211");
  let hash = seed;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = BigInt.asUintN(64, hash * prime);
  }
  return hash.toString(16).padStart(16, "0");
};

/**
 * Browser-safe deterministic fingerprint for UX-side optimistic concurrency.
 * It is intentionally not advertised as a cryptographic Harness fingerprint;
 * K5 may replace it through AtomicFingerprintPort without changing K2.
 */
export const browserAtomicFingerprintPort: AtomicFingerprintPort =
  Object.freeze({
    id: "canonical-json-fnv128-v1",
    fingerprint: (atomicFact: unknown) => {
      const canonical = canonicalAtomicJson(atomicFact);
      const left = fnv1a64(canonical, BigInt("14695981039346656037"));
      const right = fnv1a64(canonical, BigInt("9521211207457086692"));
      return `atomic-fnv128-v1:${canonical.length}:${left}${right}`;
    },
  });

export const atomicJsonEquals = (left: unknown, right: unknown) =>
  canonicalAtomicJson(left) === canonicalAtomicJson(right);

const atomicFactSurface = (value: unknown) => {
  if (!isRecord(value)) throw new Error("Atomic document must be an object.");
  return { content: value.content, zones: value.zones };
};

export const atomicDocumentPointerEquals = (
  left: AtomicDocumentPointer,
  right: AtomicDocumentPointer
) =>
  left.revision === right.revision &&
  left.atomicFingerprint === right.atomicFingerprint &&
  left.fingerprintAlgorithm === right.fingerprintAlgorithm;

export const createAtomicDocumentSnapshot = <T>(
  data: T,
  revision = 0,
  fingerprintPort = browserAtomicFingerprintPort
): AtomicDocumentSnapshot<T> => {
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("Atomic document revision must be a non-negative integer.");
  }
  // Graph projection is the fail-closed writable fact/layout validation gate.
  // Do not perform the same full-tree validation twice before cloning.
  const graph = projectAtomicDocumentGraph(data);
  const frozenData = cloneAndDeepFreeze(data);
  const atomicFingerprint = fingerprintPort.fingerprint(
    atomicFactSurface(frozenData)
  );
  if (!atomicFingerprint.trim()) {
    throw new Error("Atomic fingerprint port returned an empty fingerprint.");
  }
  return Object.freeze({
    data: frozenData,
    pointer: Object.freeze({
      revision,
      atomicFingerprint,
      fingerprintAlgorithm: fingerprintPort.id,
    }),
    rootId: graph.rootId,
    nodeCount: graph.size,
  });
};

export const assertAtomicDocumentSnapshotIntegrity = <T>(
  snapshot: AtomicDocumentSnapshot<T>,
  fingerprintPort = browserAtomicFingerprintPort
) => {
  const recalculated = createAtomicDocumentSnapshot(
    snapshot.data,
    snapshot.pointer.revision,
    fingerprintPort
  );
  if (!atomicDocumentPointerEquals(recalculated.pointer, snapshot.pointer)) {
    throw new AtomicDocumentStaleError(
      recalculated.pointer.fingerprintAlgorithm !==
        snapshot.pointer.fingerprintAlgorithm
        ? "algorithm"
        : "fingerprint",
      snapshot.pointer,
      recalculated.pointer
    );
  }
};

export class AtomicDocumentStaleError extends Error {
  readonly mismatch: "revision" | "fingerprint" | "algorithm";
  readonly expected: AtomicDocumentPointer;
  readonly actual: AtomicDocumentPointer;

  constructor(
    mismatch: "revision" | "fingerprint" | "algorithm",
    expected: AtomicDocumentPointer,
    actual: AtomicDocumentPointer
  ) {
    super(`Atomic document ${mismatch} is stale.`);
    this.name = "AtomicDocumentStaleError";
    this.mismatch = mismatch;
    this.expected = cloneAndDeepFreeze(expected);
    this.actual = cloneAndDeepFreeze(actual);
  }
}

export const assertAtomicDocumentPointer = (
  expected: AtomicDocumentPointer,
  actual: AtomicDocumentPointer
) => {
  if (expected.revision !== actual.revision) {
    throw new AtomicDocumentStaleError("revision", expected, actual);
  }
  if (expected.fingerprintAlgorithm !== actual.fingerprintAlgorithm) {
    throw new AtomicDocumentStaleError("algorithm", expected, actual);
  }
  if (expected.atomicFingerprint !== actual.atomicFingerprint) {
    throw new AtomicDocumentStaleError("fingerprint", expected, actual);
  }
};
