import {
  resolveAtomicLayoutCapability,
  resolveAtomicOwnLayoutMode,
  type AtomicLayoutAxis,
  type AtomicParentLayoutMode,
} from "../atomic-layout-capabilities";
import type { PageFactComponentType } from "../page-fact-types";
import {
  allocateAtomicBlankCanvasViewport,
  resolveAtomicBlankCanvasPreferredViewport,
  resolveAtomicContainerLayoutValues,
  resolveAtomicLayoutItem,
  resolveAtomicResponsiveFrame,
  type AtomicLayoutDevice,
  type AtomicLayoutFrame,
  type AtomicLayoutSizeMode,
  type AtomicResponsiveLayoutFrame,
  type AtomicResponsiveLayoutItem,
} from "./atomic-layout-authored-values";
import {
  AtomicLayoutContractError,
  type AtomicFreeConstraintTreeReceipt,
  type AtomicLayoutAuthorityIslandReceipt,
  type AtomicLayoutEphemeralOverrides,
  type AtomicLayoutErrorCode,
  type AtomicLayoutErrorKind,
  type AtomicLayoutRect,
  type AtomicLayoutTreeIdentity,
  type AtomicLayoutTreeAxisWrite,
  type AtomicLayoutTreeGeometryPreview,
  type AtomicLayoutTreeGestureHandoffWrite,
  type AtomicLayoutTreeMeasurementBatch,
  type AtomicLayoutTreeMeasurementNode,
  type AtomicLayoutTreeMeasurementPlan,
  type AtomicLayoutTreeMeasurementPlanNode,
  type AtomicLayoutTreeRootAllocation,
  type AtomicLayoutTreeScopeReceipt,
  type AtomicLayoutTreeSolveInput,
  type AtomicLayoutTreeSolveResult,
  type AtomicResolvedLayout,
  type AtomicResolvedLayoutAxisOwner,
  type AtomicResolvedLayoutChild,
  type AtomicResolvedLayoutGapBand,
  type AtomicResolvedLayoutPaddingBand,
} from "./atomic-layout-contract";
import { resolveAtomicFreeConstraintTreePreview } from "./atomic-free-constraints";
import {
  ATOMIC_FRAME_MIN_HEIGHT,
  ATOMIC_FRAME_MIN_WIDTH,
} from "./atomic-geometry-limits";
import {
  projectAtomicDocumentGraph,
  type AtomicDocumentGraph,
  type AtomicDocumentGraphNode,
} from "./atomic-document-graph";
import {
  atomicDocumentPointerEquals,
  browserAtomicFingerprintPort,
  canonicalAtomicJson,
} from "./atomic-document-version";
import { resolveAtomicTextIntrinsicSourceSignature } from "./atomic-text-intrinsic-signature";

type UnknownRecord = Readonly<Record<string, unknown>>;
type FlowMode = "horizontal" | "vertical";

type CompiledNode = Readonly<{
  frame: AtomicLayoutFrame;
  gestureFixedAxes: readonly AtomicLayoutAxis[];
  graph: AtomicDocumentGraphNode;
  heightMode: AtomicLayoutSizeMode;
  ownLayoutMode: AtomicParentLayoutMode;
  parentLayoutMode: AtomicParentLayoutMode;
  widthMode: AtomicLayoutSizeMode;
}>;

type ScopeIssue = Readonly<{
  code: AtomicLayoutErrorCode;
  nodeId: string;
}>;

type CompiledScope = Readonly<{
  issue: ScopeIssue | null;
  mode: FlowMode | null;
  node: CompiledNode;
  values: ReturnType<typeof resolveAtomicContainerLayoutValues> | null;
}>;

type CompiledIsland = Readonly<{
  boundaryScopeIds: readonly string[];
  disposition: "accepted" | "legacy";
  id: string;
  legacyCode?: AtomicLayoutErrorCode;
  scopeIds: readonly string[];
}>;

type CompiledTree = Readonly<{
  acceptedScopeIds: ReadonlySet<string>;
  geometryPreview?: AtomicLayoutTreeGeometryPreview;
  graph: AtomicDocumentGraph;
  identity: AtomicLayoutTreeIdentity;
  islandByScopeId: ReadonlyMap<string, CompiledIsland>;
  islands: readonly CompiledIsland[];
  nodes: ReadonlyMap<string, CompiledNode>;
  rootAllocation: AtomicLayoutTreeRootAllocation;
  scopes: ReadonlyMap<string, CompiledScope>;
}>;

type AxisScopeState = Readonly<{
  childPositions: ReadonlyMap<string, number>;
  childSizes: ReadonlyMap<string, number>;
  contentSize: number;
  size: number;
}>;

type AxisSolveState = Readonly<{
  nodeSizes: ReadonlyMap<string, number>;
  scopes: ReadonlyMap<string, AxisScopeState>;
}>;

const fail = ({
  code,
  kind,
  message,
  nodeId,
}: {
  code: AtomicLayoutErrorCode;
  kind: AtomicLayoutErrorKind;
  message: string;
  nodeId?: string;
}): never => {
  throw new AtomicLayoutContractError({ code, kind, message, nodeId });
};

const finiteNonNegative = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

const frozenRect = (
  x: number,
  y: number,
  width: number,
  height: number
): AtomicLayoutRect => Object.freeze({ height, width, x, y });

const record = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

const resolveParentChildMode = (
  parentProps: UnknownRecord | null,
  field: "childHeightMode" | "childWidthMode"
): AtomicLayoutSizeMode => {
  const value = parentProps?.[field];
  return value === "fill" || value === "hug" ? value : "fixed";
};

export const resolveBlankCanvasFrame = (
  props: UnknownRecord,
  device: AtomicLayoutDevice,
  rootAllocation: AtomicLayoutTreeRootAllocation,
  preview?: Extract<
    AtomicLayoutTreeGeometryPreview,
    { kind: "blank-canvas-resize" }
  >
): AtomicLayoutFrame => {
  const viewport = allocateAtomicBlankCanvasViewport({
    hostInlineSize: rootAllocation.hostInlineSize,
    preferred: resolveAtomicBlankCanvasPreferredViewport({
      device,
      props,
      transient: preview?.frame,
    }),
  });
  if (
    !finiteNonNegative(viewport.offsetX) ||
    !finiteNonNegative(viewport.height) ||
    viewport.height === 0 ||
    !finiteNonNegative(viewport.width) ||
    viewport.width === 0
  ) {
    return fail({
      code: "FRAME_INVALID",
      kind: "invalid",
      message: "Atomic layout tree BlankCanvas viewport must be finite and positive.",
      nodeId: typeof props.id === "string" ? props.id : undefined,
    });
  }
  return Object.freeze({
    height: viewport.height,
    width: viewport.width,
    x: 0,
    y: 0,
    zIndex: 0,
  });
};

const resolveNodeFrame = (
  node: AtomicDocumentGraphNode,
  device: AtomicLayoutDevice,
  rootAllocation: AtomicLayoutTreeRootAllocation,
  preview?: AtomicLayoutTreeGeometryPreview
): AtomicLayoutFrame => {
  if (node.type === "BlankCanvas") {
    return resolveBlankCanvasFrame(
      node.props,
      device,
      rootAllocation,
      preview?.kind === "blank-canvas-resize" && preview.nodeId === node.id
        ? preview
        : undefined
    );
  }
  const responsive = node.props.frame as AtomicResponsiveLayoutFrame | undefined;
  if (!responsive?.desktop) {
    return fail({
      code: "FRAME_INVALID",
      kind: "invalid",
      message: `Atomic layout tree node ${node.id} has no responsive frame.`,
      nodeId: node.id,
    });
  }
  const frame =
    (preview?.kind === "container-resize" ||
      preview?.kind === "free-container-resize" || preview?.kind === "free-flow-container-resize") &&
    preview.nodeId === node.id
      ? preview.frame
      : resolveAtomicResponsiveFrame(responsive, device);
  for (const field of ["height", "width", "x", "y", "zIndex"] as const) {
    if (!Number.isFinite(Number(frame[field]))) {
      return fail({
        code: "FRAME_INVALID",
        kind: "invalid",
        message: `Atomic layout tree frame ${node.id}.${field} must be finite.`,
        nodeId: node.id,
      });
    }
  }
  return Object.freeze({ ...frame });
};

const resolveTransform = (props: UnknownRecord, device: AtomicLayoutDevice) => {
  const transform = record(props.transform);
  const desktop = {
    flipHorizontal: false,
    flipVertical: false,
    rotation: 0,
    ...record(transform.desktop),
  };
  const tablet = { ...desktop, ...record(transform.tablet) };
  return device === "desktop"
    ? desktop
    : device === "tablet"
    ? tablet
    : { ...tablet, ...record(transform.mobile) };
};

const unsupportedIssue = (
  code: AtomicLayoutErrorCode,
  nodeId: string
): ScopeIssue => Object.freeze({ code, nodeId });

const inspectSimpleNode = (
  node: CompiledNode,
  device: AtomicLayoutDevice
): ScopeIssue | null => {
  if (node.graph.props.hidden === true) {
    return unsupportedIssue("HIDDEN_CHILD_UNSUPPORTED", node.graph.id);
  }
  const transform = resolveTransform(node.graph.props, device);
  if (
    Number(transform.rotation) !== 0 ||
    transform.flipHorizontal === true ||
    transform.flipVertical === true
  ) {
    return unsupportedIssue("TRANSFORM_UNSUPPORTED", node.graph.id);
  }
  const borderWidths = [
    node.graph.props.borderWidth,
    node.graph.props.borderTopWidth,
    node.graph.props.borderRightWidth,
    node.graph.props.borderBottomWidth,
    node.graph.props.borderLeftWidth,
  ].filter((value) => value !== undefined);
  if (borderWidths.some((value) => Number(value) !== 0)) {
    return unsupportedIssue("BORDER_UNSUPPORTED", node.graph.id);
  }
  if (
    (node.widthMode === "fixed" && node.frame.width <= 0) ||
    (node.heightMode === "fixed" && node.frame.height <= 0) ||
    node.frame.width < 0 ||
    node.frame.height < 0
  ) {
    return fail({
      code: "FRAME_INVALID",
      kind: "invalid",
      message: `Atomic layout tree node ${node.graph.id} has an invalid size.`,
      nodeId: node.graph.id,
    });
  }
  return null;
};

const inspectMetrics = (
  props: UnknownRecord,
  overrides: AtomicLayoutEphemeralOverrides | undefined,
  nodeId: string
) => {
  const paddingFields = [
    "paddingX",
    "paddingY",
    "paddingTop",
    "paddingRight",
    "paddingBottom",
    "paddingLeft",
    "tabletPaddingX",
    "tabletPaddingY",
    "tabletPaddingTop",
    "tabletPaddingRight",
    "tabletPaddingBottom",
    "tabletPaddingLeft",
    "mobilePaddingX",
    "mobilePaddingY",
    "mobilePaddingTop",
    "mobilePaddingRight",
    "mobilePaddingBottom",
    "mobilePaddingLeft",
  ] as const;
  for (const field of paddingFields) {
    const value = props[field];
    if (value === undefined) continue;
    if (!Number.isFinite(Number(value)) || Number(value) < 0) {
      fail({
        code: "PADDING_INVALID",
        kind: "invalid",
        message: `Atomic layout tree padding ${nodeId}.${field} must be finite and non-negative.`,
        nodeId,
      });
    }
  }
  for (const field of [
    "columnGap",
    "rowGap",
    "tabletColumnGap",
    "tabletRowGap",
    "mobileColumnGap",
    "mobileRowGap",
  ] as const) {
    const value = props[field];
    if (value === undefined) continue;
    if (
      !Number.isFinite(Number(value)) ||
      Number(value) < -240 ||
      Number(value) > 240
    ) {
      fail({
        code: "GAP_INVALID",
        kind: "invalid",
        message: `Atomic layout tree gap ${nodeId}.${field} must be within -240..240.`,
        nodeId,
      });
    }
  }
  const allowedOverrideFields = new Set([
    "columnGap",
    "gapAnchorOffset",
    "paddingBottom",
    "paddingLeft",
    "paddingRight",
    "paddingTop",
    "rowGap",
  ]);
  for (const [field, value] of Object.entries(overrides ?? {})) {
    if (!allowedOverrideFields.has(field)) {
      fail({
        code: "OVERRIDE_SCOPE_INVALID",
        kind: "invalid",
        message: `Atomic layout tree override ${nodeId}.${field} is unknown.`,
        nodeId,
      });
    }
    if (!Number.isFinite(Number(value))) {
      fail({
        code: field.startsWith("padding") ? "PADDING_INVALID" : "GAP_INVALID",
        kind: "invalid",
        message: `Atomic layout tree override ${nodeId}.${field} must be finite.`,
        nodeId,
      });
    }
    if (field.startsWith("padding") && Number(value) < 0) {
      fail({
        code: "PADDING_INVALID",
        kind: "invalid",
        message: `Atomic layout tree override ${nodeId}.${field} must be non-negative.`,
        nodeId,
      });
    }
    if (
      (field === "columnGap" || field === "rowGap") &&
      (Number(value) < -240 || Number(value) > 240)
    ) {
      fail({
        code: "GAP_INVALID",
        kind: "invalid",
        message: `Atomic layout tree override ${nodeId}.${field} must be within -240..240.`,
        nodeId,
      });
    }
  }
};

const sameTreeIdentity = (
  left: AtomicLayoutTreeIdentity,
  right: AtomicLayoutTreeIdentity
) =>
  left.authorityKey === right.authorityKey &&
  left.device === right.device &&
  left.generation === right.generation &&
  left.geometryPreviewKey === right.geometryPreviewKey &&
  left.measurementFrameId === right.measurementFrameId &&
  left.rootAllocationKey === right.rootAllocationKey &&
  left.rootElementId === right.rootElementId &&
  left.runtimeEpoch === right.runtimeEpoch &&
  left.topologyFingerprint === right.topologyFingerprint &&
  atomicDocumentPointerEquals(left.pointer, right.pointer) &&
  canonicalAtomicJson(left.nodeOrder) === canonicalAtomicJson(right.nodeOrder) &&
  canonicalAtomicJson(left.scopeOrder) === canonicalAtomicJson(right.scopeOrder);

export const createAtomicLayoutTreeGeometryPreviewKey = (
  preview?: AtomicLayoutTreeGeometryPreview
) => browserAtomicFingerprintPort.fingerprint(preview ?? null);

export const createAtomicLayoutTreeRootAllocationKey = (
  allocation: AtomicLayoutTreeRootAllocation
) => browserAtomicFingerprintPort.fingerprint(allocation);

const validateRootIdentity = (input: AtomicLayoutTreeSolveInput) => {
  if (!input.authorityKey.trim()) {
    fail({
      code: "ROOT_SCOPE_STALE",
      kind: "invalid",
      message: "Atomic layout tree authority key must be non-empty.",
    });
  }
  if (
    !Number.isSafeInteger(input.measurementFrameId) ||
    input.measurementFrameId < 0
  ) {
    fail({
      code: "MEASUREMENT_FRAME_INVALID",
      kind: "invalid",
      message: "Atomic layout tree measurement frame must be a non-negative integer.",
    });
  }
  if (!Number.isSafeInteger(input.runtimeEpoch) || input.runtimeEpoch < 0) {
    fail({
      code: "RUNTIME_EPOCH_STALE",
      kind: "invalid",
      message: "Atomic layout tree runtime epoch must be a non-negative integer.",
    });
  }
  if (!Number.isSafeInteger(input.generation) || input.generation < 0) {
    fail({
      code: "TREE_GENERATION_STALE",
      kind: "invalid",
      message: "Atomic layout tree generation must be a non-negative integer.",
    });
  }
  if (
    input.rootAllocation.kind !== "finite-inline-v1" ||
    (input.rootAllocation.source !== "editor-device-host" &&
      input.rootAllocation.source !== "published-containing-block") ||
    typeof input.rootAllocation.hostInlineSize !== "number" ||
    !Number.isFinite(input.rootAllocation.hostInlineSize) ||
    input.rootAllocation.hostInlineSize <= 0 ||
    !Number.isSafeInteger(input.rootAllocation.frameId) ||
    input.rootAllocation.frameId < 0
  ) {
    fail({
      code: "ROOT_ALLOCATION_INVALID",
      kind: "invalid",
      message: "Atomic layout tree root allocation must be finite and versioned.",
      nodeId: input.rootElementId,
    });
  }
  if (
    createAtomicLayoutTreeRootAllocationKey(input.rootAllocation) !==
    input.expected.rootAllocationKey
  ) {
    fail({
      code: "ROOT_ALLOCATION_STALE",
      kind: "stale",
      message: "Atomic layout tree root allocation identity is stale.",
      nodeId: input.rootElementId,
    });
  }
  if (!atomicDocumentPointerEquals(input.document.pointer, input.expected.pointer)) {
    fail({
      code: "DOCUMENT_POINTER_STALE",
      kind: "stale",
      message: "Atomic layout tree document pointer is stale.",
    });
  }
  if (input.device !== input.expected.device) {
    fail({ code: "DEVICE_STALE", kind: "stale", message: "Atomic layout tree device is stale." });
  }
  if (input.measurementFrameId !== input.expected.measurementFrameId) {
    fail({
      code: "MEASUREMENT_FRAME_STALE",
      kind: "stale",
      message: "Atomic layout tree measurement frame is stale.",
    });
  }
  if (input.runtimeEpoch !== input.expected.runtimeEpoch) {
    fail({ code: "RUNTIME_EPOCH_STALE", kind: "stale", message: "Atomic layout tree runtime epoch is stale." });
  }
  if (input.generation !== input.expected.generation) {
    fail({ code: "TREE_GENERATION_STALE", kind: "stale", message: "Atomic layout tree generation is stale." });
  }
  if (
    createAtomicLayoutTreeGeometryPreviewKey(input.geometryPreview) !==
    input.expected.geometryPreviewKey
  ) {
    fail({
      code: "GEOMETRY_PREVIEW_STALE",
      kind: "stale",
      message: "Atomic layout tree geometry preview identity is stale.",
      nodeId: input.geometryPreview?.nodeId,
    });
  }
  if (input.authorityKey !== input.expected.authorityKey) {
    fail({ code: "ROOT_SCOPE_STALE", kind: "stale", message: "Atomic layout tree authority key is stale." });
  }
  if (
    input.rootElementId !== input.expected.rootElementId ||
    input.rootElementId !== input.document.rootId
  ) {
    fail({
      code: "ROOT_SCOPE_STALE",
      kind: "stale",
      message: "Atomic layout tree root identity is stale.",
      nodeId: input.rootElementId,
    });
  }
};

const freezeIdentity = (
  input: AtomicLayoutTreeSolveInput,
  graph: AtomicDocumentGraph,
  scopeOrder: readonly string[]
): AtomicLayoutTreeIdentity => {
  const topologyFingerprint = browserAtomicFingerprintPort.fingerprint(
    graph.preorderIds.map((id) => {
      const node = graph.getNode(id)!;
      return {
        childIds: node.childIds,
        id: node.id,
        parentId: node.parentId,
        type: node.type,
      };
    })
  );
  return Object.freeze({
    authorityKey: input.authorityKey,
    device: input.device,
    generation: input.generation,
    geometryPreviewKey: input.expected.geometryPreviewKey,
    measurementFrameId: input.measurementFrameId,
    nodeOrder: Object.freeze([...graph.preorderIds]),
    pointer: Object.freeze({ ...input.document.pointer }),
    rootElementId: input.rootElementId,
    rootAllocationKey: input.expected.rootAllocationKey,
    runtimeEpoch: input.runtimeEpoch,
    scopeOrder: Object.freeze([...scopeOrder]),
    topologyFingerprint,
  });
};

const validateGeometryPreview = (
  input: AtomicLayoutTreeSolveInput,
  graph: AtomicDocumentGraph
): AtomicLayoutTreeGeometryPreview | undefined => {
  const preview = input.geometryPreview;
  if (!preview) return undefined;
  if (
    !preview.sessionId.trim() ||
    !Number.isSafeInteger(preview.sequence) ||
    preview.sequence < 0 ||
    !Number.isSafeInteger(preview.generation) ||
    preview.generation !== input.generation
  ) {
    fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Atomic layout geometry preview session is invalid.",
      nodeId: preview.nodeId,
    });
  }
  const canonicalAxes = (["width", "height"] as const).filter((axis) =>
    preview.resizedAxes.includes(axis)
  );
  if (
    canonicalAxes.length === 0 ||
    canonicalAxes.length !== preview.resizedAxes.length ||
    canonicalAtomicJson(canonicalAxes) !== canonicalAtomicJson(preview.resizedAxes)
  ) {
    fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Atomic layout geometry preview axes must be unique and canonical.",
      nodeId: preview.nodeId,
    });
  }
  const previewFrameValues = Object.values(preview.frame);
  if (
    previewFrameValues.some(
      (value) => typeof value !== "number" || !Number.isFinite(value)
    ) ||
    preview.frame.width <= 0 ||
    preview.frame.height <= 0
  ) {
    fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Atomic layout geometry preview frame must be finite and positive.",
      nodeId: preview.nodeId,
    });
  }
  if (preview.kind === "blank-canvas-resize") {
    if (
      preview.nodeId !== input.rootElementId ||
      preview.frame.offsetX < 0
    ) {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "invalid",
        message: "BlankCanvas geometry preview must target the current root.",
        nodeId: preview.nodeId,
      });
    }
    const root = graph.getNode(input.rootElementId)!;
    const authored = allocateAtomicBlankCanvasViewport({
      hostInlineSize: input.rootAllocation.hostInlineSize,
      preferred: resolveAtomicBlankCanvasPreferredViewport({
        device: input.device,
        props: root.props,
      }),
    });
    const resolvedPreview = allocateAtomicBlankCanvasViewport({
      hostInlineSize: input.rootAllocation.hostInlineSize,
      preferred: resolveAtomicBlankCanvasPreferredViewport({
        device: input.device,
        props: root.props,
        transient: preview.frame,
      }),
    });
    if (
      canonicalAtomicJson(resolvedPreview) !== canonicalAtomicJson(preview.frame) ||
      (!canonicalAxes.includes("width") &&
        (preview.frame.width !== authored.width ||
          preview.frame.offsetX !== authored.offsetX)) ||
      (!canonicalAxes.includes("height") &&
        preview.frame.height !== authored.height)
    ) {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "invalid",
        message: "BlankCanvas geometry preview changed an axis outside the resize handle.",
        nodeId: preview.nodeId,
      });
    }
    return preview;
  }
  const node = graph.getNode(preview.nodeId);
  if (!node) {
    return fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Container geometry preview target is not in the current tree.",
      nodeId: preview.nodeId,
    });
  }
  if (node.type !== "ContainerElement") {
    return fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Container geometry preview target is not a Container scope.",
      nodeId: preview.nodeId,
    });
  }
  const ownLayoutMode = resolveAtomicOwnLayoutMode(node.type, node.props);
  if (preview.kind === "free-container-resize" || preview.kind === "free-flow-container-resize") {
    if (ownLayoutMode !== "free") {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "unsupported",
        message: "Free container geometry preview requires a Free authority scope.",
        nodeId: preview.nodeId,
      });
    }
    const parent = graph.getParent(preview.nodeId);
    const parentMode = parent
      ? resolveAtomicOwnLayoutMode(parent.type, parent.props)
      : "root";
    const item = resolveAtomicLayoutItem(
      node.props.layoutItem as AtomicResponsiveLayoutItem | undefined,
      input.device
    );
    if (
      !parent ||
      (preview.kind === "free-flow-container-resize"
        ? parentMode !== "horizontal" && parentMode !== "vertical"
        : parentMode !== "free") ||
      item.widthMode !== "fixed" ||
      item.heightMode !== "fixed"
    ) {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "unsupported",
        message: "Free container geometry preview requires a fixed direct child of Free Layout.",
        nodeId: preview.nodeId,
      });
    }
    if (
      preview.frame.width < ATOMIC_FRAME_MIN_WIDTH ||
      preview.frame.height < ATOMIC_FRAME_MIN_HEIGHT
    ) {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "invalid",
        message: "Free container geometry preview must already satisfy shared minimum size.",
        nodeId: preview.nodeId,
      });
    }
    const authored = resolveNodeFrame(node, input.device, input.rootAllocation);
    if (preview.kind === "free-flow-container-resize" &&
        (preview.frame.x !== authored.x || preview.frame.y !== authored.y)) {
      fail({ code: "GEOMETRY_PREVIEW_INVALID", kind: "invalid",
        message: "Free flow resizing cannot take ownership of parent flow position.", nodeId: node.id });
    }
    if (
      preview.frame.zIndex !== authored.zIndex ||
      (!canonicalAxes.includes("width") &&
        (preview.frame.width !== authored.width || preview.frame.x !== authored.x)) ||
      (!canonicalAxes.includes("height") &&
        (preview.frame.height !== authored.height || preview.frame.y !== authored.y))
    ) {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "invalid",
        message: "Free container geometry preview changed geometry outside the resize handle.",
        nodeId: preview.nodeId,
      });
    }
    return preview;
  }
  if (ownLayoutMode !== "horizontal" && ownLayoutMode !== "vertical") {
    fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "unsupported",
      message: "Container geometry preview requires an H/V authority scope.",
      nodeId: preview.nodeId,
    });
  }
  const parent = graph.getParent(preview.nodeId);
  const parentMode = parent
    ? resolveAtomicOwnLayoutMode(parent.type, parent.props)
    : "root";
  const placementMatchesParentMode =
    parentMode === "horizontal" || parentMode === "vertical"
      ? preview.placement === "flow-child" ||
        preview.placement === "legacy-boundary"
      : parentMode === "free" || parentMode === "root"
      ? preview.placement === "island-root"
      : preview.placement === "legacy-boundary";
  if (!placementMatchesParentMode) {
    fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Container geometry preview placement diverged from the current parent.",
      nodeId: preview.nodeId,
    });
  }
  const authored = resolveNodeFrame(node, input.device, input.rootAllocation);
  if (
    preview.frame.zIndex !== authored.zIndex ||
    (!canonicalAxes.includes("width") && preview.frame.width !== authored.width) ||
    (!canonicalAxes.includes("height") && preview.frame.height !== authored.height) ||
    (preview.placement === "island-root"
      ? (!canonicalAxes.includes("width") && preview.frame.x !== authored.x) ||
        (!canonicalAxes.includes("height") && preview.frame.y !== authored.y)
      : preview.frame.x !== authored.x || preview.frame.y !== authored.y)
  ) {
    fail({
      code: "GEOMETRY_PREVIEW_INVALID",
      kind: "invalid",
      message: "Container geometry preview changed geometry outside the resize handle.",
      nodeId: preview.nodeId,
    });
  }
  return preview;
};

const compileTree = (input: AtomicLayoutTreeSolveInput): CompiledTree => {
  validateRootIdentity(input);
  const graph = projectAtomicDocumentGraph(input.document.data);
  if (graph.rootId !== input.rootElementId) {
    fail({
      code: "TOPOLOGY_STALE",
      kind: "stale",
      message: "Atomic layout tree graph root changed during projection.",
      nodeId: input.rootElementId,
    });
  }
  if (graph.size !== input.document.nodeCount) {
    fail({
      code: "TOPOLOGY_STALE",
      kind: "stale",
      message: "Atomic layout tree node count changed during projection.",
      nodeId: input.rootElementId,
    });
  }
  const root = graph.getNode(graph.rootId)!;
  if (root.type !== "BlankCanvas") {
    fail({
      code: "SCOPE_TYPE_UNSUPPORTED",
      kind: "unsupported",
      message: "Atomic layout tree requires a BlankCanvas root.",
      nodeId: root.id,
    });
  }
  const geometryPreview = validateGeometryPreview(input, graph);

  const nodes = new Map<string, CompiledNode>();
  for (const id of graph.preorderIds) {
    const graphNode = graph.getNode(id)!;
    const parent = graphNode.parentId ? graph.getParent(id) : null;
    const parentLayoutMode = parent
      ? resolveAtomicOwnLayoutMode(parent.type, parent.props)
      : "root";
    const fallback = {
      heightMode: resolveParentChildMode(parent?.props ?? null, "childHeightMode"),
      widthMode: resolveParentChildMode(parent?.props ?? null, "childWidthMode"),
    };
    const item =
      graphNode.type === "BlankCanvas"
        ? { detached: false, heightMode: "fixed" as const, widthMode: "fixed" as const }
        : resolveAtomicLayoutItem(
            graphNode.props.layoutItem as AtomicResponsiveLayoutItem | undefined,
            input.device,
            fallback
          );
    const gestureFixedAxes =
      geometryPreview?.nodeId === id
        ? Object.freeze([...geometryPreview.resizedAxes])
        : Object.freeze([] as AtomicLayoutAxis[]);
    nodes.set(
      id,
      Object.freeze({
        frame: resolveNodeFrame(
          graphNode,
          input.device,
          input.rootAllocation,
          geometryPreview
        ),
        gestureFixedAxes,
        graph: graphNode,
        heightMode: gestureFixedAxes.includes("height")
          ? "fixed"
          : item.heightMode,
        ownLayoutMode: resolveAtomicOwnLayoutMode(graphNode.type, graphNode.props),
        parentLayoutMode,
        widthMode: gestureFixedAxes.includes("width")
          ? "fixed"
          : item.widthMode,
      })
    );
  }

  const scopeOrder = graph.preorderIds.filter((id) => {
    const type = graph.getNode(id)!.type;
    return type === "BlankCanvas" || type === "ContainerElement";
  });
  const identity = freezeIdentity(input, graph, scopeOrder);
  const overridesByScope = input.overridesByScope ?? {};
  for (const scopeId of Object.keys(overridesByScope)) {
    const node = nodes.get(scopeId);
    if (!node || (node.graph.type !== "BlankCanvas" && node.graph.type !== "ContainerElement")) {
      fail({
        code: "OVERRIDE_SCOPE_INVALID",
        kind: "invalid",
        message: `Atomic layout tree override scope ${scopeId} is not in this topology.`,
        nodeId: scopeId,
      });
    }
  }

  const scopes = new Map<string, CompiledScope>();
  for (const scopeId of scopeOrder) {
    const node = nodes.get(scopeId)!;
    const mode =
      node.ownLayoutMode === "horizontal" || node.ownLayoutMode === "vertical"
        ? node.ownLayoutMode
        : null;
    let issue: ScopeIssue | null = null;
    let values: ReturnType<typeof resolveAtomicContainerLayoutValues> | null = null;
    if (!mode) {
      issue = unsupportedIssue("LAYOUT_MODE_UNSUPPORTED", scopeId);
    } else {
      if (node.graph.type !== "BlankCanvas") {
        const parent = graph.getParent(scopeId);
        const parentNode = parent ? nodes.get(parent.id)! : null;
        for (const axis of ["width", "height"] as const) {
          const ownMode = axis === "width" ? node.widthMode : node.heightMode;
          if (
            ownMode === "fill" &&
            node.parentLayoutMode !== "horizontal" &&
            node.parentLayoutMode !== "vertical"
          ) {
            issue = unsupportedIssue("SCOPE_FILL_UNSUPPORTED", scopeId);
            break;
          }
          const parentAxisFinite = parentNode
            ? (axis === "width" ? parentNode.widthMode : parentNode.heightMode) !== "hug"
            : false;
          const capability = resolveAtomicLayoutCapability({
            axis,
            detached: false,
            mode: ownMode,
            ownLayoutMode: node.ownLayoutMode,
            parentAxisFinite,
            parentLayout: node.parentLayoutMode,
            type: node.graph.type as PageFactComponentType,
          });
          if (!issue && capability.state === "illegal") {
            issue = unsupportedIssue(
              ownMode === "fill"
                ? "FILL_REQUIRES_FINITE_AXIS"
                : "SIZE_MODE_UNSUPPORTED",
              scopeId
            );
            break;
          }
        }
      }
      const ownIssue = inspectSimpleNode(node, input.device);
      issue = issue ?? ownIssue;
      if (!issue && node.graph.props.wrap !== undefined && node.graph.props.wrap !== false) {
        issue = unsupportedIssue("WRAP_UNSUPPORTED", scopeId);
      }
      if (
        !issue &&
        ((node.graph.props.alignItems !== undefined && node.graph.props.alignItems !== "start") ||
          (node.graph.props.justifyContent !== undefined && node.graph.props.justifyContent !== "start"))
      ) {
        issue = unsupportedIssue("ALIGNMENT_UNSUPPORTED", scopeId);
      }
      if (!issue && node.graph.props.shape !== undefined && node.graph.props.shape !== "rectangle") {
        issue = unsupportedIssue("TRANSFORM_UNSUPPORTED", scopeId);
      }
      inspectMetrics(node.graph.props, overridesByScope[scopeId], scopeId);
      values = resolveAtomicContainerLayoutValues({
        device: input.device,
        overrides: overridesByScope[scopeId],
        props: node.graph.props,
      });
      if (!issue && values.gapAnchorOffset !== 0) {
        issue = unsupportedIssue("GAP_ANCHOR_OFFSET_UNSUPPORTED", scopeId);
      }

      for (const childGraph of graph.getChildren(scopeId)) {
        if (issue) break;
        const child = nodes.get(childGraph.id)!;
        if (resolveAtomicLayoutItem(
          child.graph.props.layoutItem as AtomicResponsiveLayoutItem | undefined,
          input.device,
          {
            heightMode: resolveParentChildMode(node.graph.props, "childHeightMode"),
            widthMode: resolveParentChildMode(node.graph.props, "childWidthMode"),
          }
        ).detached) {
          issue = unsupportedIssue("DETACHED_UNSUPPORTED", child.graph.id);
          break;
        }
        issue = inspectSimpleNode(child, input.device);
        if (issue) break;
        for (const axis of ["width", "height"] as const) {
          const childMode = axis === "width" ? child.widthMode : child.heightMode;
          if (
            childMode === "hug" &&
            child.graph.type !== "TextBox" &&
            !(
              child.graph.type === "ContainerElement" &&
              (child.ownLayoutMode === "horizontal" ||
                child.ownLayoutMode === "vertical")
            )
          ) {
            issue = unsupportedIssue(
              "INTRINSIC_MEASUREMENT_UNSUPPORTED",
              child.graph.id
            );
            break;
          }
          const parentAxisFinite =
            (axis === "width" ? node.widthMode : node.heightMode) !== "hug";
          const capability = resolveAtomicLayoutCapability({
            axis,
            detached: false,
            mode: childMode,
            ownLayoutMode: child.ownLayoutMode,
            parentAxisFinite,
            parentLayout: mode,
            type: child.graph.type as PageFactComponentType,
          });
          if (childMode === "fill" && !parentAxisFinite) {
            issue = unsupportedIssue("FILL_REQUIRES_FINITE_AXIS", child.graph.id);
            break;
          }
          if (capability.state === "illegal") {
            issue = unsupportedIssue("SIZE_MODE_UNSUPPORTED", child.graph.id);
            break;
          }
        }
      }
      if (
        !issue &&
        ((node.widthMode === "fixed" &&
          values.padding.left + values.padding.right > node.frame.width) ||
          (node.heightMode === "fixed" &&
            values.padding.top + values.padding.bottom > node.frame.height))
      ) {
        fail({
          code: "PADDING_INVALID",
          kind: "invalid",
          message: `Atomic layout tree padding exceeds finite scope ${scopeId}.`,
          nodeId: scopeId,
        });
      }
    }
    if (Object.prototype.hasOwnProperty.call(overridesByScope, scopeId) && !mode) {
      fail({
        code: "OVERRIDE_SCOPE_INVALID",
        kind: "invalid",
        message: `Atomic layout tree cannot override legacy scope ${scopeId}.`,
        nodeId: scopeId,
      });
    }
    scopes.set(scopeId, Object.freeze({ issue, mode, node, values }));
  }

  const adjacency = new Map<string, Set<string>>(
    scopeOrder.map((scopeId) => [scopeId, new Set<string>()])
  );
  for (const scopeId of scopeOrder) {
    const scope = scopes.get(scopeId)!;
    if (!scope.mode) continue;
    for (const child of graph.getChildren(scopeId)) {
      if (child.type !== "ContainerElement" || !scopes.has(child.id)) continue;
      const childScope = scopes.get(child.id);
      if (!childScope?.mode) continue;
      const compiledChild = nodes.get(child.id)!;
      if (
        compiledChild.widthMode === "fixed" &&
        compiledChild.heightMode === "fixed"
      ) {
        continue;
      }
      adjacency.get(scopeId)!.add(child.id);
      adjacency.get(child.id)!.add(scopeId);
    }
  }

  const islandByScopeId = new Map<string, CompiledIsland>();
  const islands: CompiledIsland[] = [];
  const visited = new Set<string>();
  for (const startId of scopeOrder) {
    if (visited.has(startId)) continue;
    const stack = [startId];
    const scopeIds: string[] = [];
    while (stack.length > 0) {
      const scopeId = stack.pop()!;
      if (visited.has(scopeId)) continue;
      visited.add(scopeId);
      scopeIds.push(scopeId);
      for (const neighbor of adjacency.get(scopeId) ?? []) {
        if (!visited.has(neighbor)) stack.push(neighbor);
      }
    }
    scopeIds.sort((left, right) => scopeOrder.indexOf(left) - scopeOrder.indexOf(right));
    const firstIssue = scopeIds.map((id) => scopes.get(id)!.issue).find(Boolean) ?? null;
    const scopeSet = new Set(scopeIds);
    const boundaryScopeIds = scopeOrder.filter((candidateId) => {
      if (scopeSet.has(candidateId)) return false;
      const parent = graph.getParent(candidateId);
      const candidate = nodes.get(candidateId)!;
      const candidateScope = scopes.get(candidateId)!;
      return Boolean(
        parent &&
          scopeSet.has(parent.id) &&
          candidateScope.mode &&
          candidate.widthMode === "fixed" &&
          candidate.heightMode === "fixed"
      );
    });
    const island: CompiledIsland = Object.freeze({
      boundaryScopeIds: Object.freeze(boundaryScopeIds),
      disposition: firstIssue ? "legacy" : "accepted",
      id: `island:${scopeIds[0]}`,
      ...(firstIssue ? { legacyCode: firstIssue.code } : {}),
      scopeIds: Object.freeze(scopeIds),
    });
    islands.push(island);
    scopeIds.forEach((scopeId) => islandByScopeId.set(scopeId, island));
  }
  const partitionedScopeIds = islands.flatMap((island) => island.scopeIds);
  const partitionedScopeSet = new Set(partitionedScopeIds);
  if (
    partitionedScopeSet.size !== partitionedScopeIds.length ||
    partitionedScopeIds.length !== scopeOrder.length ||
    scopeOrder.some((scopeId) => !partitionedScopeSet.has(scopeId))
  ) {
    fail({
      code: "LAYOUT_TREE_NODE_SET_INVALID",
      kind: "invalid",
      message: "Atomic layout authority islands must exactly partition the ordered scope set.",
    });
  }
  const acceptedScopeIds = new Set(
    scopeOrder.filter((scopeId) => islandByScopeId.get(scopeId)?.disposition === "accepted")
  );
  if (geometryPreview) {
    const previewScopeAccepted = acceptedScopeIds.has(geometryPreview.nodeId);
    const previewParent = graph.getParent(geometryPreview.nodeId);
    const previewParentMode = previewParent
      ? resolveAtomicOwnLayoutMode(previewParent.type, previewParent.props)
      : "root";
    const expectedPlacement =
      geometryPreview.kind === "blank-canvas-resize"
        ? "blank-canvas-root"
        : previewParent && acceptedScopeIds.has(previewParent.id)
        ? "flow-child"
        : !previewParent || previewParentMode === "free"
        ? "island-root"
        : "legacy-boundary";
    const placementMatchesAcceptedPartition =
      geometryPreview.kind === "blank-canvas-resize" ||
      geometryPreview.kind === "free-container-resize" ||
      geometryPreview.kind === "free-flow-container-resize" ||
      geometryPreview.placement === expectedPlacement;
    const freePreviewAccepted =
      (geometryPreview.kind === "free-container-resize" ||
      geometryPreview.kind === "free-flow-container-resize" ||
        geometryPreview.kind === "blank-canvas-resize") &&
      resolveAtomicOwnLayoutMode(
        graph.getNode(geometryPreview.nodeId)!.type,
        graph.getNode(geometryPreview.nodeId)!.props
      ) === "free";
    if (
      (!previewScopeAccepted && !freePreviewAccepted) ||
      (!freePreviewAccepted && !placementMatchesAcceptedPartition)
    ) {
      fail({
        code: "GEOMETRY_PREVIEW_INVALID",
        kind: "unsupported",
        message: "Atomic layout geometry preview target is outside an accepted authority island.",
        nodeId: geometryPreview.nodeId,
      });
    }
  }
  return Object.freeze({
    acceptedScopeIds,
    ...(geometryPreview ? { geometryPreview } : {}),
    graph,
    identity,
    islandByScopeId,
    islands: Object.freeze(islands),
    nodes,
    rootAllocation: input.rootAllocation,
    scopes,
  });
};

const createMeasurementPlan = (
  compiled: CompiledTree,
  phase: "height" | "width",
  widthState?: AxisSolveState,
  dependsOnWidthKey?: string
): AtomicLayoutTreeMeasurementPlan => {
  const nodes: AtomicLayoutTreeMeasurementPlanNode[] = [];
  for (const scopeId of compiled.identity.scopeOrder) {
    if (!compiled.acceptedScopeIds.has(scopeId)) continue;
    const scope = compiled.scopes.get(scopeId)!;
    if (!scope.mode) continue;
    for (const child of compiled.graph.getChildren(scopeId)) {
      const node = compiled.nodes.get(child.id)!;
      const mode = phase === "width" ? node.widthMode : node.heightMode;
      if (mode !== "hug" || node.graph.type !== "TextBox") continue;
      const constraintWidth =
        phase === "height"
          ? widthState?.nodeSizes.get(node.graph.id) ??
            fail({
              code: "INTRINSIC_MEASUREMENT_DEPENDENCY_UNSUPPORTED",
              kind: "invalid",
              message: `Atomic layout tree has no final width for ${node.graph.id}.`,
              nodeId: node.graph.id,
            })
          : undefined;
      nodes.push(
        Object.freeze({
          axis: phase,
          ...(constraintWidth === undefined ? {} : { constraintWidth }),
          id: node.graph.id,
          ownerScopeId: scopeId,
          sourceSignature: resolveAtomicTextIntrinsicSourceSignature({
            device: compiled.identity.device,
            props: node.graph.props,
          }),
          text: typeof node.graph.props.text === "string" ? node.graph.props.text : "",
          type: "TextBox" as const,
        })
      );
    }
  }
  const phaseKey = browserAtomicFingerprintPort.fingerprint({
    dependsOnWidthKey: dependsOnWidthKey ?? null,
    identity: compiled.identity,
    nodes,
    phase,
  });
  return Object.freeze({
    ...(dependsOnWidthKey ? { dependsOnWidthKey } : {}),
    identity: compiled.identity,
    nodes: Object.freeze(nodes),
    phase,
    phaseKey,
  });
};

const validateMeasurementBatch = ({
  batch,
  plan,
}: {
  batch: AtomicLayoutTreeMeasurementBatch | undefined;
  plan: AtomicLayoutTreeMeasurementPlan;
}): ReadonlyMap<string, AtomicLayoutTreeMeasurementNode> => {
  if (!batch && plan.nodes.length === 0) return new Map();
  const resolvedBatch =
    batch ??
    fail({
      code: "INTRINSIC_MEASUREMENT_REQUIRED",
      kind: "invalid",
      message: `Atomic layout tree requires the complete ${plan.phase} measurement batch.`,
    });
  if (resolvedBatch.kind !== "dom-tree-intrinsic-v1") {
    fail({
      code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
      kind: "invalid",
      message: "Atomic layout tree measurement batch kind is unsupported.",
    });
  }
  if (resolvedBatch.phase !== plan.phase) {
    fail({
      code: "MEASUREMENT_PHASE_STALE",
      kind: "stale",
      message: `Atomic layout tree expected ${plan.phase} measurements.`,
    });
  }
  if (
    resolvedBatch.phaseKey !== plan.phaseKey ||
    resolvedBatch.dependsOnWidthKey !== plan.dependsOnWidthKey
  ) {
    fail({
      code: "MEASUREMENT_PHASE_STALE",
      kind: "stale",
      message: `Atomic layout tree ${plan.phase} measurement basis is stale.`,
    });
  }
  if (!sameTreeIdentity(resolvedBatch.identity, plan.identity)) {
    fail({
      code: "INTRINSIC_MEASUREMENT_IDENTITY_STALE",
      kind: "stale",
      message: "Atomic layout tree measurement identity is stale.",
    });
  }
  if (resolvedBatch.nodes.length !== plan.nodes.length) {
    fail({
      code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
      kind: "invalid",
      message: `Atomic layout tree ${plan.phase} measurement node set is not exact.`,
    });
  }
  const actualById = new Map<string, AtomicLayoutTreeMeasurementNode>();
  resolvedBatch.nodes.forEach((node) => {
    if (actualById.has(node.id)) {
      fail({
        code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
        kind: "invalid",
        message: `Atomic layout tree measurement node ${node.id} is duplicated.`,
        nodeId: node.id,
      });
    }
    actualById.set(node.id, node);
  });
  plan.nodes.forEach((expected, index) => {
    if (resolvedBatch.nodes[index]?.id !== expected.id) {
      fail({
        code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
        kind: "invalid",
        message: `Atomic layout tree measurement order diverged at ${expected.id}.`,
        nodeId: expected.id,
      });
    }
    const actual =
      actualById.get(expected.id) ??
      fail({
        code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
        kind: "invalid",
        message: `Atomic layout tree measurement node ${expected.id} is missing.`,
        nodeId: expected.id,
      });
    if (
      actual.axis !== expected.axis ||
      actual.ownerScopeId !== expected.ownerScopeId ||
      actual.type !== expected.type
    ) {
      fail({
        code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
        kind: "invalid",
        message: `Atomic layout tree measurement node ${expected.id} has the wrong owner or phase.`,
        nodeId: expected.id,
      });
    }
    if (actual.sourceSignature !== expected.sourceSignature) {
      fail({
        code: "INTRINSIC_SOURCE_STALE",
        kind: "stale",
        message: `Atomic layout tree measurement source ${expected.id} is stale.`,
        nodeId: expected.id,
      });
    }
    if (!finiteNonNegative(actual.value)) {
      fail({
        code: "INTRINSIC_MEASUREMENT_INVALID",
        kind: "invalid",
        message: `Atomic layout tree measurement ${expected.id}.${expected.axis} is invalid.`,
        nodeId: expected.id,
      });
    }
    if (expected.constraintWidth === undefined) {
      if (actual.constraintWidth !== undefined) {
        fail({
          code: "INTRINSIC_MEASUREMENT_NODE_SET_INVALID",
          kind: "invalid",
          message: `Atomic layout tree measurement ${expected.id} has an unexpected width constraint.`,
          nodeId: expected.id,
        });
      }
    } else if (
      !finiteNonNegative(actual.constraintWidth) ||
      actual.constraintWidth !== expected.constraintWidth
    ) {
      fail({
        code: "INTRINSIC_CONSTRAINT_STALE",
        kind: "stale",
        message: `Atomic layout tree measurement constraint ${expected.id} is stale.`,
        nodeId: expected.id,
      });
    }
  });
  return actualById;
};

const solveAxis = ({
  axis,
  compiled,
  measurements,
}: {
  axis: AtomicLayoutAxis;
  compiled: CompiledTree;
  measurements: ReadonlyMap<string, AtomicLayoutTreeMeasurementNode>;
}): AxisSolveState => {
  const nodeSizes = new Map<string, number>();
  const scopeStates = new Map<string, AxisScopeState>();
  const visiting = new Set<string>();

  const solveScope = (scopeId: string, allocatedSize?: number): AxisScopeState => {
    const memoized = scopeStates.get(scopeId);
    if (memoized) {
      if (allocatedSize !== undefined && Math.abs(memoized.size - allocatedSize) > 0.01) {
        fail({
          code: "TOPOLOGY_STALE",
          kind: "stale",
          message: `Atomic layout tree scope ${scopeId} received conflicting ${axis} allocations.`,
          nodeId: scopeId,
        });
      }
      return memoized;
    }
    if (visiting.has(scopeId)) {
      fail({
        code: "LAYOUT_DEPENDENCY_CYCLE",
        kind: "invalid",
        message: `Atomic layout tree ${axis} dependency cycle reaches ${scopeId}.`,
        nodeId: scopeId,
      });
    }
    visiting.add(scopeId);
    const scopeCandidate = compiled.scopes.get(scopeId);
    if (
      !scopeCandidate?.mode ||
      !scopeCandidate.values ||
      !compiled.acceptedScopeIds.has(scopeId)
    ) {
      return fail({
        code: "LAYOUT_TREE_NODE_SET_INVALID",
        kind: "invalid",
        message: `Atomic layout tree cannot solve legacy scope ${scopeId}.`,
        nodeId: scopeId,
      });
    }
    const scope = scopeCandidate as CompiledScope & {
      mode: FlowMode;
      values: NonNullable<CompiledScope["values"]>;
    };
    const scopeMode = axis === "width" ? scope.node.widthMode : scope.node.heightMode;
    const paddingStart =
      axis === "width" ? scope.values.padding.left : scope.values.padding.top;
    const paddingEnd =
      axis === "width" ? scope.values.padding.right : scope.values.padding.bottom;
    const mainAxis =
      (axis === "width" && scope.mode === "horizontal") ||
      (axis === "height" && scope.mode === "vertical");
    const gap = scope.mode === "horizontal" ? scope.values.columnGap : scope.values.rowGap;
    const children = compiled.graph.getChildren(scopeId).map((child) => compiled.nodes.get(child.id)!);

    const intrinsicChildSize = (child: CompiledNode): number => {
      const mode = axis === "width" ? child.widthMode : child.heightMode;
      if (mode === "fixed") return child.frame[axis];
      if (mode === "fill") {
        return fail({
          code: "FILL_REQUIRES_FINITE_AXIS",
          kind: "unsupported",
          message: `Atomic layout tree cannot intrinsically resolve Fill child ${child.graph.id}.`,
          nodeId: child.graph.id,
        });
      }
      if (child.graph.type === "TextBox") {
        const measurement = measurements.get(child.graph.id);
        if (!measurement || measurement.axis !== axis) {
          return fail({
            code: "INTRINSIC_MEASUREMENT_REQUIRED",
            kind: "invalid",
            message: `Atomic layout tree requires ${child.graph.id}.${axis}.`,
            nodeId: child.graph.id,
          });
        }
        return measurement.value;
      }
      if (
        child.graph.type === "ContainerElement" &&
        compiled.acceptedScopeIds.has(child.graph.id)
      ) {
        return solveScope(child.graph.id).size;
      }
      return fail({
        code: "INTRINSIC_MEASUREMENT_UNSUPPORTED",
        kind: "unsupported",
        message: `Atomic layout tree cannot derive ${child.graph.type} ${axis}.`,
        nodeId: child.graph.id,
      });
    };

    let scopeSize: number;
    if (scope.node.graph.type === "BlankCanvas") {
      scopeSize = scope.node.frame[axis];
    } else if (scopeMode === "fixed") {
      scopeSize = scope.node.frame[axis];
    } else if (scopeMode === "fill") {
      if (!finiteNonNegative(allocatedSize)) {
        return fail({
          code: "FILL_REQUIRES_FINITE_AXIS",
          kind: "invalid",
          message: `Atomic layout tree scope Fill ${scopeId}.${axis} has no parent allocation.`,
          nodeId: scopeId,
        });
      }
      scopeSize = Number(allocatedSize);
    } else {
      const nonFill = children.map((child) => intrinsicChildSize(child));
      const gapTotal = Math.max(0, children.length - 1) * gap;
      const intrinsicContent = mainAxis
        ? nonFill.reduce((sum, value) => sum + value, 0) + gapTotal
        : Math.max(0, ...nonFill);
      scopeSize = Math.max(96, paddingStart + intrinsicContent + paddingEnd);
    }
    if (!finiteNonNegative(scopeSize)) {
      fail({
        code: "FRAME_INVALID",
        kind: "invalid",
        message: `Atomic layout tree scope ${scopeId}.${axis} is invalid.`,
        nodeId: scopeId,
      });
    }
    if (scopeSize + 0.01 < paddingStart + paddingEnd) {
      fail({
        code: "PADDING_INVALID",
        kind: "invalid",
        message: `Atomic layout tree padding exceeds ${scopeId}.${axis}.`,
        nodeId: scopeId,
      });
    }
    nodeSizes.set(scopeId, scopeSize);
    const contentSize = Math.max(0, scopeSize - paddingStart - paddingEnd);
    const knownSizes = children.map((child) => {
      const mode = axis === "width" ? child.widthMode : child.heightMode;
      return mode === "fill" ? null : intrinsicChildSize(child);
    });
    const fillCount = knownSizes.filter((value) => value === null).length;
    const gapTotal = Math.max(0, children.length - 1) * gap;
    const finiteRemainder = mainAxis
      ? Math.max(
          0,
          contentSize -
            gapTotal -
            knownSizes.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        ) / Math.max(1, fillCount)
      : contentSize;
    const childSizes = new Map<string, number>();
    const childPositions = new Map<string, number>();
    let cursor = paddingStart;
    children.forEach((child, index) => {
      const mode = axis === "width" ? child.widthMode : child.heightMode;
      const size = mode === "fill" ? finiteRemainder : Number(knownSizes[index]);
      childSizes.set(child.graph.id, size);
      childPositions.set(child.graph.id, mainAxis ? cursor : paddingStart);
      nodeSizes.set(child.graph.id, size);
      if (mainAxis) cursor += size + gap;
      if (
        child.graph.type === "ContainerElement" &&
        compiled.acceptedScopeIds.has(child.graph.id)
      ) {
        if (mode === "fill") solveScope(child.graph.id, size);
        else if (mode === "fixed") solveScope(child.graph.id, size);
        else solveScope(child.graph.id);
      }
    });
    const state = Object.freeze({
      childPositions,
      childSizes,
      contentSize,
      size: scopeSize,
    });
    scopeStates.set(scopeId, state);
    visiting.delete(scopeId);
    return state;
  };

  const dependencyParent = (scopeId: string) => {
    const parent = compiled.graph.getParent(scopeId);
    if (!parent || !compiled.acceptedScopeIds.has(parent.id)) return null;
    const scopeNode = compiled.nodes.get(scopeId)!;
    const connected =
      scopeNode.widthMode !== "fixed" || scopeNode.heightMode !== "fixed";
    return compiled.scopes.get(parent.id)?.mode && connected ? parent.id : null;
  };
  for (const island of compiled.islands) {
    if (island.disposition !== "accepted") continue;
    const roots = island.scopeIds.filter((scopeId) => {
      const parentId = dependencyParent(scopeId);
      return parentId === null || !island.scopeIds.includes(parentId);
    });
    if (roots.length !== 1) {
      fail({
        code: "LAYOUT_DEPENDENCY_CYCLE",
        kind: "invalid",
        message: `Atomic layout authority ${island.id} has ${roots.length} roots.`,
      });
    }
    solveScope(roots[0]);
  }
  return Object.freeze({ nodeSizes, scopes: scopeStates });
};

const freezePaddingBands = ({
  height,
  padding,
  width,
}: {
  height: number;
  padding: { bottom: number; left: number; right: number; top: number };
  width: number;
}): readonly AtomicResolvedLayoutPaddingBand[] => {
  const middleHeight = Math.max(0, height - padding.top - padding.bottom);
  return Object.freeze([
    Object.freeze({
      box: frozenRect(0, 0, width, padding.top),
      metric: "paddingTop" as const,
      value: padding.top,
    }),
    Object.freeze({
      box: frozenRect(width - padding.right, padding.top, padding.right, middleHeight),
      metric: "paddingRight" as const,
      value: padding.right,
    }),
    Object.freeze({
      box: frozenRect(0, height - padding.bottom, width, padding.bottom),
      metric: "paddingBottom" as const,
      value: padding.bottom,
    }),
    Object.freeze({
      box: frozenRect(0, padding.top, padding.left, middleHeight),
      metric: "paddingLeft" as const,
      value: padding.left,
    }),
  ]);
};

const axisOwner = (
  node: CompiledNode,
  axis: AtomicLayoutAxis
): AtomicResolvedLayoutAxisOwner => {
  if (node.gestureFixedAxes.includes(axis)) return "gesture-fixed-preview";
  const mode = axis === "width" ? node.widthMode : node.heightMode;
  if (mode === "fill") return "parent-flow-fill";
  if (mode === "hug") {
    return node.graph.type === "ContainerElement"
      ? "derived-container-hug"
      : "intrinsic-text";
  }
  return "authored-fixed";
};

const buildScopeLayout = ({
  compiled,
  heightState,
  scopeId,
  widthState,
}: {
  compiled: CompiledTree;
  heightState: AxisSolveState;
  scopeId: string;
  widthState: AxisSolveState;
}): AtomicResolvedLayout => {
  const scope = compiled.scopes.get(scopeId)!;
  const width = widthState.scopes.get(scopeId)!;
  const height = heightState.scopes.get(scopeId)!;
  const values = scope.values!;
  const mode = scope.mode!;
  const graphChildren = compiled.graph.getChildren(scopeId);
  const children: AtomicResolvedLayoutChild[] = graphChildren.map((child, index) => {
    const node = compiled.nodes.get(child.id)!;
    return Object.freeze({
      box: frozenRect(
        width.childPositions.get(child.id)!,
        height.childPositions.get(child.id)!,
        width.childSizes.get(child.id)!,
        height.childSizes.get(child.id)!
      ),
      heightOwner: axisOwner(node, "height"),
      id: child.id,
      index,
      participation: "flow" as const,
      widthOwner: axisOwner(node, "width"),
    });
  });
  const mainGap = mode === "horizontal" ? values.columnGap : values.rowGap;
  const crossStart = mode === "horizontal" ? values.padding.top : values.padding.left;
  const crossExtent = Math.max(
    0,
    ...children.map(({ box }) => (mode === "horizontal" ? box.height : box.width))
  );
  const crossLimit =
    mode === "horizontal"
      ? height.size - values.padding.bottom
      : width.size - values.padding.right;
  const crossEnd = Math.min(crossLimit, crossStart + crossExtent);
  const gapBands: AtomicResolvedLayoutGapBand[] = children.slice(1).map((child, index) => {
    const previous = children[index];
    return Object.freeze({
      axis: mode === "horizontal" ? ("x" as const) : ("y" as const),
      crossEnd,
      crossStart,
      end: mode === "horizontal" ? child.box.x : child.box.y,
      index,
      metric: mode === "horizontal" ? ("columnGap" as const) : ("rowGap" as const),
      start:
        mode === "horizontal"
          ? previous.box.x + previous.box.width
          : previous.box.y + previous.box.height,
      value: mainGap,
    });
  });
  return Object.freeze({
    children: Object.freeze(children),
    containerBox: frozenRect(0, 0, width.size, height.size),
    contentBox: frozenRect(
      values.padding.left,
      values.padding.top,
      width.contentSize,
      height.contentSize
    ),
    gapBands: Object.freeze(gapBands),
    identity: Object.freeze({
      device: compiled.identity.device,
      measurementFrameId: compiled.identity.measurementFrameId,
      pointer: compiled.identity.pointer,
      scopeId,
    }),
    mode,
    order: Object.freeze(children.map((child) => child.id)),
    padding: Object.freeze({ ...values.padding }),
    paddingBands: freezePaddingBands({
      height: height.size,
      padding: values.padding,
      width: width.size,
    }),
  });
};

const buildAcceptedResult = ({
  compiled,
  heightState,
  solveKey,
  widthState,
}: {
  compiled: CompiledTree;
  heightState: AxisSolveState;
  solveKey: string;
  widthState: AxisSolveState;
}): AtomicLayoutTreeSolveResult => {
  const acceptedScopeOrder = compiled.identity.scopeOrder
    .filter((scopeId) => compiled.acceptedScopeIds.has(scopeId))
  const layoutByScopeId = new Map(
    acceptedScopeOrder.map((scopeId) => [
      scopeId,
      buildScopeLayout({ compiled, heightState, scopeId, widthState }),
    ])
  );
  const scopes: AtomicLayoutTreeScopeReceipt[] = acceptedScopeOrder.map(
    (scopeId) => {
      const node = compiled.nodes.get(scopeId)!;
      const layout = layoutByScopeId.get(scopeId)!;
      const parent = compiled.graph.getParent(scopeId);
      const parentLayout = parent ? layoutByScopeId.get(parent.id) : undefined;
      const parentMode = parent
        ? resolveAtomicOwnLayoutMode(parent.type, parent.props)
        : "root";
      const outerPositionOwner =
        node.graph.type === "BlankCanvas"
          ? "root"
          : parentLayout
          ? "resolved-parent-flow"
          : parentMode === "free"
          ? "authored-free"
          : "unowned-legacy-parent";
      const outerBox =
        parentLayout?.children.find((child) => child.id === scopeId)?.box ??
        frozenRect(
          node.graph.type === "BlankCanvas" ? 0 : node.frame.x,
          node.graph.type === "BlankCanvas" ? 0 : node.frame.y,
          layout.containerBox.width,
          layout.containerBox.height
        );
      return Object.freeze({
        heightOwner: axisOwner(node, "height"),
        islandId: compiled.islandByScopeId.get(scopeId)!.id,
        layout,
        outerBox,
        outerPositionOwner,
        scopeId,
        widthOwner: axisOwner(node, "width"),
      });
    }
  );
  const scopeById = new Map(scopes.map((scope) => [scope.scopeId, scope]));
  for (const parent of scopes) {
    parent.layout.children.forEach((child) => {
      const nested = scopeById.get(child.id);
      if (!nested) return;
      if (
        canonicalAtomicJson(child.box) !== canonicalAtomicJson(nested.outerBox) ||
        Math.abs(child.box.width - nested.layout.containerBox.width) > 0.01 ||
        Math.abs(child.box.height - nested.layout.containerBox.height) > 0.01
      ) {
        fail({
          code: "LAYOUT_TREE_NODE_SET_INVALID",
          kind: "invalid",
          message: `Atomic layout tree parent/child receipt diverged for ${child.id}.`,
          nodeId: child.id,
        });
      }
    });
  }
  const islands: AtomicLayoutAuthorityIslandReceipt[] = compiled.islands.map((island) =>
    Object.freeze({
      boundaryScopeIds: island.boundaryScopeIds,
      disposition: island.disposition,
      id: island.id,
      ...(island.legacyCode ? { legacyCode: island.legacyCode } : {}),
      scopeIds: island.scopeIds,
    })
  );
  const activeAxisWrites: AtomicLayoutTreeAxisWrite[] = [];
  scopes.forEach((scopeReceipt) => {
    const scope = compiled.scopes.get(scopeReceipt.scopeId)!;
    scopeReceipt.layout.children.forEach((child) => {
      const node = compiled.nodes.get(child.id)!;
      (["width", "height"] as const).forEach((axis) => {
        const owner = axisOwner(node, axis);
        if (owner === "authored-fixed" || owner === "gesture-fixed-preview") return;
        activeAxisWrites.push(
          Object.freeze({
            axis,
            nodeId: child.id,
            owner,
            sourceScopeId: scopeReceipt.scopeId,
            target: "flow-child" as const,
            value: child.box[axis],
          })
        );
      });
    });
    if (scope.node.graph.type === "BlankCanvas") return;
    const parent = compiled.graph.getParent(scopeReceipt.scopeId);
    const parentOwnsOuter = Boolean(
      parent &&
        compiled.acceptedScopeIds.has(parent.id) &&
        compiled.scopes.get(parent.id)?.mode
    );
    if (parentOwnsOuter) return;
    (["width", "height"] as const).forEach((axis) => {
      const owner = axisOwner(scope.node, axis);
      if (owner === "authored-fixed" || owner === "gesture-fixed-preview") return;
      activeAxisWrites.push(
        Object.freeze({
          axis,
          nodeId: scopeReceipt.scopeId,
          owner,
          sourceScopeId: compiled.identity.rootElementId,
          target: "island-root" as const,
          value: scopeReceipt.outerBox[axis],
        })
      );
    });
  });
  const writerKeys = new Set<string>();
  activeAxisWrites.forEach((write) => {
    const key = `${write.nodeId}:${write.axis}`;
    if (writerKeys.has(key)) {
      fail({
        code: "CSS_WRITER_CONFLICT",
        kind: "invalid",
        message: `Atomic layout tree has duplicate derived writer ${key}.`,
        nodeId: write.nodeId,
      });
    }
    writerKeys.add(key);
  });
  const stagedGestureHandoffs: AtomicLayoutTreeGestureHandoffWrite[] = [];
  const preview = compiled.geometryPreview;
  if (
    preview &&
    preview.kind !== "free-container-resize" &&
    preview.kind !== "free-flow-container-resize" &&
    scopeById.has(preview.nodeId)
  ) {
    const previewScope = scopeById.get(preview.nodeId)!;
    const parent = compiled.graph.getParent(preview.nodeId);
    const parentScope = parent ? scopeById.get(parent.id) : undefined;
    preview.resizedAxes.forEach((axis) => {
      const placement =
        preview.kind === "blank-canvas-resize"
          ? "blank-canvas-root"
          : preview.placement;
      const sourceScopeId =
        placement === "flow-child" ? parent!.id : preview.nodeId;
      const value =
        placement === "flow-child"
          ? parentScope!.layout.children.find(({ id }) => id === preview.nodeId)!
              .box[axis]
          : previewScope.outerBox[axis];
      const base = {
        generation: preview.generation,
        geometryPreviewKey: compiled.identity.geometryPreviewKey,
        kind: "gesture-axis-handoff" as const,
        nodeId: preview.nodeId,
        sequence: preview.sequence,
        sessionId: preview.sessionId,
        sourceScopeId,
        value,
      };
      const handoff: AtomicLayoutTreeGestureHandoffWrite =
        placement === "flow-child"
          ? Object.freeze({ ...base, axis, placement })
          : placement === "legacy-boundary"
          ? Object.freeze({ ...base, axis, placement })
          : placement === "blank-canvas-root"
          ? axis === "width"
            ? Object.freeze({
                ...base,
                axis,
                coupledOrigin: Object.freeze({
                  property: "offsetX" as const,
                  value: preview.kind === "blank-canvas-resize"
                    ? preview.frame.offsetX
                    : 0,
                }),
                placement,
              })
            : Object.freeze({ ...base, axis, placement })
          : axis === "width"
          ? Object.freeze({
              ...base,
              axis,
              coupledOrigin: Object.freeze({
                property: "x" as const,
                value: preview.kind === "container-resize" ? preview.frame.x : 0,
              }),
              placement,
            })
          : Object.freeze({
              ...base,
              axis,
              coupledOrigin: Object.freeze({
                property: "y" as const,
                value: preview.kind === "container-resize" ? preview.frame.y : 0,
              }),
              placement,
            });
      stagedGestureHandoffs.push(handoff);
    });
  }
  const stagedKeys = new Set<string>();
  const stagedOriginKeys = new Set<string>();
  stagedGestureHandoffs.forEach((write) => {
    const key = `${write.nodeId}:${write.axis}`;
    if (stagedKeys.has(key) || writerKeys.has(key)) {
      fail({
        code: "CSS_WRITER_CONFLICT",
        kind: "invalid",
        message: `Atomic layout tree has an active/staged writer conflict for ${key}.`,
        nodeId: write.nodeId,
      });
    }
    stagedKeys.add(key);
    if (write.coupledOrigin) {
      const originKey = `${write.nodeId}:${write.coupledOrigin.property}`;
      if (stagedOriginKeys.has(originKey)) {
        fail({
          code: "CSS_WRITER_CONFLICT",
          kind: "invalid",
          message: `Atomic layout tree has duplicate staged origin ${originKey}.`,
          nodeId: write.nodeId,
        });
      }
      stagedOriginKeys.add(originKey);
    }
  });
  compiled.islands.forEach((island) => {
    island.boundaryScopeIds.forEach((scopeId) => {
      const boundary = compiled.nodes.get(scopeId);
      if (
        !boundary ||
        boundary.widthMode !== "fixed" ||
        boundary.heightMode !== "fixed" ||
        writerKeys.has(`${scopeId}:width`) ||
        writerKeys.has(`${scopeId}:height`)
      ) {
        fail({
          code: "CSS_WRITER_CONFLICT",
          kind: "invalid",
          message: `Atomic layout boundary ${scopeId} must remain fixed and writer-free.`,
          nodeId: scopeId,
        });
      }
    });
  });
  if (
    stagedGestureHandoffs.length !==
      (preview && scopeById.has(preview.nodeId) ? preview.resizedAxes.length : 0) ||
    stagedGestureHandoffs.some(
      (write) =>
        !preview ||
        write.nodeId !== preview.nodeId ||
        !preview.resizedAxes.includes(write.axis) ||
        write.sessionId !== preview.sessionId ||
        write.sequence !== preview.sequence ||
        write.generation !== preview.generation ||
        write.geometryPreviewKey !== compiled.identity.geometryPreviewKey ||
        (write.placement === "flow-child" && write.coupledOrigin !== undefined) ||
        (write.placement === "legacy-boundary" &&
          write.coupledOrigin !== undefined) ||
        (write.placement === "blank-canvas-root" &&
          write.axis === "width" &&
          (write.coupledOrigin?.property !== "offsetX" ||
            write.coupledOrigin.value !==
              (preview.kind === "blank-canvas-resize"
                ? preview.frame.offsetX
                : Number.NaN))) ||
        (write.placement === "blank-canvas-root" &&
          write.axis === "height" &&
          write.coupledOrigin !== undefined) ||
        (write.placement === "island-root" &&
          (preview.kind !== "container-resize" ||
            write.coupledOrigin?.property !==
              (write.axis === "width" ? "x" : "y") ||
            write.coupledOrigin.value !==
              (write.axis === "width" ? preview.frame.x : preview.frame.y)))
    )
  ) {
    fail({
      code: "CSS_WRITER_CONFLICT",
      kind: "invalid",
      message: "Atomic layout tree staged gesture handoff is not exact.",
      nodeId: preview?.nodeId,
    });
  }
  let freeConstraintPreview: AtomicFreeConstraintTreeReceipt | undefined;
  if (
    preview &&
    resolveAtomicOwnLayoutMode(
      compiled.graph.getNode(preview.nodeId)!.type,
      compiled.graph.getNode(preview.nodeId)!.props
    ) === "free"
  ) {
    const trigger = compiled.graph.getNode(preview.nodeId)!;
    const beforeParent =
      trigger.type === "BlankCanvas"
        ? resolveBlankCanvasFrame(
            trigger.props,
            compiled.identity.device,
            compiled.rootAllocation
          )
        : resolveAtomicResponsiveFrame(
            trigger.props.frame as AtomicResponsiveLayoutFrame,
            compiled.identity.device
          );
    const afterParent =
      preview.kind === "blank-canvas-resize"
        ? Object.freeze({
            height: preview.frame.height,
            width: preview.frame.width,
            x: 0,
            y: 0,
            zIndex: 0,
          })
        : preview.frame;
    freeConstraintPreview = resolveAtomicFreeConstraintTreePreview({
      afterParent,
      beforeParent,
      device: compiled.identity.device,
      graph: compiled.graph,
      identity: compiled.identity,
      triggerNodeId: preview.nodeId,
    });
  }
  const treeReceiptId = browserAtomicFingerprintPort.fingerprint({
    activeAxisWrites,
    freeConstraintPreview: freeConstraintPreview ?? null,
    identity: compiled.identity,
    islands,
    solveKey,
    stagedGestureHandoffs,
    scopes,
  });
  return Object.freeze({
    kind: "accepted" as const,
    receipt: Object.freeze({
      activeAxisWrites: Object.freeze(activeAxisWrites),
      ...(freeConstraintPreview ? { freeConstraintPreview } : {}),
      identity: compiled.identity,
      islands: Object.freeze(islands),
      kind: "atomic-layout-tree-v1" as const,
      solveKey,
      stagedGestureHandoffs: Object.freeze(stagedGestureHandoffs),
      scopes: Object.freeze(scopes),
      treeReceiptId,
    }),
  });
};

/**
 * K4-B2 pure root transaction. The caller may invoke it at most three times:
 * first for a width plan, then for a constrained-height plan, then for one
 * immutable tree receipt. Every continuation revalidates the complete tree
 * identity; no mutable solver state or DOM geometry crosses this boundary.
 */
export const solveAtomicLayoutTree = (
  input: AtomicLayoutTreeSolveInput
): AtomicLayoutTreeSolveResult => {
  const compiled = compileTree(input);
  const widthPlan = createMeasurementPlan(compiled, "width");
  if (widthPlan.nodes.length > 0 && !input.measurements?.width) {
    if (input.measurements?.height) {
      fail({
        code: "MEASUREMENT_PHASE_STALE",
        kind: "stale",
        message: "Atomic layout tree cannot accept height measurements before width.",
      });
    }
    return Object.freeze({ identity: compiled.identity, kind: "measurement-required" as const, plan: widthPlan });
  }
  const widthMeasurements = validateMeasurementBatch({
    batch: input.measurements?.width,
    plan: widthPlan,
  });
  const widthState = solveAxis({ axis: "width", compiled, measurements: widthMeasurements });
  const widthBasisKey = browserAtomicFingerprintPort.fingerprint({
    identity: compiled.identity,
    measurementNodes: input.measurements?.width?.nodes ?? [],
    resolvedWidths: compiled.identity.nodeOrder.map((id) => [
      id,
      widthState.nodeSizes.get(id) ?? null,
    ]),
  });
  const heightPlan = createMeasurementPlan(
    compiled,
    "height",
    widthState,
    widthBasisKey
  );
  if (heightPlan.nodes.length > 0 && !input.measurements?.height) {
    return Object.freeze({ identity: compiled.identity, kind: "measurement-required" as const, plan: heightPlan });
  }
  const heightMeasurements = validateMeasurementBatch({
    batch: input.measurements?.height,
    plan: heightPlan,
  });
  const heightState = solveAxis({ axis: "height", compiled, measurements: heightMeasurements });
  const solveKey = browserAtomicFingerprintPort.fingerprint({
    heightMeasurements: input.measurements?.height?.nodes ?? [],
    identity: compiled.identity,
    resolvedHeights: compiled.identity.nodeOrder.map((id) => [
      id,
      heightState.nodeSizes.get(id) ?? null,
    ]),
    widthBasisKey,
  });
  return buildAcceptedResult({ compiled, heightState, solveKey, widthState });
};
