import {
  assertAtomicWritableTree,
  insertAtomicComponentInTree,
  removeAtomicComponentFromTree,
  replaceAtomicComponentPropsInTree,
} from "../atomic-writable-contract";
import { projectAtomicDocumentGraph } from "./atomic-document-graph";
import {
  assertAtomicDocumentPointer,
  assertAtomicDocumentSnapshotIntegrity,
  atomicJsonEquals,
  browserAtomicFingerprintPort,
  cloneAndDeepFreeze,
  createAtomicDocumentSnapshot,
  type AtomicDocumentPointer,
  type AtomicDocumentSnapshot,
  type AtomicFingerprintPort,
} from "./atomic-document-version";

type UnknownRecord = Record<string, unknown>;

const authorizedLegacyShadowRestoreOperations = new WeakSet<object>();

export type AtomicPropOperation =
  | Readonly<{ op: "set"; prop: string; value: unknown }>
  | Readonly<{ op: "unset"; prop: string }>;

export type AtomicUpdatePropsCommand = Readonly<{
  commandId: string;
  kind: "update-props";
  nodeId: string;
  operations: readonly AtomicPropOperation[];
}>;

export type AtomicDedicatedPropsCommand = Readonly<{
  commandId: string;
  kind: "dedicated-props";
  semanticKind:
    | "adjust-padding"
    | "adjust-gap"
    | "move"
    | "resize"
    | "resize-page-root-for-insert";
  nodeId: string;
  operations: readonly AtomicPropOperation[];
}>;

export type AtomicTreeResizeCommand = Readonly<{
  commandId: string;
  kind: "tree-resize";
  nodeId: string;
  semanticKind: "resize";
  writes: readonly Readonly<{
    nodeId: string;
    operations: readonly AtomicPropOperation[];
  }>[];
}>;

export type AtomicStructuralOperation =
  | Readonly<{
      kind: "remove-subtree";
      nodeId: string;
      parentId: string;
      index: number;
      subtreeIds: readonly string[];
      subtreeFingerprint: string;
    }>
  | Readonly<{
      kind: "insert-subtree";
      nodeId: string;
      parentId: string;
      index: number;
      subtree: UnknownRecord;
      subtreeIds: readonly string[];
      subtreeFingerprint: string;
    }>;

export type AtomicStructuralCommand = Readonly<{
  commandId: string;
  kind: "structural";
  semanticKind: "delete-subtree" | "reparent" | "insert-atomic-tree";
  nodeId: string;
  operations: readonly AtomicStructuralOperation[];
  inverse: readonly AtomicStructuralOperation[];
  affectedIds: readonly string[];
}>;

export type AtomicRegistryBinding = Readonly<{
  registryVersion: string;
  registryHash: string;
  idempotencyKey: string;
  source: "inspector" | "canvas" | "keyboard" | "ai-adapter";
  mode: "preview" | "commit";
  commandKinds: readonly string[];
  evidenceRefs: readonly string[];
  authorityHash: string;
  scopeHash: string;
}>;

export type AtomicCommandBatch = Readonly<{
  base: AtomicDocumentPointer;
  batchId: string;
  label: string;
  commands: readonly (
    | AtomicUpdatePropsCommand
    | AtomicDedicatedPropsCommand
    | AtomicTreeResizeCommand
    | AtomicStructuralCommand
  )[];
  coalesceKey: string | null;
  interactionId: string | null;
  registryBinding?: AtomicRegistryBinding | null;
}>;

export type AtomicResolvedOperation =
  | Readonly<{
      kind: "update-props";
      semanticKind?:
        | "adjust-padding"
        | "adjust-gap"
        | "move"
        | "resize"
        | "resize-page-root-for-insert";
      nodeId: string;
      operations: readonly AtomicPropOperation[];
    }>
  | AtomicStructuralOperation;

/** Compatibility alias while K2 callers migrate to the general replayer. */
export type AtomicResolvedUpdatePropsOperation = AtomicResolvedOperation;

export type AtomicValidationResult =
  | Readonly<{
      kind: "preview";
      atomicFingerprint: string;
      fingerprintAlgorithm: string;
    }>
  | Readonly<AtomicDocumentPointer & { kind: "committed" }>;

export type AtomicValidationReceipt = Readonly<{
  phase: "preview" | "commit" | "coalesce";
  base: AtomicDocumentPointer;
  result: AtomicValidationResult;
  fingerprintPortId: string;
  commandCount: number;
  affectedIds: readonly string[];
  rootId: string;
  nodeCount: number;
  fact: "PASS";
  layout: "PASS";
  graph: "PASS";
  registryBinding: AtomicRegistryBinding | null;
  topology: Readonly<{
    createdIds: readonly string[];
    movedIds: readonly string[];
    operationDigest: string | null;
    removedIds: readonly string[];
  }>;
}>;

export type AtomicCommandPreview<T> = Readonly<{
  kind: "preview";
  previewId: string;
  batchFingerprint: string;
  batch: AtomicCommandBatch;
  base: AtomicDocumentPointer;
  candidateData: T;
  candidateFingerprint: string;
  hasChanges: boolean;
  affectedIds: readonly string[];
  commandSignature: string | null;
  forward: readonly AtomicResolvedOperation[];
  inverse: readonly AtomicResolvedOperation[];
  validationReceipt: AtomicValidationReceipt;
}>;

export type AtomicCommandTransaction = Readonly<{
  transactionId: string;
  label: string;
  affectedIds: readonly string[];
  before: AtomicDocumentPointer;
  after: AtomicDocumentPointer;
  forward: readonly AtomicResolvedOperation[];
  inverse: readonly AtomicResolvedOperation[];
  coalesceKey: string | null;
  interactionId: string | null;
  commandSignature: string | null;
  validationReceipt: AtomicValidationReceipt;
}>;

export type AtomicCommitResult<T> =
  | Readonly<{
      kind: "no-op";
      snapshot: AtomicDocumentSnapshot<T>;
      transaction: null;
    }>
  | Readonly<{
      kind: "committed";
      snapshot: AtomicDocumentSnapshot<T>;
      transaction: AtomicCommandTransaction;
    }>;

export class AtomicCommandContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AtomicCommandContractError";
    this.code = code;
  }
}

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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
  if (Array.isArray(value.content)) {
    return findNodeProps(value.content, nodeId);
  }
  return null;
};

const assertText: (
  value: unknown,
  field: string
) => asserts value is string = (value, field) => {
  if (typeof value !== "string" || !value.trim()) {
    throw new AtomicCommandContractError(
      "missing_identity",
      `${field} must be non-empty.`
    );
  }
};

const assertPropOperations: (
  operations: unknown,
  context: string,
  semanticKind?: AtomicDedicatedPropsCommand["semanticKind"]
) => asserts operations is readonly AtomicPropOperation[] = (
  operations,
  context,
  semanticKind
) => {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new AtomicCommandContractError(
      "empty_operation",
      `${context} must contain at least one prop operation.`
    );
  }
  const props = new Set<string>();
  operations.forEach((candidate) => {
    if (!isRecord(candidate)) {
      throw new AtomicCommandContractError(
        "unsupported_operation",
        `${context} contains a malformed prop operation.`
      );
    }
    assertText(candidate.prop, "operation.prop");
    if (
      isAtomicUpdatePropsProtectedProp(candidate.prop) &&
      !isDedicatedPropAllowed(candidate.prop, semanticKind)
    ) {
      throw new AtomicCommandContractError(
        "protected_prop",
        `${candidate.prop} cannot be changed through UpdateProps; use its dedicated atomic command.`
      );
    }
    if (props.has(candidate.prop)) {
      throw new AtomicCommandContractError(
        "duplicate_prop_operation",
        `${context} changes ${candidate.prop} more than once.`
      );
    }
    props.add(candidate.prop);
    if (candidate.op !== "set" && candidate.op !== "unset") {
      throw new AtomicCommandContractError(
        "unsupported_operation",
        "UpdateProps only accepts set/unset operations."
      );
    }
    if (candidate.op === "set" && candidate.value === undefined) {
      throw new AtomicCommandContractError(
        "undefined_value",
        "Use unset instead of setting undefined."
      );
    }
  });
  const shadowOperation = operations.find(
    (operation) => operation.prop === "shadow"
  );
  if (shadowOperation) {
    const effectMigration = operations.some(
      (operation) => operation.prop === "effect" && operation.op === "set"
    );
    const historyRestore =
      authorizedLegacyShadowRestoreOperations.has(operations) &&
      shadowOperation.op === "set" &&
      operations.some(
        (operation) => operation.prop === "effect" && operation.op === "unset"
      );
    if (
      (shadowOperation.op !== "unset" || !effectMigration) &&
      !historyRestore
    ) {
      throw new AtomicCommandContractError(
        "protected_prop",
        "Legacy shadow is read-only; it may only be unset in the same command that sets effect."
      );
    }
  }
};

const UPDATE_PROPS_PROTECTED_FIELDS = new Set([
  "id",
  "items",
  "frame",
  "layoutItem",
  "layoutMode",
  "padding",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "gap",
  "rowGap",
  "columnGap",
  "gapAnchorOffset",
  "x",
  "y",
  "width",
  "height",
]);

export const isAtomicUpdatePropsProtectedProp = (prop: string) =>
  UPDATE_PROPS_PROTECTED_FIELDS.has(prop) ||
  /^(?:desktop|tablet|mobile)(?:Frame|LayoutItem|Padding|Gap)/u.test(prop);

const isDedicatedPropAllowed = (
  prop: string,
  semanticKind?: AtomicDedicatedPropsCommand["semanticKind"]
) => {
  const base = prop.replace(/^(?:tablet|mobile)/u, "");
  if (semanticKind === "adjust-padding") {
    return ["PaddingTop", "PaddingRight", "PaddingBottom", "PaddingLeft"].includes(
      base[0]?.toUpperCase() + base.slice(1)
    );
  }
  if (semanticKind === "adjust-gap") {
    return ["ColumnGap", "RowGap", "GapAnchorOffset"].includes(
      base[0]?.toUpperCase() + base.slice(1)
    );
  }
  if (
    semanticKind === "move" ||
    semanticKind === "resize" ||
    semanticKind === "resize-page-root-for-insert"
  ) {
    return ["Frame", "LayoutItem", "ResponsiveSize", "Width", "Height", "OffsetX"].includes(
      base[0]?.toUpperCase() + base.slice(1)
    );
  }
  return false;
};

const cloneBatch = (input: AtomicCommandBatch): AtomicCommandBatch => {
  const batch = cloneAndDeepFreeze(input);
  assertText(batch.batchId, "batchId");
  assertText(batch.label, "label");
  if (!Number.isSafeInteger(batch.base.revision) || batch.base.revision < 0) {
    throw new AtomicCommandContractError(
      "invalid_base",
      "base revision must be a non-negative integer."
    );
  }
  assertText(batch.base.atomicFingerprint, "base.atomicFingerprint");
  assertText(batch.base.fingerprintAlgorithm, "base.fingerprintAlgorithm");
  if (batch.commands.length === 0) {
    throw new AtomicCommandContractError(
      "empty_batch",
      "Atomic command batch must contain at least one command."
    );
  }
  if (batch.registryBinding) {
    assertText(batch.registryBinding.registryVersion, "registryBinding.registryVersion");
    assertText(batch.registryBinding.registryHash, "registryBinding.registryHash");
    assertText(batch.registryBinding.idempotencyKey, "registryBinding.idempotencyKey");
    assertText(batch.registryBinding.authorityHash, "registryBinding.authorityHash");
    assertText(batch.registryBinding.scopeHash, "registryBinding.scopeHash");
    if (
      !Array.isArray(batch.registryBinding.evidenceRefs) ||
      batch.registryBinding.evidenceRefs.some(
        (reference) => typeof reference !== "string" || !reference.trim()
      )
    ) {
      throw new AtomicCommandContractError(
        "invalid_registry_binding",
        "Registry evidence references must be non-empty strings."
      );
    }
    if (
      !["inspector", "canvas", "keyboard", "ai-adapter"].includes(
        batch.registryBinding.source
      ) ||
      !["preview", "commit"].includes(batch.registryBinding.mode)
    ) {
      throw new AtomicCommandContractError(
        "invalid_registry_binding",
        "Registry source or mode is invalid."
      );
    }
    if (
      batch.registryBinding.commandKinds.length !== batch.commands.length ||
      batch.registryBinding.commandKinds.some((kind, index) => {
        const command = batch.commands[index];
        return (
          !command ||
          kind !==
            (command.kind === "dedicated-props" || command.kind === "structural" || command.kind === "tree-resize"
              ? command.semanticKind
              : command.kind)
        );
      })
    ) {
      throw new AtomicCommandContractError(
        "registry_command_mismatch",
        "Registry command mapping does not match the compiled batch."
      );
    }
  }
  const commandIds = new Set<string>();
  batch.commands.forEach((command) => {
    if (
      command.kind !== "update-props" &&
      command.kind !== "dedicated-props" &&
      command.kind !== "tree-resize" &&
      command.kind !== "structural"
    ) {
      throw new AtomicCommandContractError(
        "unsupported_command",
        "Atomic transaction only accepts migrated command operations."
      );
    }
    assertText(command.commandId, "commandId");
    assertText(
      command.nodeId,
      "nodeId"
    );
    if (
      (command.kind === "dedicated-props" || command.kind === "structural" || command.kind === "tree-resize") &&
      !batch.registryBinding
    ) {
      throw new AtomicCommandContractError(
        "registry_binding_required",
        "Dedicated atomic commands require a validated Registry binding."
      );
    }
    if (commandIds.has(command.commandId)) {
      throw new AtomicCommandContractError(
        "duplicate_command_id",
        `Duplicate commandId ${command.commandId}.`
      );
    }
    commandIds.add(command.commandId);
    if (command.kind === "structural") {
      if (
        !Array.isArray(command.affectedIds) ||
        command.affectedIds.length === 0 ||
        new Set(command.affectedIds).size !== command.affectedIds.length
      ) {
        throw new AtomicCommandContractError(
          "invalid_structural_scope",
          "Structural commands require unique affected IDs."
        );
      }
      if (command.operations.length === 0 || command.inverse.length === 0) {
        throw new AtomicCommandContractError(
          "empty_structural_operation",
          "Structural commands require forward and inverse operations."
        );
      }
      [...command.operations, ...command.inverse].forEach((operation) => {
        assertText(operation.nodeId, "structural nodeId");
        assertText(operation.parentId, "structural parentId");
        assertText(operation.subtreeFingerprint, "structural subtreeFingerprint");
        if (
          !Array.isArray(operation.subtreeIds) ||
          operation.subtreeIds.length === 0 ||
          operation.subtreeIds[0] !== operation.nodeId ||
          new Set(operation.subtreeIds).size !== operation.subtreeIds.length
        ) {
          throw new AtomicCommandContractError(
            "invalid_structural_identity",
            "Structural operation requires the complete unique subtree identity list."
          );
        }
        if (!Number.isSafeInteger(operation.index) || operation.index < 0) {
          throw new AtomicCommandContractError(
            "invalid_structural_index",
            "Structural operation index must be a non-negative safe integer."
          );
        }
        if (operation.kind === "insert-subtree") {
          const props = isRecord(operation.subtree.props)
            ? operation.subtree.props
            : null;
          if (props?.id !== operation.nodeId) {
            throw new AtomicCommandContractError(
              "structural_identity_mismatch",
              "Inserted subtree root must match the structural node identity."
            );
          }
        }
      });
    } else if (command.kind === "tree-resize") {
      if (
        command.writes.length === 0 ||
        command.writes[0]?.nodeId !== command.nodeId ||
        new Set(command.writes.map(({ nodeId }) => nodeId)).size !==
          command.writes.length
      ) {
        throw new AtomicCommandContractError(
          "invalid_tree_resize_scope",
          "Tree Resize requires a parent-first unique write set."
        );
      }
      command.writes.forEach((write) => {
        assertText(write.nodeId, "tree resize nodeId");
        assertPropOperations(
          write.operations,
          `Tree Resize ${command.commandId}:${write.nodeId}`,
          "resize"
        );
      });
    } else {
      assertPropOperations(
        command.operations,
        `Command ${command.commandId}`,
        command.kind === "dedicated-props" ? command.semanticKind : undefined
      );
    }
  });
  return batch;
};

const applyPropOperations = (
  currentProps: UnknownRecord,
  operations: readonly AtomicPropOperation[]
) => {
  const nextProps = structuredClone(currentProps);
  operations.forEach((operation) => {
    if (operation.op === "unset") delete nextProps[operation.prop];
    else nextProps[operation.prop] = structuredClone(operation.value);
  });
  return nextProps;
};

const resolveChangedOperations = (
  currentProps: UnknownRecord,
  operations: readonly AtomicPropOperation[]
) => {
  const forward: AtomicPropOperation[] = [];
  const inverse: AtomicPropOperation[] = [];
  operations.forEach((operation) => {
    const existed =
      Object.prototype.hasOwnProperty.call(currentProps, operation.prop) &&
      currentProps[operation.prop] !== undefined;
    if (operation.op === "unset") {
      if (!existed) return;
      forward.push({ op: "unset", prop: operation.prop });
    } else {
      if (existed && atomicJsonEquals(currentProps[operation.prop], operation.value)) {
        return;
      }
      forward.push({
        op: "set",
        prop: operation.prop,
        value: structuredClone(operation.value),
      });
    }
    inverse.push(
      existed
        ? {
            op: "set",
            prop: operation.prop,
            value: structuredClone(currentProps[operation.prop]),
          }
        : { op: "unset", prop: operation.prop }
    );
  });
  return { forward, inverse };
};

const signatureForBatch = (batch: AtomicCommandBatch) => {
  if (batch.commands.length !== 1) return null;
  const command = batch.commands[0];
  if (command.kind === "structural") {
    return `${command.semanticKind}:${command.nodeId}:${browserAtomicFingerprintPort.fingerprint(command.operations)}`;
  }
  if (command.kind === "tree-resize") {
    return `resize:${command.nodeId}:${browserAtomicFingerprintPort.fingerprint(command.writes)}`;
  }
  if (
    command.operations.some(
      ({ prop }) => prop === "effect" || prop === "shadow"
    )
  ) {
    return null;
  }
  return `${command.kind === "dedicated-props" ? command.semanticKind : command.kind}:${command.nodeId}:${command.operations
      .map(({ prop }) => prop)
      .sort()
      .join(",")}`;
};

export const createAtomicValidationReceipt = (
  phase: AtomicValidationReceipt["phase"],
  base: AtomicDocumentPointer,
  result: AtomicValidationResult,
  fingerprintPortId: string,
  commandCount: number,
  affectedIds: readonly string[],
  data: unknown,
  registryBinding: AtomicRegistryBinding | null = null,
  operations: readonly AtomicResolvedOperation[] = []
): AtomicValidationReceipt => {
  assertAtomicWritableTree(data, `atomic-command-${phase}`);
  const graph = projectAtomicDocumentGraph(data);
  const inserted = operations.filter(
    (operation): operation is Extract<AtomicStructuralOperation, { kind: "insert-subtree" }> =>
      operation.kind === "insert-subtree"
  );
  const removed = operations.filter(
    (operation): operation is Extract<AtomicStructuralOperation, { kind: "remove-subtree" }> =>
      operation.kind === "remove-subtree"
  );
  const insertedIds = new Set(inserted.flatMap(({ subtreeIds }) => subtreeIds));
  const removedIds = new Set(removed.flatMap(({ subtreeIds }) => subtreeIds));
  const movedIds = [...insertedIds].filter((id) => removedIds.has(id));
  movedIds.forEach((id) => {
    insertedIds.delete(id);
    removedIds.delete(id);
  });
  const structuralOperations = operations.filter(
    (operation) => operation.kind !== "update-props"
  );
  return cloneAndDeepFreeze({
    phase,
    base,
    result,
    fingerprintPortId,
    commandCount,
    affectedIds,
    rootId: graph.rootId,
    nodeCount: graph.size,
    fact: "PASS" as const,
    layout: "PASS" as const,
    graph: "PASS" as const,
    registryBinding,
    topology: {
      createdIds: [...insertedIds],
      movedIds,
      operationDigest:
        structuralOperations.length > 0
          ? browserAtomicFingerprintPort.fingerprint(structuralOperations)
          : null,
      removedIds: [...removedIds],
    },
  });
};

export const applyAtomicUpdatePropsOperations = <T>(
  data: T,
  operations: readonly AtomicResolvedOperation[]
): T => {
  assertAtomicWritableTree(data, "atomic-operation-replay-before");
  let working = data;
  operations.forEach((operation) => {
    if (operation.kind === "remove-subtree") {
      const graph = projectAtomicDocumentGraph(working);
      const node = graph.getNode(operation.nodeId);
      if (
        !node ||
        node.parentId !== operation.parentId ||
        node.indexInParent !== operation.index
      ) {
        throw new AtomicCommandContractError(
          "structural_replay_mismatch",
          "Remove replay no longer matches the canonical parent/index boundary."
        );
      }
      const removed = removeAtomicComponentFromTree(working, operation.nodeId);
      if (
        browserAtomicFingerprintPort.fingerprint(removed.removedNode) !==
        operation.subtreeFingerprint
      ) {
        throw new AtomicCommandContractError(
          "structural_fingerprint_mismatch",
          "Removed subtree does not match the resolved structural operation."
        );
      }
      working = removed.nextData;
      assertAtomicWritableTree(working, "atomic-operation-replay-remove");
      projectAtomicDocumentGraph(working);
      return;
    }
    if (operation.kind === "insert-subtree") {
      const graph = projectAtomicDocumentGraph(working);
      const parent = graph.getNode(operation.parentId);
      if (
        !parent ||
        graph.hasNode(operation.nodeId) ||
        operation.index > parent.childIds.length ||
        browserAtomicFingerprintPort.fingerprint(operation.subtree) !==
          operation.subtreeFingerprint
      ) {
        throw new AtomicCommandContractError(
          "structural_replay_mismatch",
          "Insert replay violates parent, identity, index, or subtree authority."
        );
      }
      working = insertAtomicComponentInTree(
        working,
        operation.parentId,
        operation.subtree,
        operation.index
      );
      assertAtomicWritableTree(working, "atomic-operation-replay-insert");
      projectAtomicDocumentGraph(working);
      return;
    }
    assertText(operation.nodeId, "compiled operation nodeId");
    assertPropOperations(
      operation.operations,
      `Compiled operation for ${operation.nodeId}`,
      operation.semanticKind
    );
    const currentProps = findNodeProps(working, operation.nodeId);
    if (!currentProps) {
      throw new AtomicCommandContractError(
        "unknown_node",
        `Atomic node ${operation.nodeId} was not found during replay.`
      );
    }
    const nextProps = applyPropOperations(
      currentProps,
      operation.operations
    );
    working = replaceAtomicComponentPropsInTree(
      working,
      operation.nodeId,
      nextProps
    );
    assertAtomicWritableTree(working, "atomic-operation-replay-step");
    projectAtomicDocumentGraph(working);
  });
  return cloneAndDeepFreeze(working);
};

export const previewAtomicCommandBatch = <T>(
  current: AtomicDocumentSnapshot<T>,
  input: AtomicCommandBatch,
  fingerprintPort: AtomicFingerprintPort = browserAtomicFingerprintPort
): AtomicCommandPreview<T> => {
  assertAtomicDocumentSnapshotIntegrity(current, fingerprintPort);
  const batch = cloneBatch(input);
  assertAtomicDocumentPointer(batch.base, current.pointer);

  let working = current.data;
  const forward: AtomicResolvedOperation[] = [];
  const inverseByCommand: AtomicResolvedOperation[][] = [];
  const affectedIds: string[] = [];

  batch.commands.forEach((command) => {
    if (command.kind === "structural") {
      const candidate = applyAtomicUpdatePropsOperations(
        working,
        command.operations
      );
      forward.push(...command.operations);
      inverseByCommand.push([...command.inverse]);
      command.affectedIds.forEach((id) => {
        if (!affectedIds.includes(id)) affectedIds.push(id);
      });
      working = candidate;
      return;
    }
    if (command.kind === "tree-resize") {
      const commandInverse: AtomicResolvedOperation[] = [];
      command.writes.forEach((write) => {
        const graph = projectAtomicDocumentGraph(working);
        if (!graph.hasNode(write.nodeId)) {
          throw new AtomicCommandContractError(
            "unknown_node",
            `Atomic tree resize node ${write.nodeId} was not found.`
          );
        }
        const currentProps = findNodeProps(working, write.nodeId);
        if (!currentProps) {
          throw new AtomicCommandContractError(
            "unknown_node",
            `Atomic tree resize node ${write.nodeId} has no Props.`
          );
        }
        const resolved = resolveChangedOperations(currentProps, write.operations);
        if (resolved.forward.length === 0) return;
        const nextProps = applyPropOperations(currentProps, resolved.forward);
        const candidate = replaceAtomicComponentPropsInTree(
          working,
          write.nodeId,
          nextProps
        );
        assertAtomicWritableTree(candidate, "atomic-tree-resize-preview-step");
        projectAtomicDocumentGraph(candidate);
        forward.push(
          cloneAndDeepFreeze({
            kind: "update-props" as const,
            semanticKind: "resize" as const,
            nodeId: write.nodeId,
            operations: resolved.forward,
          })
        );
        commandInverse.unshift(
          cloneAndDeepFreeze({
            kind: "update-props" as const,
            semanticKind: "resize" as const,
            nodeId: write.nodeId,
            operations: resolved.inverse,
          })
        );
        if (!affectedIds.includes(write.nodeId)) affectedIds.push(write.nodeId);
        working = candidate;
      });
      inverseByCommand.push(commandInverse);
      return;
    }
    const graph = projectAtomicDocumentGraph(working);
    if (!graph.hasNode(command.nodeId)) {
      throw new AtomicCommandContractError(
        "unknown_node",
        `Atomic node ${command.nodeId} was not found.`
      );
    }
    const currentProps = findNodeProps(working, command.nodeId);
    if (!currentProps) {
      throw new AtomicCommandContractError(
        "unknown_node",
        `Atomic node ${command.nodeId} has no Props.`
      );
    }
    const resolved = resolveChangedOperations(currentProps, command.operations);
    if (resolved.forward.length === 0) return;
    const nextProps = applyPropOperations(currentProps, resolved.forward);
    const candidate = replaceAtomicComponentPropsInTree(
      working,
      command.nodeId,
      nextProps
    );
    assertAtomicWritableTree(candidate, "atomic-command-preview-step");
    projectAtomicDocumentGraph(candidate);
    forward.push(
      cloneAndDeepFreeze({
        kind: "update-props" as const,
        ...(command.kind === "dedicated-props"
          ? { semanticKind: command.semanticKind }
          : {}),
        nodeId: command.nodeId,
        operations: resolved.forward,
      })
    );
    inverseByCommand.push([
      cloneAndDeepFreeze({
        kind: "update-props" as const,
        ...(command.kind === "dedicated-props"
          ? { semanticKind: command.semanticKind }
          : {}),
        nodeId: command.nodeId,
        operations: resolved.inverse,
      }),
    ]);
    if (!affectedIds.includes(command.nodeId)) affectedIds.push(command.nodeId);
    working = candidate;
  });

  const candidate = createAtomicDocumentSnapshot(
    working,
    current.pointer.revision,
    fingerprintPort
  );
  const batchFingerprint = fingerprintPort.fingerprint(batch);
  const previewId = `preview:${batch.batchId}:${current.pointer.revision}:${candidate.pointer.atomicFingerprint}:${batchFingerprint}`;
  const hasChanges =
    !atomicJsonEquals(candidate.data, current.data);
  return cloneAndDeepFreeze({
    kind: "preview" as const,
    previewId,
    batchFingerprint,
    batch,
    base: current.pointer,
    candidateData: candidate.data,
    candidateFingerprint: candidate.pointer.atomicFingerprint,
    hasChanges,
    affectedIds,
    commandSignature: signatureForBatch(batch),
    forward,
    inverse: [...inverseByCommand].reverse().flat(),
    validationReceipt: createAtomicValidationReceipt(
      "preview",
      current.pointer,
      {
        kind: "preview",
        atomicFingerprint: candidate.pointer.atomicFingerprint,
        fingerprintAlgorithm: candidate.pointer.fingerprintAlgorithm,
      },
      fingerprintPort.id,
      batch.commands.length,
      affectedIds,
      candidate.data,
      batch.registryBinding ?? null
      ,forward
    ),
  });
};

export const commitAtomicCommandPreview = <T>(
  current: AtomicDocumentSnapshot<T>,
  suppliedPreview: AtomicCommandPreview<T>,
  fingerprintPort: AtomicFingerprintPort = browserAtomicFingerprintPort
): AtomicCommitResult<T> => {
  assertAtomicDocumentSnapshotIntegrity(current, fingerprintPort);
  assertAtomicDocumentPointer(suppliedPreview.base, current.pointer);
  const preview = previewAtomicCommandBatch(
    current,
    suppliedPreview.batch,
    fingerprintPort
  );
  if (
    preview.previewId !== suppliedPreview.previewId ||
    preview.batchFingerprint !== suppliedPreview.batchFingerprint ||
    preview.candidateFingerprint !== suppliedPreview.candidateFingerprint
  ) {
    throw new AtomicCommandContractError(
      "preview_mismatch",
      "Supplied preview does not match a fresh compilation."
    );
  }
  if (!preview.hasChanges) {
    return Object.freeze({ kind: "no-op", snapshot: current, transaction: null });
  }

  const next = createAtomicDocumentSnapshot(
    preview.candidateData,
    current.pointer.revision + 1,
    fingerprintPort
  );
  const validationReceipt = createAtomicValidationReceipt(
    "commit",
    current.pointer,
    { kind: "committed", ...next.pointer },
    fingerprintPort.id,
    preview.batch.commands.length,
    preview.affectedIds,
    next.data,
    preview.batch.registryBinding ?? null
    ,preview.forward
  );
  const transaction: AtomicCommandTransaction = cloneAndDeepFreeze({
    transactionId: `transaction:${preview.batch.batchId}:${next.pointer.revision}`,
    label: preview.batch.label,
    affectedIds: preview.affectedIds,
    before: current.pointer,
    after: next.pointer,
    forward: preview.forward,
    inverse: preview.inverse,
    coalesceKey: preview.batch.coalesceKey,
    interactionId: preview.batch.interactionId,
    commandSignature: preview.commandSignature,
    validationReceipt,
  });
  transaction.inverse.forEach((operation) => {
    if (
      operation.kind === "update-props" &&
      operation.operations.some(
        ({ op, prop }) => op === "set" && prop === "shadow"
      ) &&
      operation.operations.some(
        ({ op, prop }) => op === "unset" && prop === "effect"
      )
    ) {
      authorizedLegacyShadowRestoreOperations.add(operation.operations);
    }
  });
  return Object.freeze({ kind: "committed", snapshot: next, transaction });
};
