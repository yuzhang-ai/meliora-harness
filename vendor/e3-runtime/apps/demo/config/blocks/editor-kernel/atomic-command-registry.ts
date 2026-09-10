import {
  atomicDocumentPointerEquals,
  atomicJsonEquals,
  browserAtomicFingerprintPort,
  cloneAndDeepFreeze,
  type AtomicDocumentPointer,
} from "./atomic-document-version";
import type {
  AtomicCommandBatch,
  AtomicDedicatedPropsCommand,
  AtomicTreeResizeCommand,
  AtomicPropOperation,
  AtomicRegistryBinding,
  AtomicStructuralCommand,
  AtomicUpdatePropsCommand,
} from "./atomic-command-transaction";
import { removeAtomicComponentFromTree } from "../atomic-writable-contract";
import {
  getAtomicDeviceField,
  allocateAtomicBlankCanvasViewport,
  resolveAtomicBlankCanvasPreferredViewport,
  resolveAtomicContainerLayoutValues,
  resolveAtomicLayoutItem,
  resolveAtomicResponsiveFrame,
  type AtomicResponsiveLayoutItem,
} from "./atomic-layout-authored-values";
import {
  applyAutoLayoutItemPatch,
  applyCanvasFramePatch,
  type AutoLayoutItem,
  type ResponsiveCanvasFrame,
} from "../../lib/free-canvas-bridge";
import { projectAtomicDocumentGraph } from "./atomic-document-graph";
import type {
  AtomicFreeConstraintTreeReceipt,
  AtomicLayoutTreeGestureHandoffWrite,
  AtomicLayoutTreeRootAllocation,
} from "./atomic-layout-contract";
import { resolveAtomicOwnLayoutMode } from "../atomic-layout-capabilities";
import { resolveAtomicFreeConstraintTreePreview } from "./atomic-free-constraints";
import {
  createAtomicLayoutTreeRootAllocationKey,
  resolveBlankCanvasFrame,
} from "./atomic-layout-tree-solver";
import {
  AtomicInsertCapacityError,
  planAtomicInsertCapacity,
} from "./atomic-insert-capacity";

type UnknownRecord = Record<string, unknown>;

export const ATOMIC_COMMAND_REGISTRY_VERSION =
  "editor-ux-atomic-command-registry-v1" as const;

export const ATOMIC_COMMAND_KINDS = [
  "update-props",
  "adjust-padding",
  "adjust-gap",
  "move",
  "resize",
  "delete-subtree",
  "reparent",
  "insert-atomic-tree",
  "resize-page-root-for-insert",
] as const;

export type AtomicCommandKind = (typeof ATOMIC_COMMAND_KINDS)[number];
export type AtomicCommandSource =
  | "inspector"
  | "canvas"
  | "keyboard"
  | "ai-adapter";
export type AtomicCommandMode = "preview" | "commit";
export type AtomicCommandPermission =
  | "atomic.props.write"
  | "atomic.layout.write"
  | "atomic.structure.write";
export type AtomicCommandDevice = "desktop" | "tablet" | "mobile";

export type AtomicCommandRegistryDescriptor = Readonly<{
  kind: AtomicCommandKind;
  permission: AtomicCommandPermission;
  preview: boolean;
  coalesce: "numeric-scrub" | "never";
  acceptedSources: readonly AtomicCommandSource[];
  runtime: Readonly<{
    ui: "available" | "contract-only";
    aiAdapter: "unavailable" | "contract-only";
  }>;
}>;

const registryDescriptors: readonly AtomicCommandRegistryDescriptor[] = [
  {
    kind: "update-props",
    permission: "atomic.props.write",
    preview: true,
    coalesce: "numeric-scrub",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "adjust-padding",
    permission: "atomic.layout.write",
    preview: true,
    coalesce: "numeric-scrub",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "adjust-gap",
    permission: "atomic.layout.write",
    preview: true,
    coalesce: "numeric-scrub",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "move",
    permission: "atomic.layout.write",
    preview: true,
    coalesce: "never",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "resize",
    permission: "atomic.layout.write",
    preview: true,
    coalesce: "never",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "delete-subtree",
    permission: "atomic.structure.write",
    preview: false,
    coalesce: "never",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "reparent",
    permission: "atomic.structure.write",
    preview: true,
    coalesce: "never",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
  {
    kind: "insert-atomic-tree",
    permission: "atomic.structure.write",
    preview: true,
    coalesce: "never",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "contract-only" },
  },
  {
    kind: "resize-page-root-for-insert",
    permission: "atomic.layout.write",
    preview: true,
    coalesce: "never",
    acceptedSources: ["inspector", "canvas", "keyboard", "ai-adapter"],
    runtime: { ui: "available", aiAdapter: "unavailable" },
  },
] as const;

const registrySurface = Object.freeze({
  contractVersion: ATOMIC_COMMAND_REGISTRY_VERSION,
  commands: registryDescriptors,
});

export const ATOMIC_COMMAND_REGISTRY_HASH =
  browserAtomicFingerprintPort.fingerprint(registrySurface);

export type AtomicCommandPublicManifest = Readonly<{
  contractVersion: typeof ATOMIC_COMMAND_REGISTRY_VERSION;
  registryHash: string;
  commands: readonly AtomicCommandRegistryDescriptor[];
}>;

export const getAtomicCommandPublicManifest = (): AtomicCommandPublicManifest =>
  cloneAndDeepFreeze({
    ...registrySurface,
    registryHash: ATOMIC_COMMAND_REGISTRY_HASH,
  });

export type AtomicAdjustPaddingCommand = Readonly<{
  commandId: string;
  kind: "adjust-padding";
  nodeId: string;
  device: AtomicCommandDevice;
  side: "top" | "right" | "bottom" | "left";
  value: number;
}>;

export type AtomicAdjustGapCommand = Readonly<{
  commandId: string;
  kind: "adjust-gap";
  nodeId: string;
  device: AtomicCommandDevice;
  axis: "horizontal" | "vertical";
  value: number;
}>;

export type AtomicMoveCommand = Readonly<{
  commandId: string;
  kind: "move";
  nodeId: string;
  device: AtomicCommandDevice;
  x: number;
  y: number;
  snapEvidenceRef: string | null;
}>;

export type AtomicResizeCommand = Readonly<{
  commandId: string;
  kind: "resize";
  nodeId: string;
  device: AtomicCommandDevice;
  handle: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
  width: number;
  height: number;
  permitRef: string;
}>;

export type AtomicResolvedResizeAuthority = Readonly<{
  constraintBasePointer?: AtomicDocumentPointer;
  constraintReceiptId?: string;
  constraintRootAllocation?: AtomicLayoutTreeRootAllocation;
  constraintScopeNodeIds?: readonly string[];
  constraintTriggerFrame?:
    | Readonly<{ height: number; offsetX: number; width: number }>
    | Readonly<{
        height: number;
        width: number;
        x: number;
        y: number;
        zIndex: number;
      }>;
  nodeId: string;
  device: AtomicCommandDevice;
  placement:
    | "blank-canvas-root"
    | "flow-child"
    | "island-root"
    | "legacy-boundary";
  resizedAxes: readonly ("height" | "width")[];
  handoffs: readonly AtomicLayoutTreeGestureHandoffWrite[];
  permitFingerprint: string;
  treeReceiptId: string;
  geometryPreviewKey: string;
  freeConstraintPreview?: AtomicFreeConstraintTreeReceipt;
}>;

export type AtomicResolvedReparentAuthority = Readonly<{
  nodeId: string;
  parentId: string;
  index: number;
  device: AtomicCommandDevice;
  framePatch: Readonly<{
    height: number;
    width: number;
    x: number;
    y: number;
    zIndex?: number;
  }>;
  targetEvidenceRef: string;
}>;

export type AtomicDeleteSubtreeCommand = Readonly<{
  commandId: string;
  kind: "delete-subtree";
  nodeId: string;
}>;

export type AtomicReparentCommand = Readonly<{
  commandId: string;
  kind: "reparent";
  nodeId: string;
  parentId: string;
  index: number;
}>;

export type AtomicInsertAtomicTreeCommand = Readonly<{
  commandId: string;
  kind: "insert-atomic-tree";
  parentId: string;
  index: number;
  tree: Readonly<UnknownRecord>;
}>;

export type AtomicResizePageRootForInsertCommand = Readonly<{
  capacityEvidenceRef: string;
  commandId: string;
  desktopHeight: number;
  kind: "resize-page-root-for-insert";
  mobileHeight: number;
  nodeId: string;
  tabletHeight: number;
}>;

export type AtomicRegisteredCommand =
  | AtomicUpdatePropsCommand
  | AtomicAdjustPaddingCommand
  | AtomicAdjustGapCommand
  | AtomicMoveCommand
  | AtomicResizeCommand
  | AtomicDeleteSubtreeCommand
  | AtomicReparentCommand
  | AtomicInsertAtomicTreeCommand
  | AtomicResizePageRootForInsertCommand;

export type AtomicCommandAuthoritySnapshot = Readonly<{
  actorId: string;
  sessionId: string;
  capabilityFingerprint: string;
  permissions: readonly AtomicCommandPermission[];
}>;

export type AtomicCommandScopeSnapshot = Readonly<{
  rootId: string;
  nodeIds: readonly string[];
}>;

export type AtomicCommandEnvelope = Readonly<{
  contractVersion: typeof ATOMIC_COMMAND_REGISTRY_VERSION;
  registryHash: string;
  batchId: string;
  idempotencyKey: string;
  label: string;
  mode: AtomicCommandMode;
  source: AtomicCommandSource;
  base: AtomicDocumentPointer;
  authority: AtomicCommandAuthoritySnapshot;
  scope: AtomicCommandScopeSnapshot;
  commands: readonly AtomicRegisteredCommand[];
  coalesceKey: string | null;
  interactionId: string | null;
}>;

export class AtomicCommandRegistryError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AtomicCommandRegistryError";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertExactKeys = (
  value: UnknownRecord,
  allowed: readonly string[],
  context: string
) => {
  const allowedSet = new Set(allowed);
  const unknown = Object.keys(value).filter((key) => !allowedSet.has(key));
  if (unknown.length > 0) {
    throw new AtomicCommandRegistryError(
      "unknown_field",
      `${context} contains unknown field ${unknown[0]}.`
    );
  }
  const missing = allowed.filter((key) => !(key in value));
  if (missing.length > 0) {
    throw new AtomicCommandRegistryError(
      "missing_field",
      `${context} is missing ${missing[0]}.`
    );
  }
};

const readText = (value: unknown, field: string) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AtomicCommandRegistryError(
      "invalid_field",
      `${field} must be a non-empty string.`
    );
  }
  return value;
};

const readFiniteNumber = (value: unknown, field: string) => {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AtomicCommandRegistryError(
      "invalid_field",
      `${field} must be a finite number.`
    );
  }
  return value;
};

const readIndex = (value: unknown, field: string) => {
  const index = readFiniteNumber(value, field);
  if (!Number.isSafeInteger(index) || index < 0) {
    throw new AtomicCommandRegistryError(
      "invalid_field",
      `${field} must be a non-negative safe integer.`
    );
  }
  return index;
};

const readEnum = <T extends string>(
  value: unknown,
  values: readonly T[],
  field: string
): T => {
  if (typeof value !== "string" || !values.includes(value as T)) {
    throw new AtomicCommandRegistryError(
      "invalid_field",
      `${field} is not a supported value.`
    );
  }
  return value as T;
};

const readNullableText = (value: unknown, field: string) =>
  value === null ? null : readText(value, field);

const assertJsonSafe = (
  value: unknown,
  field: string,
  ancestors = new WeakSet<object>()
): void => {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new AtomicCommandRegistryError(
        "invalid_field",
        `${field} must not contain a non-finite number.`
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) {
      throw new AtomicCommandRegistryError(
        "invalid_field",
        `${field} must not contain a cycle.`
      );
    }
    ancestors.add(value);
    value.forEach((entry, index) =>
      assertJsonSafe(entry, `${field}[${index}]`, ancestors)
    );
    ancestors.delete(value);
    return;
  }
  if (isRecord(value)) {
    if (ancestors.has(value)) {
      throw new AtomicCommandRegistryError(
        "invalid_field",
        `${field} must not contain a cycle.`
      );
    }
    ancestors.add(value);
    Object.entries(value).forEach(([key, entry]) => {
      if (entry === undefined) {
        throw new AtomicCommandRegistryError(
          "invalid_field",
          `${field}.${key} must not be undefined.`
        );
      }
      assertJsonSafe(entry, `${field}.${key}`, ancestors);
    });
    ancestors.delete(value);
    return;
  }
  throw new AtomicCommandRegistryError(
    "invalid_field",
    `${field} must be JSON-safe.`
  );
};

const readStringArray = (value: unknown, field: string) => {
  if (!Array.isArray(value)) {
    throw new AtomicCommandRegistryError(
      "invalid_field",
      `${field} must be an array.`
    );
  }
  const result = value.map((entry, index) =>
    readText(entry, `${field}[${index}]`)
  );
  if (new Set(result).size !== result.length) {
    throw new AtomicCommandRegistryError(
      "duplicate_scope",
      `${field} must not contain duplicates.`
    );
  }
  return result;
};

const readPropOperations = (value: unknown): readonly AtomicPropOperation[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new AtomicCommandRegistryError(
      "empty_operation",
      "UpdateProps operations must be a non-empty array."
    );
  }
  return value.map((entry, index) => {
    if (!isRecord(entry)) {
      throw new AtomicCommandRegistryError(
        "invalid_operation",
        `operations[${index}] must be an object.`
      );
    }
    const op = readEnum(entry.op, ["set", "unset"] as const, `operations[${index}].op`);
    const keys = op === "set" ? ["op", "prop", "value"] : ["op", "prop"];
    assertExactKeys(entry, keys, `operations[${index}]`);
    const prop = readText(entry.prop, `operations[${index}].prop`);
    if (op === "set") {
      if (entry.value === undefined) {
        throw new AtomicCommandRegistryError(
          "undefined_value",
          "Use unset instead of setting undefined."
        );
      }
      assertJsonSafe(entry.value, `operations[${index}].value`);
      return cloneAndDeepFreeze({ op, prop, value: entry.value });
    }
    return Object.freeze({ op, prop });
  });
};

const commandKeys: Record<AtomicCommandKind, readonly string[]> = {
  "update-props": ["commandId", "kind", "nodeId", "operations"],
  "adjust-padding": ["commandId", "kind", "nodeId", "device", "side", "value"],
  "adjust-gap": ["commandId", "kind", "nodeId", "device", "axis", "value"],
  move: ["commandId", "kind", "nodeId", "device", "x", "y", "snapEvidenceRef"],
  resize: ["commandId", "kind", "nodeId", "device", "handle", "width", "height", "permitRef"],
  "delete-subtree": ["commandId", "kind", "nodeId"],
  reparent: ["commandId", "kind", "nodeId", "parentId", "index"],
  "insert-atomic-tree": ["commandId", "kind", "parentId", "index", "tree"],
  "resize-page-root-for-insert": [
    "commandId",
    "kind",
    "nodeId",
    "desktopHeight",
    "tabletHeight",
    "mobileHeight",
    "capacityEvidenceRef",
  ],
};

const decodeCommand = (value: unknown, index: number): AtomicRegisteredCommand => {
  if (!isRecord(value)) {
    throw new AtomicCommandRegistryError(
      "invalid_command",
      `commands[${index}] must be an object.`
    );
  }
  const kind = readEnum(value.kind, ATOMIC_COMMAND_KINDS, `commands[${index}].kind`);
  assertExactKeys(value, commandKeys[kind], `commands[${index}]`);
  const commandId = readText(value.commandId, `commands[${index}].commandId`);
  const nodeId = "nodeId" in value
    ? readText(value.nodeId, `commands[${index}].nodeId`)
    : null;
  const device = "device" in value
    ? readEnum(value.device, ["desktop", "tablet", "mobile"] as const, `commands[${index}].device`)
    : null;
  switch (kind) {
    case "update-props":
      return cloneAndDeepFreeze({ commandId, kind, nodeId: nodeId as string, operations: readPropOperations(value.operations) });
    case "adjust-padding":
      return Object.freeze({ commandId, kind, nodeId: nodeId as string, device: device as AtomicCommandDevice, side: readEnum(value.side, ["top", "right", "bottom", "left"] as const, `commands[${index}].side`), value: readFiniteNumber(value.value, `commands[${index}].value`) });
    case "adjust-gap":
      return Object.freeze({ commandId, kind, nodeId: nodeId as string, device: device as AtomicCommandDevice, axis: readEnum(value.axis, ["horizontal", "vertical"] as const, `commands[${index}].axis`), value: readFiniteNumber(value.value, `commands[${index}].value`) });
    case "move":
      return Object.freeze({ commandId, kind, nodeId: nodeId as string, device: device as AtomicCommandDevice, x: readFiniteNumber(value.x, `commands[${index}].x`), y: readFiniteNumber(value.y, `commands[${index}].y`), snapEvidenceRef: readNullableText(value.snapEvidenceRef, `commands[${index}].snapEvidenceRef`) });
    case "resize":
      return Object.freeze({ commandId, kind, nodeId: nodeId as string, device: device as AtomicCommandDevice, handle: readEnum(value.handle, ["n", "ne", "e", "se", "s", "sw", "w", "nw"] as const, `commands[${index}].handle`), width: readFiniteNumber(value.width, `commands[${index}].width`), height: readFiniteNumber(value.height, `commands[${index}].height`), permitRef: readText(value.permitRef, `commands[${index}].permitRef`) });
    case "delete-subtree":
      return Object.freeze({ commandId, kind, nodeId: nodeId as string });
    case "reparent":
      return Object.freeze({ commandId, kind, nodeId: nodeId as string, parentId: readText(value.parentId, `commands[${index}].parentId`), index: readIndex(value.index, `commands[${index}].index`) });
    case "insert-atomic-tree":
      if (!isRecord(value.tree)) {
        throw new AtomicCommandRegistryError("invalid_tree", `commands[${index}].tree must be an object.`);
      }
      assertJsonSafe(value.tree, `commands[${index}].tree`);
      return cloneAndDeepFreeze({ commandId, kind, parentId: readText(value.parentId, `commands[${index}].parentId`), index: readIndex(value.index, `commands[${index}].index`), tree: value.tree });
    case "resize-page-root-for-insert":
      return Object.freeze({
        capacityEvidenceRef: readText(value.capacityEvidenceRef, `commands[${index}].capacityEvidenceRef`),
        commandId,
        desktopHeight: readFiniteNumber(value.desktopHeight, `commands[${index}].desktopHeight`),
        kind,
        mobileHeight: readFiniteNumber(value.mobileHeight, `commands[${index}].mobileHeight`),
        nodeId: nodeId as string,
        tabletHeight: readFiniteNumber(value.tabletHeight, `commands[${index}].tabletHeight`),
      });
  }
};

const descriptorsByKind = new Map(
  registryDescriptors.map((descriptor) => [descriptor.kind, descriptor])
);

const findNodeProps = (value: unknown, nodeId: string): UnknownRecord | null => {
  if (Array.isArray(value)) {
    for (const entry of value) {
      const found = findNodeProps(entry, nodeId);
      if (found) return found;
    }
    return null;
  }
  if (!isRecord(value)) return null;
  if (isRecord(value.props) && value.props.id === nodeId) return value.props;
  if (isRecord(value.props) && Array.isArray(value.props.items)) {
    return findNodeProps(value.props.items, nodeId);
  }
  if (Array.isArray(value.content)) return findNodeProps(value.content, nodeId);
  return null;
};

export const decodeAtomicCommandEnvelope = (
  input: unknown
): AtomicCommandEnvelope => {
  if (!isRecord(input)) {
    throw new AtomicCommandRegistryError("invalid_envelope", "Command envelope must be an object.");
  }
  assertExactKeys(
    input,
    ["contractVersion", "registryHash", "batchId", "idempotencyKey", "label", "mode", "source", "base", "authority", "scope", "commands", "coalesceKey", "interactionId"],
    "envelope"
  );
  if (input.contractVersion !== ATOMIC_COMMAND_REGISTRY_VERSION) {
    throw new AtomicCommandRegistryError("registry_version_mismatch", "Command registry version does not match the active UX registry.");
  }
  if (input.registryHash !== ATOMIC_COMMAND_REGISTRY_HASH) {
    throw new AtomicCommandRegistryError("registry_hash_mismatch", "Command registry hash does not match the active UX registry.");
  }
  if (!isRecord(input.base)) throw new AtomicCommandRegistryError("invalid_base", "base must be an object.");
  assertExactKeys(input.base, ["revision", "atomicFingerprint", "fingerprintAlgorithm"], "base");
  if (!Number.isSafeInteger(input.base.revision) || (input.base.revision as number) < 0) {
    throw new AtomicCommandRegistryError("invalid_base", "base.revision must be a non-negative safe integer.");
  }
  if (!isRecord(input.authority)) throw new AtomicCommandRegistryError("invalid_authority", "authority must be an object.");
  assertExactKeys(input.authority, ["actorId", "sessionId", "capabilityFingerprint", "permissions"], "authority");
  if (!Array.isArray(input.authority.permissions)) throw new AtomicCommandRegistryError("invalid_permission", "authority.permissions must be an array.");
  const permissions = input.authority.permissions.map((permission, index) =>
    readEnum(permission, ["atomic.props.write", "atomic.layout.write", "atomic.structure.write"] as const, `authority.permissions[${index}]`)
  );
  if (new Set(permissions).size !== permissions.length) throw new AtomicCommandRegistryError("duplicate_permission", "authority.permissions must not contain duplicates.");
  if (!isRecord(input.scope)) throw new AtomicCommandRegistryError("invalid_scope", "scope must be an object.");
  assertExactKeys(input.scope, ["rootId", "nodeIds"], "scope");
  const source = readEnum(input.source, ["inspector", "canvas", "keyboard", "ai-adapter"] as const, "source");
  const commands = Array.isArray(input.commands)
    ? input.commands.map(decodeCommand)
    : (() => { throw new AtomicCommandRegistryError("invalid_commands", "commands must be an array."); })();
  if (commands.length === 0) throw new AtomicCommandRegistryError("empty_batch", "commands must not be empty.");
  const commandIds = commands.map(({ commandId }) => commandId);
  if (new Set(commandIds).size !== commandIds.length) throw new AtomicCommandRegistryError("duplicate_command_id", "commandId must be unique within an envelope.");
  const scopeNodeIds = readStringArray(input.scope.nodeIds, "scope.nodeIds");
  const scopeSet = new Set(scopeNodeIds);
  const granted = new Set(permissions);
  commands.forEach((command) => {
    const descriptor = descriptorsByKind.get(command.kind) as AtomicCommandRegistryDescriptor;
    if (!descriptor.acceptedSources.includes(source)) throw new AtomicCommandRegistryError("source_forbidden", `${source} cannot invoke ${command.kind}.`);
    if (source === "ai-adapter" && descriptor.runtime.aiAdapter === "unavailable") throw new AtomicCommandRegistryError("source_unavailable", `${command.kind} is not available through the AI adapter.`);
    if (!granted.has(descriptor.permission)) throw new AtomicCommandRegistryError("permission_denied", `${command.kind} requires ${descriptor.permission}.`);
    const addressedIds = ["nodeId" in command ? command.nodeId : null, "parentId" in command ? command.parentId : null].filter((id): id is string => Boolean(id));
    addressedIds.forEach((id) => {
      if (!scopeSet.has(id)) throw new AtomicCommandRegistryError("scope_denied", `${id} is outside the command scope.`);
    });
    if (!descriptor.preview && input.mode === "preview") throw new AtomicCommandRegistryError("preview_forbidden", `${command.kind} does not support preview.`);
    if (descriptor.coalesce === "never" && input.coalesceKey !== null) throw new AtomicCommandRegistryError("coalesce_forbidden", `${command.kind} cannot be coalesced.`);
  });
  return cloneAndDeepFreeze({
    contractVersion: ATOMIC_COMMAND_REGISTRY_VERSION,
    registryHash: ATOMIC_COMMAND_REGISTRY_HASH,
    batchId: readText(input.batchId, "batchId"),
    idempotencyKey: readText(input.idempotencyKey, "idempotencyKey"),
    label: readText(input.label, "label"),
    mode: readEnum(input.mode, ["preview", "commit"] as const, "mode"),
    source,
    base: {
      revision: input.base.revision as number,
      atomicFingerprint: readText(input.base.atomicFingerprint, "base.atomicFingerprint"),
      fingerprintAlgorithm: readText(input.base.fingerprintAlgorithm, "base.fingerprintAlgorithm"),
    },
    authority: {
      actorId: readText(input.authority.actorId, "authority.actorId"),
      sessionId: readText(input.authority.sessionId, "authority.sessionId"),
      capabilityFingerprint: readText(input.authority.capabilityFingerprint, "authority.capabilityFingerprint"),
      permissions,
    },
    scope: { rootId: readText(input.scope.rootId, "scope.rootId"), nodeIds: scopeNodeIds },
    commands,
    coalesceKey: readNullableText(input.coalesceKey, "coalesceKey"),
    interactionId: readNullableText(input.interactionId, "interactionId"),
  });
};

export const compileRegisteredUpdatePropsEnvelope = (
  input: unknown
): AtomicCommandBatch => {
  const envelope = decodeAtomicCommandEnvelope(input);
  if (envelope.commands.some((command) => command.kind !== "update-props")) {
    throw new AtomicCommandRegistryError(
      "runtime_not_migrated",
      "This K5 vertical slice only executes update-props; other registered commands remain fail-closed."
    );
  }
  const authorityHash = browserAtomicFingerprintPort.fingerprint(envelope.authority);
  const scopeHash = browserAtomicFingerprintPort.fingerprint(envelope.scope);
  const registryBinding: AtomicRegistryBinding = Object.freeze({
    registryVersion: envelope.contractVersion,
    registryHash: envelope.registryHash,
    idempotencyKey: envelope.idempotencyKey,
    source: envelope.source,
    mode: envelope.mode,
    commandKinds: envelope.commands.map(({ kind }) => kind),
    evidenceRefs: [],
    authorityHash,
    scopeHash,
  });
  return cloneAndDeepFreeze({
    base: envelope.base,
    batchId: envelope.batchId,
    label: envelope.label,
    commands: envelope.commands as readonly AtomicUpdatePropsCommand[],
    coalesceKey: envelope.coalesceKey,
    interactionId: envelope.interactionId,
    registryBinding,
  });
};

const compileAdjustPadding = (
  command: AtomicAdjustPaddingCommand,
  currentData: unknown
): AtomicDedicatedPropsCommand => {
  const props = findNodeProps(currentData, command.nodeId);
  if (!props) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      `Atomic node ${command.nodeId} was not found while compiling AdjustPadding.`
    );
  }
  const metric =
    `padding${command.side[0].toUpperCase()}${command.side.slice(1)}` as
      | "paddingTop"
      | "paddingRight"
      | "paddingBottom"
      | "paddingLeft";
  const prop = getAtomicDeviceField(command.device, metric);
  const next = Math.max(0, Math.round(command.value));
  const inheritedDevice = command.device === "mobile" ? "tablet" : "desktop";
  const inherited = resolveAtomicContainerLayoutValues({
    device: inheritedDevice,
    props,
  }).padding[command.side];
  const operation: AtomicPropOperation =
    command.device !== "desktop" && next === inherited
      ? { op: "unset", prop }
      : { op: "set", prop, value: next };
  return {
    commandId: command.commandId,
    kind: "dedicated-props",
    semanticKind: "adjust-padding",
    nodeId: command.nodeId,
    operations: [operation],
  };
};

const compileAdjustGap = (
  command: AtomicAdjustGapCommand,
  currentData: unknown
): AtomicDedicatedPropsCommand => {
  const props = findNodeProps(currentData, command.nodeId);
  if (!props) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      `Atomic node ${command.nodeId} was not found while compiling AdjustGap.`
    );
  }
  const metric = command.axis === "horizontal" ? "columnGap" : "rowGap";
  const next = Math.max(-240, Math.min(240, Math.round(command.value)));
  const current = resolveAtomicContainerLayoutValues({
    device: command.device,
    props,
  });
  const operations: AtomicPropOperation[] = [
    {
      op: "set",
      prop: getAtomicDeviceField(command.device, metric),
      value: next,
    },
  ];
  const layoutMode =
    props.layoutMode === "vertical" || props.layoutMode === "horizontal"
      ? props.layoutMode
      : "free";
  const mainAxis = layoutMode === "horizontal" ? "horizontal" : layoutMode === "vertical" ? "vertical" : null;
  const justify = props.justifyContent === "center" || props.justifyContent === "end"
    ? props.justifyContent
    : "start";
  if (command.axis === mainAxis && justify !== "start") {
    const items = Array.isArray(props?.items) ? props.items : [];
    const flowCount = items.filter((item) => {
      if (!isRecord(item) || !isRecord(item.props)) return false;
      return !resolveAtomicLayoutItem(
        item.props.layoutItem as AtomicResponsiveLayoutItem | undefined,
        command.device
      ).detached;
    }).length;
    const factor = justify === "center" ? 0.5 : 1;
    const previous = metric === "columnGap" ? current.columnGap : current.rowGap;
    const nextAnchor =
      current.gapAnchorOffset +
      factor * Math.max(0, flowCount - 1) * (next - previous);
    operations.push({
      op: "set",
      prop: getAtomicDeviceField(command.device, "gapAnchorOffset"),
      value: nextAnchor,
    });
  }
  return {
    commandId: command.commandId,
    kind: "dedicated-props",
    semanticKind: "adjust-gap",
    nodeId: command.nodeId,
    operations,
  };
};

const compileMove = (
  command: AtomicMoveCommand,
  currentData: unknown
): AtomicDedicatedPropsCommand => {
  if (!command.snapEvidenceRef) {
    throw new AtomicCommandRegistryError(
      "evidence_required",
      "Move runtime requires one current K3 snap evidence reference."
    );
  }
  const graph = projectAtomicDocumentGraph(currentData);
  const node = graph.getNode(command.nodeId);
  const parent = node?.parentId ? graph.getNode(node.parentId) : null;
  if (!node || !parent || parent.props.layoutMode !== "free") {
    throw new AtomicCommandRegistryError(
      "move_not_applicable",
      "Move runtime requires one non-root node in a free-layout parent."
    );
  }
  const props = findNodeProps(currentData, command.nodeId);
  const frame = props?.frame;
  if (!isRecord(frame) || !isRecord(frame.desktop)) {
    throw new AtomicCommandRegistryError(
      "invalid_frame",
      "Move runtime requires an authored responsive frame."
    );
  }
  const nextFrame = applyCanvasFramePatch(
    frame as ResponsiveCanvasFrame,
    command.device,
    { x: Math.round(command.x), y: Math.round(command.y) }
  );
  return {
    commandId: command.commandId,
    kind: "dedicated-props",
    semanticKind: "move",
    nodeId: command.nodeId,
    operations: [{ op: "set", prop: "frame", value: nextFrame }],
  };
};

const getResizeAxes = (
  handle: AtomicResizeCommand["handle"]
): readonly ("height" | "width")[] =>
  Object.freeze([
    ...(handle.includes("w") || handle.includes("e") ? (["width"] as const) : []),
    ...(handle.includes("n") || handle.includes("s") ? (["height"] as const) : []),
  ]);

const compileResize = (
  command: AtomicResizeCommand,
  currentData: unknown,
  authority: AtomicResolvedResizeAuthority | undefined
): AtomicDedicatedPropsCommand | AtomicTreeResizeCommand => {
  if (!authority) {
    throw new AtomicCommandRegistryError(
      "resize_authority_required",
      "Resize runtime requires one resolved K4 geometry authority."
    );
  }
  const expectedAxes = getResizeAxes(command.handle);
  const authorityAxes = [...new Set(authority.resizedAxes)].sort();
  if (
    authority.nodeId !== command.nodeId ||
    authority.device !== command.device ||
    !authority.permitFingerprint.trim() ||
    !authority.treeReceiptId.trim() ||
    !authority.geometryPreviewKey.trim() ||
    authorityAxes.length !== authority.resizedAxes.length ||
    authorityAxes.join(",") !== [...expectedAxes].sort().join(",")
  ) {
    throw new AtomicCommandRegistryError(
      "resize_authority_mismatch",
      "Resolved K4 resize authority does not match the command intent."
    );
  }
  const graph = projectAtomicDocumentGraph(currentData);
  const node = graph.getNode(command.nodeId);
  if (
    !node ||
    (authority.placement === "blank-canvas-root"
      ? node.type !== "BlankCanvas"
      : node.type !== "ContainerElement")
  ) {
    throw new AtomicCommandRegistryError(
      "resize_not_applicable",
      "Resize authority does not match the addressed atomic node."
    );
  }
  if (authority.freeConstraintPreview) {
    const freeReceipt = authority.freeConstraintPreview;
    const parent = graph.getParent(command.nodeId);
    const scope = freeReceipt.scopes[0];
    const triggerFrame = authority.constraintTriggerFrame;
    const rootAllocation = authority.constraintRootAllocation;
    const scopeNodeIds = authority.constraintScopeNodeIds;
    const isBlankCanvasRoot = authority.placement === "blank-canvas-root";
    const isFreeContainerRoot = authority.placement === "island-root";
    const isFreeFlowContainer = authority.placement === "flow-child";
    const flowAuthoredFrame = isFreeFlowContainer && node.props.frame
      ? resolveAtomicResponsiveFrame(node.props.frame as ResponsiveCanvasFrame, command.device) : null;
    const flowItem = resolveAtomicLayoutItem(node.props.layoutItem as Parameters<typeof resolveAtomicLayoutItem>[0], command.device);
    if (
      (!isBlankCanvasRoot && !isFreeContainerRoot && !isFreeFlowContainer) ||
      authority.handoffs.length !== 0 ||
      authority.constraintReceiptId !== freeReceipt.constraintReceiptId ||
      !authority.constraintBasePointer ||
      !atomicDocumentPointerEquals(
        authority.constraintBasePointer,
        freeReceipt.identity.pointer
      ) ||
      freeReceipt.triggerNodeId !== command.nodeId ||
      freeReceipt.identity.geometryPreviewKey !== authority.geometryPreviewKey ||
      scope?.scopeId !== command.nodeId ||
      !rootAllocation ||
      createAtomicLayoutTreeRootAllocationKey(rootAllocation) !==
        freeReceipt.identity.rootAllocationKey ||
      !scopeNodeIds ||
      new Set(scopeNodeIds).size !== scopeNodeIds.length ||
      scopeNodeIds.join(",") !==
        [command.nodeId, ...freeReceipt.writes.map(({ nodeId }) => nodeId)].join(",") ||
      !triggerFrame ||
      Math.round(triggerFrame.width) !== Math.round(scope.afterBox.width) ||
      Math.round(triggerFrame.height) !== Math.round(scope.afterBox.height) ||
      (isBlankCanvasRoot
        ? node.type !== "BlankCanvas" ||
          parent !== null ||
          scope.afterBox.x !== 0 ||
          scope.afterBox.y !== 0 ||
          !("offsetX" in triggerFrame) ||
          !Number.isFinite(triggerFrame.offsetX) ||
          triggerFrame.offsetX < 0 ||
          triggerFrame.offsetX + triggerFrame.width >
            rootAllocation.hostInlineSize
        : node.type !== "ContainerElement" ||
          !parent ||
          (isFreeFlowContainer
            ? !["horizontal", "vertical"].includes(resolveAtomicOwnLayoutMode(parent.type, parent.props)) ||
              flowItem.widthMode !== "fixed" || flowItem.heightMode !== "fixed" ||
              !flowAuthoredFrame || !("x" in triggerFrame) ||
              triggerFrame.x !== flowAuthoredFrame.x || triggerFrame.y !== flowAuthoredFrame.y
            : resolveAtomicOwnLayoutMode(parent.type, parent.props) !== "free") ||
          !("x" in triggerFrame) ||
          Math.round(triggerFrame.x) !== Math.round(scope.afterBox.x) ||
          Math.round(triggerFrame.y) !== Math.round(scope.afterBox.y)) ||
      resolveAtomicOwnLayoutMode(node.type, node.props) !== "free" ||
      Math.round(command.width) !== Math.round(scope.afterBox.width) ||
      Math.round(command.height) !== Math.round(scope.afterBox.height)
    ) {
      throw new AtomicCommandRegistryError(
        "resize_authority_mismatch",
        "Resolved Free constraint authority does not match the Resize intent."
      );
    }
    if (isBlankCanvasRoot && command.device !== "desktop") {
      const currentViewport = allocateAtomicBlankCanvasViewport({
        hostInlineSize: rootAllocation.hostInlineSize,
        preferred: resolveAtomicBlankCanvasPreferredViewport({
          device: command.device,
          props: node.props,
        }),
      });
      if (
        Math.round((triggerFrame as { offsetX: number }).offsetX) !==
        Math.round(currentViewport.offsetX)
      ) {
        throw new AtomicCommandRegistryError(
          "resize_authority_mismatch",
          "Non-desktop Free root Resize cannot mutate offsetX."
        );
      }
    }
    const beforeParent = isBlankCanvasRoot
      ? resolveBlankCanvasFrame(node.props, command.device, rootAllocation)
      : resolveAtomicResponsiveFrame(
          node.props.frame as ResponsiveCanvasFrame,
          command.device
        );
    const afterParent = isBlankCanvasRoot
      ? Object.freeze({
          height: triggerFrame.height,
          width: triggerFrame.width,
          x: 0,
          y: 0,
          zIndex: 0,
        })
      : (triggerFrame as Readonly<{
          height: number;
          width: number;
          x: number;
          y: number;
          zIndex: number;
        }>);
    const reprojectedReceipt = resolveAtomicFreeConstraintTreePreview({
      afterParent,
      beforeParent,
      device: command.device,
      graph,
      identity: freeReceipt.identity,
      triggerNodeId: command.nodeId,
    });
    if (!atomicJsonEquals(reprojectedReceipt, freeReceipt)) {
      throw new AtomicCommandRegistryError(
        "resize_authority_mismatch",
        "Free constraint Resize receipt is stale or has been tampered with."
      );
    }
    const compiledScopeNodeIds = [
      command.nodeId,
      ...freeReceipt.writes.map(({ nodeId }) => nodeId),
    ];
    if (
      new Set(compiledScopeNodeIds).size !== compiledScopeNodeIds.length
    ) {
      throw new AtomicCommandRegistryError(
        "invalid_resize_handoff",
        "Free constraint Resize contains duplicate node writers."
      );
    }
    const parentProps = findNodeProps(currentData, command.nodeId);
    if (
      !parentProps ||
      (!isBlankCanvasRoot && !isRecord(parentProps.frame))
    ) {
      throw new AtomicCommandRegistryError(
        "invalid_frame",
        "Free constraint Resize requires an authored parent frame."
      );
    }
    const rootOperations: AtomicPropOperation[] = [];
    if (isBlankCanvasRoot) {
      if (command.device === "desktop") {
        if (expectedAxes.includes("width")) {
          rootOperations.push(
            { op: "set", prop: "width", value: Math.round(scope.afterBox.width) },
            {
              op: "set",
              prop: "offsetX",
              value: Math.round(
                (triggerFrame as { offsetX: number }).offsetX
              ),
            }
          );
        }
        if (expectedAxes.includes("height")) {
          rootOperations.push({
            op: "set",
            prop: "height",
            value: Math.round(scope.afterBox.height),
          });
        }
      } else {
        const responsive = isRecord(parentProps.responsiveSize)
          ? parentProps.responsiveSize
          : {};
        const currentDevice = isRecord(responsive[command.device])
          ? (responsive[command.device] as UnknownRecord)
          : {};
        rootOperations.push({
          op: "set",
          prop: "responsiveSize",
          value: {
            ...responsive,
            [command.device]: {
              ...currentDevice,
              ...(expectedAxes.includes("width")
                ? { width: Math.round(scope.afterBox.width) }
                : {}),
              ...(expectedAxes.includes("height")
                ? { height: Math.round(scope.afterBox.height) }
                : {}),
            },
          },
        });
      }
    } else {
      rootOperations.push({
        op: "set",
        prop: "frame",
        value: applyCanvasFramePatch(
          parentProps.frame as ResponsiveCanvasFrame,
          command.device,
          {
            height: Math.round(scope.afterBox.height),
            width: Math.round(scope.afterBox.width),
            x: Math.round(scope.afterBox.x),
            y: Math.round(scope.afterBox.y),
          }
        ),
      });
    }
    const writes: AtomicTreeResizeCommand["writes"] = Object.freeze([
      Object.freeze({
        nodeId: command.nodeId,
        operations: Object.freeze(rootOperations.map((operation) =>
          Object.freeze(operation)
        )),
      }),
      ...freeReceipt.writes.map((write) => {
        const child = graph.getNode(write.nodeId);
        const childProps = findNodeProps(currentData, write.nodeId);
        if (
          !child ||
          child.parentId !== write.parentId ||
          !childProps ||
          !isRecord(childProps.frame)
        ) {
          throw new AtomicCommandRegistryError(
            "resize_authority_mismatch",
            `Free constraint child ${write.nodeId} is stale.`
          );
        }
        return Object.freeze({
          nodeId: write.nodeId,
          operations: Object.freeze([
            Object.freeze({
              op: "set" as const,
              prop: "frame",
              value: applyCanvasFramePatch(
                childProps.frame as ResponsiveCanvasFrame,
                command.device,
                write.afterFrame
              ),
            }),
          ]),
        });
      }),
    ]);
    return Object.freeze({
      commandId: command.commandId,
      kind: "tree-resize" as const,
      nodeId: command.nodeId,
      semanticKind: "resize" as const,
      writes,
    });
  }
  const handoffByAxis = new Map<
    "height" | "width",
    AtomicLayoutTreeGestureHandoffWrite
  >();
  authority.handoffs.forEach((handoff) => {
    if (
      handoff.nodeId !== command.nodeId ||
      handoff.placement !== authority.placement ||
      handoff.geometryPreviewKey !== authority.geometryPreviewKey ||
      !Number.isFinite(handoff.value) ||
      handoffByAxis.has(handoff.axis)
    ) {
      throw new AtomicCommandRegistryError(
        "invalid_resize_handoff",
        "K4 resize handoffs are duplicated, stale, or address another node."
      );
    }
    const coupled = handoff.coupledOrigin;
    const expectedCoupledProperty =
      authority.placement === "blank-canvas-root" && handoff.axis === "width"
        ? "offsetX"
        : authority.placement === "island-root" && handoff.axis === "width"
          ? "x"
          : authority.placement === "island-root" && handoff.axis === "height"
            ? "y"
            : null;
    if (
      (expectedCoupledProperty === null && coupled !== undefined) ||
      (expectedCoupledProperty !== null &&
        (coupled?.property !== expectedCoupledProperty ||
          !Number.isFinite(coupled.value)))
    ) {
      throw new AtomicCommandRegistryError(
        "invalid_resize_origin",
        "K4 resize coupled origin does not match its placement and axis."
      );
    }
    handoffByAxis.set(handoff.axis, handoff);
  });
  if (
    handoffByAxis.size !== expectedAxes.length ||
    expectedAxes.some((axis) => !handoffByAxis.has(axis))
  ) {
    throw new AtomicCommandRegistryError(
      "invalid_resize_axes",
      "K4 resize handoffs must contain exactly one write per resized axis."
    );
  }
  expectedAxes.forEach((axis) => {
    const asserted = axis === "width" ? command.width : command.height;
    const resolved = Math.round(handoffByAxis.get(axis)?.value ?? Number.NaN);
    if (Math.round(asserted) !== resolved) {
      throw new AtomicCommandRegistryError(
        "resize_intent_mismatch",
        "Resize intent does not match the K4-resolved geometry handoff."
      );
    }
  });

  const props = findNodeProps(currentData, command.nodeId);
  if (!props) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      `Atomic node ${command.nodeId} was not found while compiling Resize.`
    );
  }
  const operations: AtomicPropOperation[] = [];
  if (authority.placement === "blank-canvas-root") {
    const widthHandoff = handoffByAxis.get("width");
    const heightHandoff = handoffByAxis.get("height");
    if (command.device === "desktop") {
      if (widthHandoff) {
        operations.push({
          op: "set",
          prop: "width",
          value: Math.round(widthHandoff.value),
        });
        operations.push({
          op: "set",
          prop: "offsetX",
          value: Math.round(widthHandoff.coupledOrigin!.value),
        });
      }
      if (heightHandoff) {
        operations.push({
          op: "set",
          prop: "height",
          value: Math.round(heightHandoff.value),
        });
      }
    } else {
      const responsive = isRecord(props.responsiveSize)
        ? props.responsiveSize
        : {};
      const currentDevice = isRecord(responsive[command.device])
        ? (responsive[command.device] as UnknownRecord)
        : {};
      operations.push({
        op: "set",
        prop: "responsiveSize",
        value: {
          ...responsive,
          [command.device]: {
            ...currentDevice,
            ...(widthHandoff
              ? { width: Math.round(widthHandoff.value) }
              : {}),
            ...(heightHandoff
              ? { height: Math.round(heightHandoff.value) }
              : {}),
          },
        },
      });
    }
  } else {
    if (!isRecord(props.frame) || !isRecord(props.frame.desktop)) {
      throw new AtomicCommandRegistryError(
        "invalid_frame",
        "Resize runtime requires an authored responsive frame."
      );
    }
    const framePatch: Record<string, number> = {};
    expectedAxes.forEach((axis) => {
      const handoff = handoffByAxis.get(axis)!;
      framePatch[axis] = Math.round(handoff.value);
      if (handoff.coupledOrigin?.property === "x") {
        framePatch.x = Math.round(handoff.coupledOrigin.value);
      }
      if (handoff.coupledOrigin?.property === "y") {
        framePatch.y = Math.round(handoff.coupledOrigin.value);
      }
    });
    operations.push({
      op: "set",
      prop: "frame",
      value: applyCanvasFramePatch(
        props.frame as ResponsiveCanvasFrame,
        command.device,
        framePatch
      ),
    });
    operations.push({
      op: "set",
      prop: "layoutItem",
      value: applyAutoLayoutItemPatch(
        props.layoutItem as AutoLayoutItem | undefined,
        command.device,
        {
          ...(handoffByAxis.has("width") ? { widthMode: "fixed" } : {}),
          ...(handoffByAxis.has("height") ? { heightMode: "fixed" } : {}),
        }
      ),
    });
  }
  return {
    commandId: command.commandId,
    kind: "dedicated-props",
    semanticKind: "resize",
    nodeId: command.nodeId,
    operations,
  };
};

const compileDeleteSubtree = (
  command: AtomicDeleteSubtreeCommand,
  currentData: unknown,
  envelope: AtomicCommandEnvelope
): AtomicStructuralCommand => {
  const graph = projectAtomicDocumentGraph(currentData);
  if (command.nodeId === graph.rootId) {
    throw new AtomicCommandRegistryError(
      "root_delete_forbidden",
      "The atomic document root cannot be deleted."
    );
  }
  const node = graph.getNode(command.nodeId);
  if (!node || !node.parentId || node.indexInParent === null) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      `Atomic node ${command.nodeId} cannot be removed from a parent.`
    );
  }
  const affectedIds = Object.freeze([
    node.parentId,
    command.nodeId,
    ...graph.getDescendantIds(command.nodeId),
  ]);
  const subtreeIds = Object.freeze([
    command.nodeId,
    ...graph.getDescendantIds(command.nodeId),
  ]);
  const scope = new Set(envelope.scope.nodeIds);
  if (affectedIds.some((id) => !scope.has(id))) {
    throw new AtomicCommandRegistryError(
      "scope_denied",
      "DeleteSubtree scope must cover the parent and complete removed subtree."
    );
  }
  const removed = removeAtomicComponentFromTree(currentData, command.nodeId);
  if (
    removed.parentId !== node.parentId ||
    removed.index !== node.indexInParent
  ) {
    throw new AtomicCommandRegistryError(
      "graph_structure_mismatch",
      "DeleteSubtree graph and writable tree disagree about parent/index."
    );
  }
  const subtreeFingerprint = browserAtomicFingerprintPort.fingerprint(
    removed.removedNode
  );
  return cloneAndDeepFreeze({
    commandId: command.commandId,
    kind: "structural" as const,
    semanticKind: "delete-subtree" as const,
    nodeId: command.nodeId,
    operations: [
      {
        kind: "remove-subtree" as const,
        nodeId: command.nodeId,
        parentId: node.parentId,
        index: node.indexInParent,
        subtreeIds,
        subtreeFingerprint,
      },
    ],
    inverse: [
      {
        kind: "insert-subtree" as const,
        nodeId: command.nodeId,
        parentId: node.parentId,
        index: node.indexInParent,
        subtree: removed.removedNode,
        subtreeIds,
        subtreeFingerprint,
      },
    ],
    affectedIds,
  });
};

const normalizeGridReparentLayoutItem = (
  value: unknown,
  device: AtomicCommandDevice,
  columns: number
) => {
  const source = isRecord(value) ? structuredClone(value) : {};
  const resolved = resolveAtomicLayoutItem(
    source as AtomicResponsiveLayoutItem,
    device
  );
  const nextDevice: UnknownRecord = {
    ...(device === "desktop"
      ? Object.fromEntries(
          Object.entries(source).filter(
            ([key]) => key !== "tablet" && key !== "mobile"
          )
        )
      : isRecord(source[device])
        ? (source[device] as UnknownRecord)
        : {}),
    detached: false,
    columnSpan: Math.max(1, Math.min(columns, resolved.columnSpan)),
    heightMode: resolved.heightMode === "hug" ? "fixed" : resolved.heightMode,
    widthMode: resolved.widthMode === "hug" ? "fixed" : resolved.widthMode,
  };
  delete nextDevice.columnStart;
  delete nextDevice.rowStart;
  if (device === "desktop") {
    return {
      ...nextDevice,
      ...(isRecord(source.tablet) ? { tablet: source.tablet } : {}),
      ...(isRecord(source.mobile) ? { mobile: source.mobile } : {}),
    };
  }
  return { ...source, [device]: nextDevice };
};

const normalizeAtomicReparentSubtree = ({
  authority,
  destination,
  originalNode,
}: {
  authority: AtomicResolvedReparentAuthority;
  destination: NonNullable<
    ReturnType<ReturnType<typeof projectAtomicDocumentGraph>["getNode"]>
  >;
  originalNode: Readonly<UnknownRecord>;
}) => {
  const originalProps = isRecord(originalNode.props)
    ? originalNode.props
    : null;
  if (!originalProps) {
    throw new AtomicCommandRegistryError(
      "invalid_reparent_node",
      "Reparent source has no atomic Props."
    );
  }
  const destinationProps = destination.props;
  const parentLayout = resolveAtomicOwnLayoutMode(
    destination.type,
    destinationProps
  );
  const currentLayoutItem = originalProps.layoutItem as
    | AtomicResponsiveLayoutItem
    | undefined;
  const resolvedLayoutItem = resolveAtomicLayoutItem(
    currentLayoutItem,
    authority.device
  );
  let nextLayoutItem: unknown;
  let nextFrame = originalProps.frame;
  if (parentLayout === "free") {
    if (!isRecord(originalProps.frame) || !isRecord(originalProps.frame.desktop)) {
      throw new AtomicCommandRegistryError(
        "invalid_frame",
        "A node entering a free parent requires an authored responsive frame."
      );
    }
    nextFrame = applyCanvasFramePatch(
      originalProps.frame as ResponsiveCanvasFrame,
      authority.device,
      Object.fromEntries(
        Object.entries(authority.framePatch).map(([key, value]) => [
          key,
          Math.round(value),
        ])
      )
    );
    nextLayoutItem = applyAutoLayoutItemPatch(
      currentLayoutItem as AutoLayoutItem | undefined,
      authority.device,
      {
        detached: false,
        heightMode:
          resolvedLayoutItem.heightMode === "fill"
            ? "fixed"
            : resolvedLayoutItem.heightMode,
        widthMode:
          resolvedLayoutItem.widthMode === "fill"
            ? "fixed"
            : resolvedLayoutItem.widthMode,
      }
    );
  } else if (parentLayout === "grid") {
    const desktopColumns = Math.max(
      1,
      Math.min(10, Math.round(Number(destinationProps.columns)) || 3)
    );
    const tabletColumns = Math.max(
      1,
      Math.min(
        10,
        Math.round(Number(destinationProps.tabletColumns)) || desktopColumns
      )
    );
    const columns =
      authority.device === "desktop"
        ? desktopColumns
        : authority.device === "tablet"
          ? tabletColumns
          : Math.max(
              1,
              Math.min(
                10,
                Math.round(Number(destinationProps.mobileColumns)) ||
                  tabletColumns
              )
            );
    nextLayoutItem = normalizeGridReparentLayoutItem(
      currentLayoutItem,
      authority.device,
      columns
    );
  } else {
    nextLayoutItem = applyAutoLayoutItemPatch(
      currentLayoutItem as AutoLayoutItem | undefined,
      authority.device,
      { detached: false }
    );
  }
  return cloneAndDeepFreeze({
    ...originalNode,
    props: {
      ...originalProps,
      frame: nextFrame,
      layoutItem: nextLayoutItem,
    },
  });
};

export const planRegisteredAtomicReparentCapacity = ({
  authority,
  currentData,
  command,
}: {
  authority: AtomicResolvedReparentAuthority;
  currentData: unknown;
  command: AtomicReparentCommand;
}) => {
  const graph = projectAtomicDocumentGraph(currentData);
  const node = graph.getNode(command.nodeId);
  const destination = graph.getNode(command.parentId);
  if (!node?.parentId || node.indexInParent === null || !destination) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      "Reparent source or destination does not exist."
    );
  }
  if (
    command.nodeId === graph.rootId ||
    command.nodeId === command.parentId ||
    graph.isDescendant(command.parentId, command.nodeId)
  ) {
    throw new AtomicCommandRegistryError(
      "reparent_cycle",
      "Reparent cannot move the root into itself or one of its descendants."
    );
  }
  const destinationCountAfterRemoval =
    destination.childIds.length - (node.parentId === command.parentId ? 1 : 0);
  if (command.index < 0 || command.index > destinationCountAfterRemoval) {
    throw new AtomicCommandRegistryError(
      "reparent_index_out_of_bounds",
      "Reparent index must address the destination after source removal."
    );
  }
  const removed = removeAtomicComponentFromTree(currentData, command.nodeId);
  const normalizedNode = normalizeAtomicReparentSubtree({
    authority,
    destination,
    originalNode: removed.removedNode,
  });
  try {
    return planAtomicInsertCapacity({
      data: removed.nextData,
      index: command.index,
      parentId: command.parentId,
      tree: normalizedNode,
    });
  } catch (error) {
    if (error instanceof AtomicInsertCapacityError) {
      throw new AtomicCommandRegistryError(error.code, error.message);
    }
    throw error;
  }
};

const compileReparent = (
  command: AtomicReparentCommand,
  currentData: unknown,
  envelope: AtomicCommandEnvelope,
  authority: AtomicResolvedReparentAuthority | undefined
): AtomicStructuralCommand => {
  if (
    !authority ||
    authority.nodeId !== command.nodeId ||
    authority.parentId !== command.parentId ||
    authority.index !== command.index ||
    !authority.targetEvidenceRef.trim() ||
    Object.values(authority.framePatch).some((value) => !Number.isFinite(value))
  ) {
    throw new AtomicCommandRegistryError(
      "reparent_authority_mismatch",
      "Reparent requires one matching, finite K3 target authority."
    );
  }
  const graph = projectAtomicDocumentGraph(currentData);
  const node = graph.getNode(command.nodeId);
  const destination = graph.getNode(command.parentId);
  if (!node || !node.parentId || node.indexInParent === null || !destination) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      "Reparent source or destination does not exist."
    );
  }
  if (
    command.nodeId === graph.rootId ||
    command.nodeId === command.parentId ||
    graph.isDescendant(command.parentId, command.nodeId)
  ) {
    throw new AtomicCommandRegistryError(
      "reparent_cycle",
      "Reparent cannot move the root into itself or one of its descendants."
    );
  }
  if (
    destination.type !== "BlankCanvas" &&
    destination.type !== "ContainerElement"
  ) {
    throw new AtomicCommandRegistryError(
      "invalid_reparent_parent",
      "Reparent destination must be an atomic canvas or container."
    );
  }
  const destinationCountAfterRemoval =
    destination.childIds.length - (node.parentId === command.parentId ? 1 : 0);
  if (command.index < 0 || command.index > destinationCountAfterRemoval) {
    throw new AtomicCommandRegistryError(
      "reparent_index_out_of_bounds",
      "Reparent index must address the destination after source removal."
    );
  }
  const subtreeIds = Object.freeze([
    command.nodeId,
    ...graph.getDescendantIds(command.nodeId),
  ]);
  const affectedIds = Object.freeze([
    ...new Set([node.parentId, command.parentId, ...subtreeIds]),
  ]);
  const scope = new Set(envelope.scope.nodeIds);
  if (affectedIds.some((id) => !scope.has(id))) {
    throw new AtomicCommandRegistryError(
      "scope_denied",
      "Reparent scope must cover both parents and the complete moved subtree."
    );
  }
  const removed = removeAtomicComponentFromTree(currentData, command.nodeId);
  const originalNode = removed.removedNode;
  const normalizedNode = normalizeAtomicReparentSubtree({
    authority,
    destination,
    originalNode,
  });
  const capacityPlan = planRegisteredAtomicReparentCapacity({
    authority,
    command,
    currentData,
  });
  if (capacityPlan.pageRootResize) {
    const matchingResizes = envelope.commands.filter(
      (candidate): candidate is AtomicResizePageRootForInsertCommand =>
        candidate.kind === "resize-page-root-for-insert" &&
        candidate.nodeId === command.parentId
    );
    if (matchingResizes.length === 0) {
      throw new AtomicCommandRegistryError(
        "insert_parent_resize_required",
        "Page-root Reparent requires exactly one matching responsive root resize in the same command batch."
      );
    }
    if (matchingResizes.length > 1) {
      throw new AtomicCommandRegistryError(
        "insert_resize_binding_invalid",
        "Page-root Reparent cannot bind more than one responsive root resize."
      );
    }
  }
  const originalFingerprint = browserAtomicFingerprintPort.fingerprint(originalNode);
  const normalizedFingerprint =
    browserAtomicFingerprintPort.fingerprint(normalizedNode);
  return cloneAndDeepFreeze({
    commandId: command.commandId,
    kind: "structural" as const,
    semanticKind: "reparent" as const,
    nodeId: command.nodeId,
    operations: [
      {
        kind: "remove-subtree" as const,
        nodeId: command.nodeId,
        parentId: node.parentId,
        index: node.indexInParent,
        subtreeIds,
        subtreeFingerprint: originalFingerprint,
      },
      {
        kind: "insert-subtree" as const,
        nodeId: command.nodeId,
        parentId: command.parentId,
        index: command.index,
        subtree: normalizedNode,
        subtreeIds,
        subtreeFingerprint: normalizedFingerprint,
      },
    ],
    inverse: [
      {
        kind: "remove-subtree" as const,
        nodeId: command.nodeId,
        parentId: command.parentId,
        index: command.index,
        subtreeIds,
        subtreeFingerprint: normalizedFingerprint,
      },
      {
        kind: "insert-subtree" as const,
        nodeId: command.nodeId,
        parentId: node.parentId,
        index: node.indexInParent,
        subtree: originalNode,
        subtreeIds,
        subtreeFingerprint: originalFingerprint,
      },
    ],
    affectedIds,
  });
};

const FORBIDDEN_INSERT_IDENTITY_FIELDS = new Set([
  "assetId",
  "preset",
  "recipeId",
  "recipeKind",
  "templateAssetId",
  "templateId",
]);

const inspectInsertTree = (tree: UnknownRecord) => {
  const payloadBytes = new TextEncoder().encode(JSON.stringify(tree)).length;
  if (payloadBytes > 256 * 1024) {
    throw new AtomicCommandRegistryError(
      "insert_budget_exceeded",
      "InsertAtomicTree payload exceeds 256 KiB."
    );
  }
  const ids: string[] = [];
  const stack: Array<{ node: UnknownRecord; depth: number }> = [
    { node: tree, depth: 1 },
  ];
  while (stack.length > 0) {
    const current = stack.pop()!;
    if (current.depth > 64 || ids.length >= 512) {
      throw new AtomicCommandRegistryError(
        "insert_budget_exceeded",
        "InsertAtomicTree exceeds the depth or node-count budget."
      );
    }
    if (current.node.type === "BlankCanvas") {
      throw new AtomicCommandRegistryError(
        "nested_canvas_forbidden",
        "InsertAtomicTree cannot nest a BlankCanvas."
      );
    }
    const props = isRecord(current.node.props) ? current.node.props : null;
    const id = props?.id;
    if (typeof current.node.type !== "string" || typeof id !== "string" || !id.trim()) {
      throw new AtomicCommandRegistryError(
        "invalid_insert_tree",
        "Every inserted atomic node requires a type and non-empty Props id."
      );
    }
    const inspectIdentity = (value: unknown): void => {
      if (Array.isArray(value)) {
        value.forEach(inspectIdentity);
        return;
      }
      if (!isRecord(value)) return;
      Object.entries(value).forEach(([key, entry]) => {
        if (FORBIDDEN_INSERT_IDENTITY_FIELDS.has(key)) {
          throw new AtomicCommandRegistryError(
            "template_identity_forbidden",
            `Inserted page facts cannot retain ${key}.`
          );
        }
        if (key !== "items") inspectIdentity(entry);
      });
    };
    inspectIdentity(props);
    ids.push(id);
    const items = Array.isArray(props?.items) ? props.items : [];
    items.forEach((item) => {
      if (!isRecord(item)) {
        throw new AtomicCommandRegistryError(
          "invalid_insert_tree",
          "Inserted atomic children must be objects."
        );
      }
      stack.push({ node: item, depth: current.depth + 1 });
    });
  }
  if (new Set(ids).size !== ids.length) {
    throw new AtomicCommandRegistryError(
      "duplicate_insert_id",
      "InsertAtomicTree IDs must be unique within the inserted subtree."
    );
  }
  return Object.freeze(ids);
};

const compileInsertAtomicTree = (
  command: AtomicInsertAtomicTreeCommand,
  currentData: unknown,
  envelope: AtomicCommandEnvelope
): AtomicStructuralCommand => {
  const graph = projectAtomicDocumentGraph(currentData);
  const parent = graph.getNode(command.parentId);
  if (
    !parent ||
    (parent.type !== "BlankCanvas" && parent.type !== "ContainerElement")
  ) {
    throw new AtomicCommandRegistryError(
      "invalid_insert_parent",
      "InsertAtomicTree parent must be an atomic canvas or container."
    );
  }
  if (command.index < 0 || command.index > parent.childIds.length) {
    throw new AtomicCommandRegistryError(
      "insert_index_out_of_bounds",
      "InsertAtomicTree index must address an existing parent boundary."
    );
  }
  if (!new Set(envelope.scope.nodeIds).has(command.parentId)) {
    throw new AtomicCommandRegistryError(
      "scope_denied",
      "InsertAtomicTree scope must contain its existing parent."
    );
  }
  const subtreeIds = inspectInsertTree(command.tree);
  const collision = subtreeIds.find((id) => graph.hasNode(id));
  if (collision) {
    throw new AtomicCommandRegistryError(
      "insert_id_collision",
      `Inserted atomic ID ${collision} already exists in the document.`
    );
  }
  let capacityPlan;
  try {
    capacityPlan = planAtomicInsertCapacity({
      data: currentData,
      index: command.index,
      parentId: command.parentId,
      tree: command.tree,
    });
  } catch (error) {
    if (error instanceof AtomicInsertCapacityError) {
      throw new AtomicCommandRegistryError(error.code, error.message);
    }
    throw error;
  }
  if (capacityPlan.pageRootResize) {
    const matchingResizes = envelope.commands.filter(
      (candidate): candidate is AtomicResizePageRootForInsertCommand =>
        candidate.kind === "resize-page-root-for-insert" &&
        candidate.nodeId === command.parentId
    );
    if (matchingResizes.length === 0) {
      throw new AtomicCommandRegistryError(
        "insert_parent_resize_required",
        "Page-root insertion requires exactly one matching responsive root resize in the same command batch."
      );
    }
    if (matchingResizes.length > 1) {
      throw new AtomicCommandRegistryError(
        "insert_resize_binding_invalid",
        "Page-root insertion cannot bind more than one responsive root resize."
      );
    }
  }
  const nodeId = subtreeIds[0];
  const subtree = cloneAndDeepFreeze(command.tree);
  const subtreeFingerprint = browserAtomicFingerprintPort.fingerprint(subtree);
  return cloneAndDeepFreeze({
    commandId: command.commandId,
    kind: "structural" as const,
    semanticKind: "insert-atomic-tree" as const,
    nodeId,
    operations: [
      {
        kind: "insert-subtree" as const,
        nodeId,
        parentId: command.parentId,
        index: command.index,
        subtree,
        subtreeIds,
        subtreeFingerprint,
      },
    ],
    inverse: [
      {
        kind: "remove-subtree" as const,
        nodeId,
        parentId: command.parentId,
        index: command.index,
        subtreeIds,
        subtreeFingerprint,
      },
    ],
    affectedIds: [command.parentId, ...subtreeIds],
  });
};

const compileResizePageRootForInsert = (
  command: AtomicResizePageRootForInsertCommand,
  currentData: unknown,
  envelope: AtomicCommandEnvelope,
  reparentAuthority: AtomicResolvedReparentAuthority | undefined
): AtomicDedicatedPropsCommand => {
  const matchingInserts = envelope.commands.filter(
    (candidate): candidate is AtomicInsertAtomicTreeCommand =>
      candidate.kind === "insert-atomic-tree" &&
      candidate.parentId === command.nodeId
  );
  const matchingReparents = envelope.commands.filter(
    (candidate): candidate is AtomicReparentCommand =>
      candidate.kind === "reparent" && candidate.parentId === command.nodeId
  );
  if (matchingInserts.length + matchingReparents.length !== 1) {
    throw new AtomicCommandRegistryError(
      "insert_resize_binding_invalid",
      "Page-root resize must bind exactly one InsertAtomicTree or Reparent command for the same parent."
    );
  }
  let planned;
  try {
    planned = matchingInserts[0]
      ? planAtomicInsertCapacity({
          data: currentData,
          index: matchingInserts[0].index,
          parentId: command.nodeId,
          tree: matchingInserts[0].tree,
        }).pageRootResize
      : reparentAuthority
        ? planRegisteredAtomicReparentCapacity({
            authority: reparentAuthority,
            command: matchingReparents[0],
            currentData,
          }).pageRootResize
        : null;
  } catch (error) {
    if (error instanceof AtomicInsertCapacityError) {
      throw new AtomicCommandRegistryError(error.code, error.message);
    }
    throw error;
  }
  if (
    !planned ||
    planned.capacityEvidenceRef !== command.capacityEvidenceRef ||
    planned.desktopHeight !== command.desktopHeight ||
    planned.tabletHeight !== command.tabletHeight ||
    planned.mobileHeight !== command.mobileHeight
  ) {
    throw new AtomicCommandRegistryError(
      "insert_resize_evidence_mismatch",
      "Page-root resize no longer matches the prospective insertion capacity plan."
    );
  }
  const props = findNodeProps(currentData, command.nodeId);
  if (!props) {
    throw new AtomicCommandRegistryError(
      "unknown_node",
      "Page-root resize target no longer exists."
    );
  }
  const responsiveSize =
    props.responsiveSize &&
    typeof props.responsiveSize === "object" &&
    !Array.isArray(props.responsiveSize)
      ? (props.responsiveSize as UnknownRecord)
      : {};
  const tablet =
    responsiveSize.tablet &&
    typeof responsiveSize.tablet === "object" &&
    !Array.isArray(responsiveSize.tablet)
      ? (responsiveSize.tablet as UnknownRecord)
      : {};
  const mobile =
    responsiveSize.mobile &&
    typeof responsiveSize.mobile === "object" &&
    !Array.isArray(responsiveSize.mobile)
      ? (responsiveSize.mobile as UnknownRecord)
      : {};
  return cloneAndDeepFreeze({
    commandId: command.commandId,
    kind: "dedicated-props" as const,
    semanticKind: "resize-page-root-for-insert" as const,
    nodeId: command.nodeId,
    operations: [
      { op: "set" as const, prop: "height", value: command.desktopHeight },
      {
        op: "set" as const,
        prop: "responsiveSize",
        value: {
          ...responsiveSize,
          tablet: { ...tablet, height: command.tabletHeight },
          mobile: { ...mobile, height: command.mobileHeight },
        },
      },
    ],
  });
};

/**
 * K5 migration compiler. Only command families with a completed runtime slice
 * are lowered to the existing pure transaction kernel; every other registered
 * kind remains a typed, zero-write rejection.
 */
export const compileRegisteredAtomicEnvelope = (
  input: unknown,
  currentData: unknown,
  options?: Readonly<{
    reparentAuthority?: AtomicResolvedReparentAuthority;
    resizeAuthority?: AtomicResolvedResizeAuthority;
  }>
): AtomicCommandBatch => {
  const envelope = decodeAtomicCommandEnvelope(input);
  const graph = projectAtomicDocumentGraph(currentData);
  if (envelope.scope.rootId !== graph.rootId) {
    throw new AtomicCommandRegistryError(
      "scope_root_mismatch",
      "Command scope root does not match the canonical atomic graph."
    );
  }
  envelope.scope.nodeIds.forEach((id) => {
    if (!graph.hasNode(id)) {
      throw new AtomicCommandRegistryError(
        "scope_unknown_node",
        `Command scope contains unknown atomic node ${id}.`
      );
    }
  });
  const commands = envelope.commands.map((command) => {
    if (command.kind === "update-props") return command;
    if (command.kind === "adjust-padding") {
      return compileAdjustPadding(command, currentData);
    }
    if (command.kind === "adjust-gap") return compileAdjustGap(command, currentData);
    if (command.kind === "move") return compileMove(command, currentData);
    if (command.kind === "resize") {
      return compileResize(command, currentData, options?.resizeAuthority);
    }
    if (command.kind === "delete-subtree") {
      return compileDeleteSubtree(command, currentData, envelope);
    }
    if (command.kind === "reparent") {
      return compileReparent(
        command,
        currentData,
        envelope,
        options?.reparentAuthority
      );
    }
    if (command.kind === "insert-atomic-tree") {
      return compileInsertAtomicTree(command, currentData, envelope);
    }
    if (command.kind === "resize-page-root-for-insert") {
      return compileResizePageRootForInsert(
        command,
        currentData,
        envelope,
        options?.reparentAuthority
      );
    }
    throw new AtomicCommandRegistryError(
      "runtime_not_migrated",
      "The decoded command kind has no active K5 runtime compiler."
    );
  });
  commands.forEach((command) => {
    if (
      command.kind === "tree-resize" &&
      command.writes.map(({ nodeId }) => nodeId).join(",") !==
        envelope.scope.nodeIds.join(",")
    ) {
      throw new AtomicCommandRegistryError(
        "scope_denied",
        "Free constraint Resize scope must exactly match its complete write set."
      );
    }
  });
  const authorityHash = browserAtomicFingerprintPort.fingerprint(envelope.authority);
  const scopeHash = browserAtomicFingerprintPort.fingerprint(envelope.scope);
  return cloneAndDeepFreeze({
    base: envelope.base,
    batchId: envelope.batchId,
    label: envelope.label,
    commands,
    coalesceKey: envelope.coalesceKey,
    interactionId: envelope.interactionId,
    registryBinding: {
      registryVersion: envelope.contractVersion,
      registryHash: envelope.registryHash,
      idempotencyKey: envelope.idempotencyKey,
      source: envelope.source,
      mode: envelope.mode,
      commandKinds: envelope.commands.map(({ kind }) => kind),
      evidenceRefs: envelope.commands.flatMap((command) =>
        command.kind === "move" && command.snapEvidenceRef
          ? [command.snapEvidenceRef]
          : command.kind === "resize"
            ? options?.resizeAuthority
              ? [
                  options.resizeAuthority.permitFingerprint,
                  options.resizeAuthority.treeReceiptId,
                  options.resizeAuthority.geometryPreviewKey,
                  ...(options.resizeAuthority.constraintReceiptId
                    ? [options.resizeAuthority.constraintReceiptId]
                    : []),
                ]
              : [command.permitRef]
            : command.kind === "reparent" && options?.reparentAuthority
              ? [options.reparentAuthority.targetEvidenceRef]
            : []
      ),
      authorityHash,
      scopeHash,
    },
  });
};
