import {
  assertStrictJsonV1,
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";
import {
  R2_SELECTION_C0_ATOM_TYPES_V1,
  R2_SELECTION_C0_V1,
  type R2SelectionC0AtomTypeV1,
  type R2SelectionC0DeviceV1,
} from "./r2-selection-c0-profile";
export {
  R2_SELECTION_C0_ATOM_TYPES_V1,
  R2_SELECTION_C0_V1,
  type R2SelectionC0AtomTypeV1,
  type R2SelectionC0DeviceV1,
};

export const R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1 = hashCanonicalJsonV1({
  profileId: R2_SELECTION_C0_V1.profileId,
  catalogEpoch: R2_SELECTION_C0_V1.catalogEpoch,
  requestVersion: R2_SELECTION_C0_V1.requestVersion,
  resultVersion: R2_SELECTION_C0_V1.resultVersion,
  selectionBindingVersion: R2_SELECTION_C0_V1.selectionBindingVersion,
  integrityPortVersion: R2_SELECTION_C0_V1.integrityPortVersion,
  sourceContractVersion: R2_SELECTION_C0_V1.sourceContractVersion,
  sourceCommit: R2_SELECTION_C0_V1.sourceCommit,
  sourcePath: R2_SELECTION_C0_V1.sourcePath,
  sourceBlobOid: R2_SELECTION_C0_V1.sourceBlobOid,
  fingerprintSourcePath: R2_SELECTION_C0_V1.fingerprintSourcePath,
  fingerprintSourceBlobOid: R2_SELECTION_C0_V1.fingerprintSourceBlobOid,
  browserPathname: R2_SELECTION_C0_V1.browserPathname,
  routePath: R2_SELECTION_C0_V1.routePath,
  documentId: R2_SELECTION_C0_V1.documentId,
  captureProfile: R2_SELECTION_C0_V1.captureProfile,
  pointerFingerprintAlgorithm:
    R2_SELECTION_C0_V1.pointerFingerprintAlgorithm,
  admittedDevices: R2_SELECTION_C0_V1.admittedDevices,
  limits: {
    maxNodes: R2_SELECTION_C0_V1.maxNodes,
    maxDepth: R2_SELECTION_C0_V1.maxDepth,
    maxSelectedRefs: R2_SELECTION_C0_V1.maxSelectedRefs,
    maxNodeChildren: R2_SELECTION_C0_V1.maxNodeChildren,
  },
  cursor: "request_forbidden_result_null_no_issuer_parser_or_store",
  selection: "host_bound_zero_or_one_no_truncation",
});

export type R2SelectionC0RequestV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_V1.requestVersion;
  scope: "selection";
}>;

export type R2SelectionC0PointerV1 = Readonly<{
  revision: number;
  atomicFingerprint: string;
  fingerprintAlgorithm: typeof R2_SELECTION_C0_V1.pointerFingerprintAlgorithm;
}>;

export type R2SelectionC0ReadbackNodeV1 = Readonly<{
  authoredHidden: boolean;
  authoredLocked: boolean;
  childIds: readonly string[];
  depth: number;
  id: string;
  indexInParent: number | null;
  layoutMode: "free" | "vertical" | "horizontal" | "grid" | null;
  parentId: string | null;
  type: R2SelectionC0AtomTypeV1;
}>;

export type R2SelectionC0RenderingNodeV1 = Readonly<{
  clipsDescendants: boolean;
  hitShape: "ellipse" | "none" | "rectangle";
  id: string;
  interactionEligibility: Readonly<{
    eligible: boolean;
    reason:
      | "eligible"
      | "hidden"
      | "locked"
      | "missing"
      | "non-interactive-geometry";
  }>;
  paintIndex: number;
  visible: boolean;
  zIndex: number;
}>;

export type R2SelectionC0ReadbackV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_V1.sourceContractVersion;
  device: R2SelectionC0DeviceV1;
  document: Readonly<{
    pointer: R2SelectionC0PointerV1;
    rootId: string;
  }>;
  frameId: number;
  painting: Readonly<{ bottomToTopIds: readonly string[] }>;
  readbackHash: string;
  rendering: readonly R2SelectionC0RenderingNodeV1[];
  structure: Readonly<{
    nodes: readonly R2SelectionC0ReadbackNodeV1[];
    preorderIds: readonly string[];
    slots: readonly Readonly<{
      childIds: readonly string[];
      parentId: string;
    }>[];
  }>;
}>;

/**
 * Recomputes the UX-owned FNV fingerprint for structural consistency only.
 * This port is not an authority credential: runtime admission must separately
 * prove the durable Host selection binding and its Run/Grant ownership.
 */
export type R2SelectionC0IntegrityPortV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_V1.integrityPortVersion;
  sourceCommit: typeof R2_SELECTION_C0_V1.sourceCommit;
  sourceContractVersion: typeof R2_SELECTION_C0_V1.sourceContractVersion;
  sourceBlobOid: typeof R2_SELECTION_C0_V1.sourceBlobOid;
  fingerprintSourceBlobOid: typeof R2_SELECTION_C0_V1.fingerprintSourceBlobOid;
  fingerprintAlgorithm: typeof R2_SELECTION_C0_V1.pointerFingerprintAlgorithm;
  verify: (payloadWithoutReadbackHash: unknown, claimedHash: string) => boolean;
}>;

export type R2SelectionC0ExpectedIdentityV1 = Readonly<{
  device: R2SelectionC0DeviceV1;
  frameId: number;
  pointer: R2SelectionC0PointerV1;
  readbackHash: string;
}>;

export type R2SelectionC0SelectionBindingV1 = Readonly<{
  bindingHash: string;
  capturedAt: string;
  contractVersion: typeof R2_SELECTION_C0_V1.selectionBindingVersion;
  device: R2SelectionC0DeviceV1;
  documentId: typeof R2_SELECTION_C0_V1.documentId;
  expiresAt: string;
  frameId: number;
  grantId: string;
  mountId: string;
  pointer: R2SelectionC0PointerV1;
  queryHash: string;
  readbackHash: string;
  routePath: typeof R2_SELECTION_C0_V1.routePath;
  runId: string;
  selectedNodeRefs: readonly string[];
  sessionId: string;
  turnId: string;
  workspaceId: string;
}>;

export type R2SelectionC0ResultV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_V1.resultVersion;
  kind: "r2_selection_c0_read_result";
  nextCursor: null;
  scope: "selection";
  source: Readonly<{
    captureProfile: typeof R2_SELECTION_C0_V1.captureProfile;
    device: R2SelectionC0DeviceV1;
    freshness: "turn_bound";
    routePath: typeof R2_SELECTION_C0_V1.routePath;
  }>;
  selection: Readonly<{
    atomType: R2SelectionC0AtomTypeV1;
    authoredHidden: boolean;
    authoredLocked: boolean;
    interactionEligibility: Readonly<{
      eligible: boolean;
      reason: R2SelectionC0RenderingNodeV1["interactionEligibility"]["reason"];
    }>;
    layoutMode: R2SelectionC0ReadbackNodeV1["layoutMode"];
    nodeRef: string;
    visible: boolean;
  }> | null;
}>;

export class R2SelectionC0ContractErrorV1 extends Error {
  constructor(readonly code: string, readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "R2SelectionC0ContractErrorV1";
  }
}

const fail = (code: string, path: string, message: string): never => {
  throw new R2SelectionC0ContractErrorV1(code, path, message);
};

const selectionBindingMaterial = (
  input: Omit<R2SelectionC0SelectionBindingV1, "bindingHash">
) => ({
  capturedAt: input.capturedAt,
  contractVersion: input.contractVersion,
  device: input.device,
  documentId: input.documentId,
  expiresAt: input.expiresAt,
  frameId: input.frameId,
  grantId: input.grantId,
  mountId: input.mountId,
  pointer: input.pointer,
  queryHash: input.queryHash,
  readbackHash: input.readbackHash,
  routePath: input.routePath,
  runId: input.runId,
  selectedNodeRefs: input.selectedNodeRefs,
  sessionId: input.sessionId,
  turnId: input.turnId,
  workspaceId: input.workspaceId,
});

const exactArray = (value: unknown, path: string, max: number) => {
  try {
    assertStrictJsonV1(value, path);
  } catch {
    return fail("r2_c0_array_invalid", path, "Expected a dense JSON array.");
  }
  if (!Array.isArray(value) || value.length > max) {
    return fail(
      "r2_c0_array_invalid",
      path,
      `Expected at most ${max} array entries.`
    );
  }
  return value;
};

const booleanValue = (value: unknown, path: string) => {
  if (typeof value !== "boolean") {
    return fail("r2_c0_boolean_invalid", path, "Expected a boolean.");
  }
  return value;
};

const safeInteger = (
  value: unknown,
  path: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER
) => {
  if (!Number.isSafeInteger(value) || Number(value) < minimum || Number(value) > maximum) {
    return fail(
      "r2_c0_integer_invalid",
      path,
      `Expected a safe integer from ${minimum} through ${maximum}.`
    );
  }
  return Number(value);
};

const oneOf = <T extends string>(
  value: unknown,
  values: readonly T[],
  path: string
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    return fail(
      "r2_c0_enum_invalid",
      path,
      `Expected one of ${values.join(", ")}.`
    );
  }
  return value as T;
};

const nullableId = (value: unknown, path: string) =>
  value === null ? null : requiredIdV1(value, path);

const uniqueIds = (value: unknown, path: string, max: number) => {
  const ids = exactArray(value, path, max).map((entry, index) =>
    requiredIdV1(entry, `${path}[${index}]`)
  );
  if (new Set(ids).size !== ids.length) {
    return fail("r2_c0_duplicate_id", path, "IDs must be unique.");
  }
  return ids;
};

const sameIds = (left: readonly string[], right: readonly string[]) =>
  left.length === right.length && left.every((id, index) => id === right[index]);

const frozen = <T>(value: T): T => {
  const freeze = (entry: unknown): unknown => {
    if (Array.isArray(entry)) {
      entry.forEach(freeze);
      return Object.freeze(entry);
    }
    if (entry && typeof entry === "object") {
      Object.values(entry).forEach(freeze);
      return Object.freeze(entry);
    }
    return entry;
  };
  return freeze(structuredClone(value)) as T;
};

export const decodeR2SelectionC0RequestV1 = (
  value: unknown
): R2SelectionC0RequestV1 => {
  let record: Record<string, unknown>;
  try {
    record = strictRecordV1(
      value,
      ["contractVersion", "scope"],
      "r2SelectionC0Request"
    );
  } catch {
    return fail(
      "r2_selection_request_invalid",
      "r2SelectionC0Request",
      "The request must contain only contractVersion and scope; cursor is not installed."
    );
  }
  if (
    record.contractVersion !== R2_SELECTION_C0_V1.requestVersion ||
    record.scope !== "selection"
  ) {
    return fail(
      "r2_selection_request_invalid",
      "r2SelectionC0Request",
      "The request does not match the exact selection-only contract."
    );
  }
  return frozen({
    contractVersion: R2_SELECTION_C0_V1.requestVersion,
    scope: "selection",
  });
};

const decodePointer = (value: unknown): R2SelectionC0PointerV1 => {
  const path = "r2SelectionC0Readback.document.pointer";
  const record = strictRecordV1(
    value,
    ["revision", "atomicFingerprint", "fingerprintAlgorithm"],
    path
  );
  const atomicFingerprint = requiredStringV1(
    record.atomicFingerprint,
    `${path}.atomicFingerprint`,
    240
  );
  if (record.fingerprintAlgorithm !== R2_SELECTION_C0_V1.pointerFingerprintAlgorithm) {
    return fail(
      "r2_c0_pointer_algorithm_mismatch",
      `${path}.fingerprintAlgorithm`,
      "The pointer algorithm is outside the pinned UX source contract."
    );
  }
  return {
    revision: safeInteger(record.revision, `${path}.revision`, 0),
    atomicFingerprint,
    fingerprintAlgorithm: R2_SELECTION_C0_V1.pointerFingerprintAlgorithm,
  };
};

export const createR2SelectionC0SelectionBindingV1 = (
  input: Omit<
    R2SelectionC0SelectionBindingV1,
    "bindingHash" | "contractVersion" | "documentId" | "routePath"
  >
): R2SelectionC0SelectionBindingV1 => {
  const material = selectionBindingMaterial({
    ...input,
    contractVersion: R2_SELECTION_C0_V1.selectionBindingVersion,
    documentId: R2_SELECTION_C0_V1.documentId,
    routePath: R2_SELECTION_C0_V1.routePath,
  });
  return decodeR2SelectionC0SelectionBindingV1({
    ...material,
    bindingHash: hashCanonicalJsonV1(material),
  });
};

export const decodeR2SelectionC0SelectionBindingV1 = (
  value: unknown
): R2SelectionC0SelectionBindingV1 => {
  const path = "r2SelectionC0SelectionBinding";
  const record = strictRecordV1(
    value,
    [
      "bindingHash",
      "capturedAt",
      "contractVersion",
      "device",
      "documentId",
      "expiresAt",
      "frameId",
      "grantId",
      "mountId",
      "pointer",
      "queryHash",
      "readbackHash",
      "routePath",
      "runId",
      "selectedNodeRefs",
      "sessionId",
      "turnId",
      "workspaceId",
    ],
    path
  );
  if (
    record.contractVersion !== R2_SELECTION_C0_V1.selectionBindingVersion ||
    record.documentId !== R2_SELECTION_C0_V1.documentId ||
    record.routePath !== R2_SELECTION_C0_V1.routePath
  ) {
    return fail(
      "r2_selection_binding_target_mismatch",
      path,
      "The selection binding is outside the exact R2 target."
    );
  }
  const capturedAt = requiredTimestampV1(record.capturedAt, `${path}.capturedAt`);
  const expiresAt = requiredTimestampV1(record.expiresAt, `${path}.expiresAt`);
  if (Date.parse(expiresAt) <= Date.parse(capturedAt)) {
    return fail(
      "r2_selection_binding_ttl_invalid",
      `${path}.expiresAt`,
      "The selection binding must expire after capture."
    );
  }
  const selectedNodeRefs = uniqueIds(
    record.selectedNodeRefs,
    `${path}.selectedNodeRefs`,
    R2_SELECTION_C0_V1.maxNodes
  );
  if (selectedNodeRefs.length > R2_SELECTION_C0_V1.maxSelectedRefs) {
    return fail(
      "selection_cardinality_exceeded",
      `${path}.selectedNodeRefs`,
      "The Host binding admits at most one selected node and never truncates."
    );
  }
  const material = selectionBindingMaterial({
    capturedAt,
    contractVersion: R2_SELECTION_C0_V1.selectionBindingVersion,
    device: oneOf(
      record.device,
      R2_SELECTION_C0_V1.admittedDevices,
      `${path}.device`
    ),
    documentId: R2_SELECTION_C0_V1.documentId,
    expiresAt,
    frameId: safeInteger(record.frameId, `${path}.frameId`, 0),
    grantId: requiredIdV1(record.grantId, `${path}.grantId`),
    mountId: requiredRuntimeMountIdV1(record.mountId, `${path}.mountId`),
    pointer: decodePointer(record.pointer),
    queryHash: requiredHashV1(record.queryHash, `${path}.queryHash`),
    readbackHash: requiredStringV1(
      record.readbackHash,
      `${path}.readbackHash`,
      240
    ),
    routePath: R2_SELECTION_C0_V1.routePath,
    runId: requiredIdV1(record.runId, `${path}.runId`),
    selectedNodeRefs,
    sessionId: requiredIdV1(record.sessionId, `${path}.sessionId`),
    turnId: requiredIdV1(record.turnId, `${path}.turnId`),
    workspaceId: requiredIdV1(record.workspaceId, `${path}.workspaceId`),
  });
  const bindingHash = requiredHashV1(record.bindingHash, `${path}.bindingHash`);
  if (bindingHash !== hashCanonicalJsonV1(material)) {
    return fail(
      "r2_selection_binding_hash_mismatch",
      `${path}.bindingHash`,
      "The Host selection binding was modified."
    );
  }
  return frozen({ ...material, bindingHash });
};

const decodeNode = (
  value: unknown,
  index: number
): R2SelectionC0ReadbackNodeV1 => {
  const path = `r2SelectionC0Readback.structure.nodes[${index}]`;
  const record = strictRecordV1(
    value,
    [
      "authoredHidden",
      "authoredLocked",
      "childIds",
      "depth",
      "id",
      "indexInParent",
      "layoutMode",
      "parentId",
      "type",
    ],
    path
  );
  const indexInParent =
    record.indexInParent === null
      ? null
      : safeInteger(
          record.indexInParent,
          `${path}.indexInParent`,
          0,
          R2_SELECTION_C0_V1.maxNodeChildren - 1
        );
  return {
    authoredHidden: booleanValue(record.authoredHidden, `${path}.authoredHidden`),
    authoredLocked: booleanValue(record.authoredLocked, `${path}.authoredLocked`),
    childIds: uniqueIds(
      record.childIds,
      `${path}.childIds`,
      R2_SELECTION_C0_V1.maxNodeChildren
    ),
    depth: safeInteger(
      record.depth,
      `${path}.depth`,
      0,
      R2_SELECTION_C0_V1.maxDepth
    ),
    id: requiredIdV1(record.id, `${path}.id`),
    indexInParent,
    layoutMode:
      record.layoutMode === null
        ? null
        : oneOf(
            record.layoutMode,
            ["free", "vertical", "horizontal", "grid"] as const,
            `${path}.layoutMode`
          ),
    parentId: nullableId(record.parentId, `${path}.parentId`),
    type: oneOf(record.type, R2_SELECTION_C0_ATOM_TYPES_V1, `${path}.type`),
  };
};

const decodeRenderingNode = (
  value: unknown,
  index: number
): R2SelectionC0RenderingNodeV1 => {
  const path = `r2SelectionC0Readback.rendering[${index}]`;
  const record = strictRecordV1(
    value,
    [
      "clipsDescendants",
      "hitShape",
      "id",
      "interactionEligibility",
      "paintIndex",
      "visible",
      "zIndex",
    ],
    path
  );
  const eligibility = strictRecordV1(
    record.interactionEligibility,
    ["eligible", "reason"],
    `${path}.interactionEligibility`
  );
  return {
    clipsDescendants: booleanValue(
      record.clipsDescendants,
      `${path}.clipsDescendants`
    ),
    hitShape: oneOf(
      record.hitShape,
      ["ellipse", "none", "rectangle"] as const,
      `${path}.hitShape`
    ),
    id: requiredIdV1(record.id, `${path}.id`),
    interactionEligibility: {
      eligible: booleanValue(
        eligibility.eligible,
        `${path}.interactionEligibility.eligible`
      ),
      reason: oneOf(
        eligibility.reason,
        [
          "eligible",
          "hidden",
          "locked",
          "missing",
          "non-interactive-geometry",
        ] as const,
        `${path}.interactionEligibility.reason`
      ),
    },
    paintIndex: safeInteger(
      record.paintIndex,
      `${path}.paintIndex`,
      0,
      R2_SELECTION_C0_V1.maxNodes - 1
    ),
    visible: booleanValue(record.visible, `${path}.visible`),
    zIndex: safeInteger(
      record.zIndex,
      `${path}.zIndex`,
      Number.MIN_SAFE_INTEGER,
      Number.MAX_SAFE_INTEGER
    ),
  };
};

const assertIntegrityPort = (port: R2SelectionC0IntegrityPortV1) => {
  if (
    port.contractVersion !== R2_SELECTION_C0_V1.integrityPortVersion ||
    port.sourceCommit !== R2_SELECTION_C0_V1.sourceCommit ||
    port.sourceContractVersion !== R2_SELECTION_C0_V1.sourceContractVersion ||
    port.sourceBlobOid !== R2_SELECTION_C0_V1.sourceBlobOid ||
    port.fingerprintSourceBlobOid !==
      R2_SELECTION_C0_V1.fingerprintSourceBlobOid ||
    port.fingerprintAlgorithm !== R2_SELECTION_C0_V1.pointerFingerprintAlgorithm ||
    typeof port.verify !== "function"
  ) {
    return fail(
      "r2_c0_integrity_port_mismatch",
      "r2SelectionC0IntegrityPort",
      "The integrity port is not pinned to the exact UX C0 source."
    );
  }
};

export const decodeR2SelectionC0ReadbackV1 = (
  value: unknown,
  integrityPort: R2SelectionC0IntegrityPortV1,
  expectedIdentity: R2SelectionC0ExpectedIdentityV1
): R2SelectionC0ReadbackV1 => {
  assertIntegrityPort(integrityPort);
  const expectedDevice = oneOf(
    expectedIdentity.device,
    R2_SELECTION_C0_V1.admittedDevices,
    "r2SelectionC0ExpectedIdentity.device"
  );
  const expectedFrameId = safeInteger(
    expectedIdentity.frameId,
    "r2SelectionC0ExpectedIdentity.frameId",
    0
  );
  const expectedPointer = decodePointer(expectedIdentity.pointer);
  const expectedReadbackHash = requiredStringV1(
    expectedIdentity.readbackHash,
    "r2SelectionC0ExpectedIdentity.readbackHash",
    240
  );
  const path = "r2SelectionC0Readback";
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "device",
      "document",
      "frameId",
      "painting",
      "readbackHash",
      "rendering",
      "structure",
    ],
    path
  );
  if (record.contractVersion !== R2_SELECTION_C0_V1.sourceContractVersion) {
    return fail(
      "r2_c0_contract_version_mismatch",
      `${path}.contractVersion`,
      "The readback contract version is not installed."
    );
  }
  const device = oneOf(
    record.device,
    R2_SELECTION_C0_V1.admittedDevices,
    `${path}.device`
  );
  const document = strictRecordV1(
    record.document,
    ["pointer", "rootId"],
    `${path}.document`
  );
  const pointer = decodePointer(document.pointer);
  const rootId = requiredIdV1(document.rootId, `${path}.document.rootId`);
  const structure = strictRecordV1(
    record.structure,
    ["nodes", "preorderIds", "slots"],
    `${path}.structure`
  );
  const nodes = exactArray(
    structure.nodes,
    `${path}.structure.nodes`,
    R2_SELECTION_C0_V1.maxNodes
  ).map(decodeNode);
  if (nodes.length < 1) {
    return fail(
      "r2_c0_structure_empty",
      `${path}.structure.nodes`,
      "The atomic document must contain one root node."
    );
  }
  const preorderIds = uniqueIds(
    structure.preorderIds,
    `${path}.structure.preorderIds`,
    R2_SELECTION_C0_V1.maxNodes
  );
  if (!sameIds(preorderIds, nodes.map((node) => node.id))) {
    return fail(
      "r2_c0_preorder_closure_mismatch",
      `${path}.structure.preorderIds`,
      "Preorder IDs must exactly match nodes in authored order."
    );
  }
  const nodeById = new Map(nodes.map((node) => [node.id, node] as const));
  if (preorderIds[0] !== rootId) {
    return fail(
      "r2_c0_root_mismatch",
      `${path}.document.rootId`,
      "The document root must be the first authored node."
    );
  }
  for (const node of nodes) {
    if (node.id === rootId) {
      if (node.parentId !== null || node.indexInParent !== null || node.depth !== 0) {
        return fail(
          "r2_c0_root_mismatch",
          `${path}.structure.nodes`,
          "The root parent, index and depth are invalid."
        );
      }
      continue;
    }
    if (node.parentId === null || node.indexInParent === null) {
      return fail(
        "r2_c0_parent_closure_mismatch",
        `${path}.structure.nodes`,
        "Every non-root node requires one parent and index."
      );
    }
    const parent = nodeById.get(node.parentId);
    if (
      !parent ||
      parent.childIds[node.indexInParent] !== node.id ||
      node.depth !== parent.depth + 1
    ) {
      return fail(
        "r2_c0_parent_closure_mismatch",
        `${path}.structure.nodes`,
        "Parent, child, index and depth facts do not close."
      );
    }
  }
  const childIds = nodes.flatMap((node) => node.childIds);
  if (
    childIds.length !== nodes.length - 1 ||
    new Set(childIds).size !== childIds.length ||
    childIds.some((id) => id === rootId || !nodeById.has(id))
  ) {
    return fail(
      "r2_c0_child_closure_mismatch",
      `${path}.structure.nodes`,
      "Child IDs must cover each non-root node exactly once."
    );
  }

  const slots = exactArray(
    structure.slots,
    `${path}.structure.slots`,
    R2_SELECTION_C0_V1.maxNodes
  ).map((value, index) => {
    const slotPath = `${path}.structure.slots[${index}]`;
    const slot = strictRecordV1(value, ["childIds", "parentId"], slotPath);
    return {
      childIds: uniqueIds(
        slot.childIds,
        `${slotPath}.childIds`,
        R2_SELECTION_C0_V1.maxNodeChildren
      ),
      parentId: requiredIdV1(slot.parentId, `${slotPath}.parentId`),
    };
  });
  const expectedSlots = nodes
    .filter((node) => node.layoutMode !== null)
    .map((node) => ({ childIds: node.childIds, parentId: node.id }));
  if (
    slots.length !== expectedSlots.length ||
    slots.some(
      (slot, index) =>
        slot.parentId !== expectedSlots[index]!.parentId ||
        !sameIds(slot.childIds, expectedSlots[index]!.childIds)
    )
  ) {
    return fail(
      "r2_c0_slot_closure_mismatch",
      `${path}.structure.slots`,
      "Slots must exactly project authored child order for layout owners."
    );
  }

  const painting = strictRecordV1(
    record.painting,
    ["bottomToTopIds"],
    `${path}.painting`
  );
  const bottomToTopIds = uniqueIds(
    painting.bottomToTopIds,
    `${path}.painting.bottomToTopIds`,
    R2_SELECTION_C0_V1.maxNodes
  );
  if (
    bottomToTopIds.length !== nodes.length ||
    bottomToTopIds.some((id) => !nodeById.has(id))
  ) {
    return fail(
      "r2_c0_paint_closure_mismatch",
      `${path}.painting.bottomToTopIds`,
      "Painting order must close over the exact node set."
    );
  }
  const rendering = exactArray(
    record.rendering,
    `${path}.rendering`,
    R2_SELECTION_C0_V1.maxNodes
  ).map(decodeRenderingNode);
  if (!sameIds(rendering.map((node) => node.id), preorderIds)) {
    return fail(
      "r2_c0_rendering_closure_mismatch",
      `${path}.rendering`,
      "Rendering entries must match the authored node set and order."
    );
  }
  const paintingIndexById = new Map(
    bottomToTopIds.map((id, index) => [id, index] as const)
  );
  if (
    rendering.some(
      (node) => paintingIndexById.get(node.id) !== node.paintIndex
    )
  ) {
    return fail(
      "r2_c0_paint_index_mismatch",
      `${path}.rendering`,
      "Rendering paintIndex must match bottom-to-top painting order."
    );
  }
  const readbackHash = requiredStringV1(
    record.readbackHash,
    `${path}.readbackHash`,
    240
  );
  if (readbackHash !== expectedReadbackHash) {
    return fail(
      "r2_c0_expected_identity_mismatch",
      `${path}.readbackHash`,
      "The readback hash differs from the Host-bound capture identity."
    );
  }
  const frameId = safeInteger(record.frameId, `${path}.frameId`, 0);
  if (
    device !== expectedDevice ||
    frameId !== expectedFrameId ||
    pointer.revision !== expectedPointer.revision ||
    pointer.atomicFingerprint !== expectedPointer.atomicFingerprint ||
    pointer.fingerprintAlgorithm !== expectedPointer.fingerprintAlgorithm
  ) {
    return fail(
      "r2_c0_expected_identity_mismatch",
      path,
      "The readback pointer, device or frame differs from the Host-bound capture identity."
    );
  }
  const payload = {
    contractVersion: R2_SELECTION_C0_V1.sourceContractVersion,
    device,
    document: { pointer, rootId },
    frameId,
    painting: { bottomToTopIds },
    rendering,
    structure: { nodes, preorderIds, slots },
  } as const;
  let verified = false;
  try {
    verified = integrityPort.verify(payload, readbackHash) === true;
  } catch {
    verified = false;
  }
  if (!verified) {
    return fail(
      "r2_c0_readback_hash_mismatch",
      `${path}.readbackHash`,
      "The UX-owned integrity port rejected the complete readback payload."
    );
  }
  return frozen({ ...payload, readbackHash });
};

export const projectR2SelectionC0ResultV1 = (input: Readonly<{
  readback: R2SelectionC0ReadbackV1;
  selectionBinding: R2SelectionC0SelectionBindingV1;
}>): R2SelectionC0ResultV1 => {
  const binding = decodeR2SelectionC0SelectionBindingV1(
    input.selectionBinding
  );
  if (
    binding.readbackHash !== input.readback.readbackHash ||
    binding.device !== input.readback.device ||
    binding.frameId !== input.readback.frameId ||
    binding.pointer.revision !== input.readback.document.pointer.revision ||
    binding.pointer.atomicFingerprint !==
      input.readback.document.pointer.atomicFingerprint ||
    binding.pointer.fingerprintAlgorithm !==
      input.readback.document.pointer.fingerprintAlgorithm
  ) {
    return fail(
      "r2_selection_binding_readback_mismatch",
      "r2SelectionC0Projection.selectionBinding",
      "The Host selection binding and validated C0 readback are not one capture identity."
    );
  }
  const nodeRef = binding.selectedNodeRefs[0];
  let selection: R2SelectionC0ResultV1["selection"] = null;
  if (nodeRef !== undefined) {
    const node = input.readback.structure.nodes.find((entry) => entry.id === nodeRef);
    const rendering = input.readback.rendering.find((entry) => entry.id === nodeRef);
    if (!node || !rendering) {
      return fail(
        "r2_selection_unknown_node",
        "r2SelectionC0Projection.selectionBinding.selectedNodeRefs[0]",
        "The selected node is outside the validated C0 readback."
      );
    }
    selection = {
      atomType: node.type,
      authoredHidden: node.authoredHidden,
      authoredLocked: node.authoredLocked,
      interactionEligibility: rendering.interactionEligibility,
      layoutMode: node.layoutMode,
      nodeRef,
      visible: rendering.visible,
    };
  }
  return decodeR2SelectionC0ResultV1({
    contractVersion: R2_SELECTION_C0_V1.resultVersion,
    kind: "r2_selection_c0_read_result",
    nextCursor: null,
    scope: "selection",
    source: {
      captureProfile: R2_SELECTION_C0_V1.captureProfile,
      device: input.readback.device,
      freshness: "turn_bound",
      routePath: R2_SELECTION_C0_V1.routePath,
    },
    selection,
  });
};

export const decodeR2SelectionC0ResultV1 = (
  value: unknown
): R2SelectionC0ResultV1 => {
  const path = "r2SelectionC0Result";
  const record = strictRecordV1(
    value,
    ["contractVersion", "kind", "nextCursor", "scope", "selection", "source"],
    path
  );
  if (
    record.contractVersion !== R2_SELECTION_C0_V1.resultVersion ||
    record.kind !== "r2_selection_c0_read_result" ||
    record.nextCursor !== null ||
    record.scope !== "selection"
  ) {
    return fail(
      "r2_selection_result_invalid",
      path,
      "The result envelope or fixed nextCursor differs from the installed contract."
    );
  }
  const source = strictRecordV1(
    record.source,
    ["captureProfile", "device", "freshness", "routePath"],
    `${path}.source`
  );
  if (
    source.captureProfile !== R2_SELECTION_C0_V1.captureProfile ||
    source.freshness !== "turn_bound" ||
    source.routePath !== R2_SELECTION_C0_V1.routePath
  ) {
    return fail(
      "r2_selection_result_source_invalid",
      `${path}.source`,
      "The model-safe source projection differs from the exact Profile."
    );
  }
  let selection: R2SelectionC0ResultV1["selection"] = null;
  if (record.selection !== null) {
    const selected = strictRecordV1(
      record.selection,
      [
        "atomType",
        "authoredHidden",
        "authoredLocked",
        "interactionEligibility",
        "layoutMode",
        "nodeRef",
        "visible",
      ],
      `${path}.selection`
    );
    const eligibility = strictRecordV1(
      selected.interactionEligibility,
      ["eligible", "reason"],
      `${path}.selection.interactionEligibility`
    );
    selection = {
      atomType: oneOf(
        selected.atomType,
        R2_SELECTION_C0_ATOM_TYPES_V1,
        `${path}.selection.atomType`
      ),
      authoredHidden: booleanValue(
        selected.authoredHidden,
        `${path}.selection.authoredHidden`
      ),
      authoredLocked: booleanValue(
        selected.authoredLocked,
        `${path}.selection.authoredLocked`
      ),
      interactionEligibility: {
        eligible: booleanValue(
          eligibility.eligible,
          `${path}.selection.interactionEligibility.eligible`
        ),
        reason: oneOf(
          eligibility.reason,
          [
            "eligible",
            "hidden",
            "locked",
            "missing",
            "non-interactive-geometry",
          ] as const,
          `${path}.selection.interactionEligibility.reason`
        ),
      },
      layoutMode:
        selected.layoutMode === null
          ? null
          : oneOf(
              selected.layoutMode,
              ["free", "vertical", "horizontal", "grid"] as const,
              `${path}.selection.layoutMode`
            ),
      nodeRef: requiredIdV1(selected.nodeRef, `${path}.selection.nodeRef`),
      visible: booleanValue(selected.visible, `${path}.selection.visible`),
    };
  }
  return frozen({
    contractVersion: R2_SELECTION_C0_V1.resultVersion,
    kind: "r2_selection_c0_read_result",
    nextCursor: null,
    scope: "selection",
    source: {
      captureProfile: R2_SELECTION_C0_V1.captureProfile,
      device: oneOf(
        source.device,
        R2_SELECTION_C0_V1.admittedDevices,
        `${path}.source.device`
      ),
      freshness: "turn_bound",
      routePath: R2_SELECTION_C0_V1.routePath,
    },
    selection,
  });
};
