import type {
  AtomicDocumentPointer,
  AtomicDocumentSnapshot,
} from "./atomic-document-version";
import type {
  AtomicContainerLayoutPadding,
  AtomicLayoutDevice,
  AtomicLayoutFrame,
} from "./atomic-layout-authored-values";
import type {
  AtomicHorizontalConstraint,
  AtomicVerticalConstraint,
} from "./atomic-constraints";

export type AtomicLayoutMode = "horizontal" | "vertical";

export type AtomicLayoutRect = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
}>;

export type AtomicLayoutIdentity = Readonly<{
  device: AtomicLayoutDevice;
  measurementFrameId: number;
  pointer: AtomicDocumentPointer;
  scopeId: string;
}>;

export type AtomicLayoutExpectedIdentity = AtomicLayoutIdentity;

export type AtomicLayoutIntrinsicAxis = "height" | "width";

export type AtomicLayoutIntrinsicMeasurementPlanNode = Readonly<{
  axes: readonly AtomicLayoutIntrinsicAxis[];
  constraintWidth?: number;
  id: string;
  sourceSignature: string;
  text: string;
  type: "TextBox";
}>;

export type AtomicLayoutIntrinsicMeasurementPlan = Readonly<{
  identity: AtomicLayoutIdentity;
  nodes: readonly AtomicLayoutIntrinsicMeasurementPlanNode[];
}>;

export type AtomicLayoutIntrinsicMeasurementNode = Readonly<{
  constraintWidth?: number;
  height?: number;
  id: string;
  sourceSignature: string;
  type: "TextBox";
  width?: number;
}>;

export type AtomicLayoutIntrinsicMeasurementBatch = Readonly<{
  identity: AtomicLayoutIdentity;
  kind: "dom-intrinsic-v1";
  nodes: readonly AtomicLayoutIntrinsicMeasurementNode[];
}>;

export type AtomicLayoutIntrinsicMeasurements =
  | Readonly<{ kind: "none" }>
  | AtomicLayoutIntrinsicMeasurementBatch;

export type AtomicLayoutEphemeralOverrides = Readonly<
  Partial<{
    columnGap: number;
    gapAnchorOffset: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    rowGap: number;
  }>
>;

export type AtomicLayoutSolveInput = Readonly<{
  device: AtomicLayoutDevice;
  document: AtomicDocumentSnapshot<unknown>;
  expected: AtomicLayoutExpectedIdentity;
  intrinsicMeasurements: AtomicLayoutIntrinsicMeasurements;
  measurementFrameId: number;
  overrides?: AtomicLayoutEphemeralOverrides;
  scopeId: string;
}>;

export type AtomicResolvedLayoutChild = Readonly<{
  box: AtomicLayoutRect;
  heightOwner: AtomicResolvedLayoutAxisOwner;
  id: string;
  index: number;
  participation: "flow";
  widthOwner: AtomicResolvedLayoutAxisOwner;
}>;

export type AtomicResolvedLayoutAxisOwner =
  | "authored-fixed"
  | "derived-container-hug"
  | "gesture-fixed-preview"
  | "intrinsic-text"
  | "parent-flow-fill";

export type AtomicLayoutTreeGeometryPreviewRequest =
  | Readonly<{
      frame: Readonly<{ height: number; offsetX: number; width: number }>;
      kind: "blank-canvas-resize";
      nodeId: string;
      resizedAxes: readonly AtomicLayoutIntrinsicAxis[];
      sequence: number;
      sessionId: string;
    }>
  | Readonly<{
      frame: AtomicLayoutFrame;
      kind: "container-resize";
      nodeId: string;
      placement: "flow-child" | "island-root" | "legacy-boundary";
      resizedAxes: readonly AtomicLayoutIntrinsicAxis[];
      sequence: number;
      sessionId: string;
    }>
  | Readonly<{
      frame: AtomicLayoutFrame;
      kind: "free-container-resize";
      nodeId: string;
      resizedAxes: readonly AtomicLayoutIntrinsicAxis[];
      sequence: number;
      sessionId: string;
    }>
  | Readonly<{
      frame: AtomicLayoutFrame;
      kind: "free-flow-container-resize";
      nodeId: string;
      resizedAxes: readonly AtomicLayoutIntrinsicAxis[];
      sequence: number;
      sessionId: string;
    }>;

export type AtomicLayoutTreeGeometryPreview =
  | Readonly<
      Extract<
        AtomicLayoutTreeGeometryPreviewRequest,
        { kind: "blank-canvas-resize" }
      > & { generation: number }
    >
  | Readonly<
      Extract<
        AtomicLayoutTreeGeometryPreviewRequest,
        { kind: "container-resize" }
      > & { generation: number }
    >
  | Readonly<
      Extract<
        AtomicLayoutTreeGeometryPreviewRequest,
        { kind: "free-container-resize" }
      > & { generation: number }
    >
  | Readonly<
      Extract<AtomicLayoutTreeGeometryPreviewRequest, { kind: "free-flow-container-resize" }> & { generation: number }
    >;

export type AtomicFreeConstraintFrameWrite = Readonly<{
  afterFrame: AtomicLayoutFrame;
  beforeFrame: AtomicLayoutFrame;
  clampedAxes: readonly AtomicLayoutIntrinsicAxis[];
  depth: number;
  horizontal: AtomicHorizontalConstraint;
  nodeId: string;
  parentId: string;
  vertical: AtomicVerticalConstraint;
}>;

export type AtomicFreeConstraintScopeReceipt = Readonly<{
  afterBox: AtomicLayoutRect;
  beforeBox: AtomicLayoutRect;
  directChildIds: readonly string[];
  scopeId: string;
}>;

export type AtomicFreeConstraintTreeReceipt = Readonly<{
  constraintReceiptId: string;
  identity: AtomicLayoutTreeIdentity;
  kind: "atomic-free-constraints-v1";
  scopes: readonly AtomicFreeConstraintScopeReceipt[];
  triggerNodeId: string;
  writes: readonly AtomicFreeConstraintFrameWrite[];
}>;

export type AtomicLayoutTreeRootAllocation = Readonly<{
  frameId: number;
  hostInlineSize: number;
  kind: "finite-inline-v1";
  source: "editor-device-host" | "published-containing-block";
}>;

export type AtomicLayoutTreeExpectedIdentity = Readonly<{
  authorityKey: string;
  device: AtomicLayoutDevice;
  generation: number;
  geometryPreviewKey: string;
  measurementFrameId: number;
  pointer: AtomicDocumentPointer;
  rootAllocationKey: string;
  rootElementId: string;
  runtimeEpoch: number;
}>;

export type AtomicLayoutTreeIdentity = AtomicLayoutTreeExpectedIdentity &
  Readonly<{
    nodeOrder: readonly string[];
    scopeOrder: readonly string[];
    topologyFingerprint: string;
  }>;

export type AtomicLayoutTreeOverridesByScope = Readonly<
  Record<string, AtomicLayoutEphemeralOverrides>
>;

export type AtomicLayoutTreeMeasurementPhase = "height" | "width";

export type AtomicLayoutTreeMeasurementPlanNode = Readonly<{
  axis: AtomicLayoutIntrinsicAxis;
  constraintWidth?: number;
  id: string;
  ownerScopeId: string;
  sourceSignature: string;
  text: string;
  type: "TextBox";
}>;

export type AtomicLayoutTreeMeasurementPlan = Readonly<{
  dependsOnWidthKey?: string;
  identity: AtomicLayoutTreeIdentity;
  nodes: readonly AtomicLayoutTreeMeasurementPlanNode[];
  phase: AtomicLayoutTreeMeasurementPhase;
  phaseKey: string;
}>;

export type AtomicLayoutTreeMeasurementNode = Readonly<{
  axis: AtomicLayoutIntrinsicAxis;
  constraintWidth?: number;
  id: string;
  ownerScopeId: string;
  sourceSignature: string;
  type: "TextBox";
  value: number;
}>;

export type AtomicLayoutTreeMeasurementBatch = Readonly<{
  dependsOnWidthKey?: string;
  identity: AtomicLayoutTreeIdentity;
  kind: "dom-tree-intrinsic-v1";
  nodes: readonly AtomicLayoutTreeMeasurementNode[];
  phase: AtomicLayoutTreeMeasurementPhase;
  phaseKey: string;
}>;

export type AtomicLayoutTreeMeasurements = Readonly<{
  height?: AtomicLayoutTreeMeasurementBatch;
  width?: AtomicLayoutTreeMeasurementBatch;
}>;

export type AtomicLayoutTreeSolveInput = Readonly<{
  authorityKey: string;
  device: AtomicLayoutDevice;
  document: AtomicDocumentSnapshot<unknown>;
  expected: AtomicLayoutTreeExpectedIdentity;
  generation: number;
  geometryPreview?: AtomicLayoutTreeGeometryPreview;
  measurementFrameId: number;
  measurements?: AtomicLayoutTreeMeasurements;
  overridesByScope?: AtomicLayoutTreeOverridesByScope;
  rootAllocation: AtomicLayoutTreeRootAllocation;
  rootElementId: string;
  runtimeEpoch: number;
}>;

export type AtomicLayoutAuthorityIslandReceipt = Readonly<{
  boundaryScopeIds: readonly string[];
  disposition: "accepted" | "legacy";
  id: string;
  legacyCode?: AtomicLayoutErrorCode;
  scopeIds: readonly string[];
}>;

export type AtomicLayoutTreeScopeReceipt = Readonly<{
  heightOwner: AtomicResolvedLayoutAxisOwner;
  islandId: string;
  layout: AtomicResolvedLayout;
  outerBox: AtomicLayoutRect;
  outerPositionOwner:
    | "authored-free"
    | "resolved-parent-flow"
    | "root"
    | "unowned-legacy-parent";
  scopeId: string;
  widthOwner: AtomicResolvedLayoutAxisOwner;
}>;

export type AtomicLayoutTreeAxisWrite = Readonly<{
  axis: AtomicLayoutIntrinsicAxis;
  nodeId: string;
  owner: Exclude<AtomicResolvedLayoutAxisOwner, "authored-fixed">;
  sourceScopeId: string;
  target: "flow-child" | "island-root";
  value: number;
}>;

type AtomicLayoutTreeGestureHandoffBase = Readonly<{
  axis: AtomicLayoutIntrinsicAxis;
  generation: number;
  geometryPreviewKey: string;
  kind: "gesture-axis-handoff";
  nodeId: string;
  sequence: number;
  sessionId: string;
  sourceScopeId: string;
  value: number;
}>;

export type AtomicLayoutTreeGestureHandoffWrite =
  | (AtomicLayoutTreeGestureHandoffBase &
      Readonly<{
        coupledOrigin?: never;
        placement: "flow-child";
      }>)
  | (AtomicLayoutTreeGestureHandoffBase &
      Readonly<{
        axis: "width";
        coupledOrigin: Readonly<{ property: "offsetX"; value: number }>;
        placement: "blank-canvas-root";
      }>)
  | (AtomicLayoutTreeGestureHandoffBase &
      Readonly<{
        axis: "height";
        coupledOrigin?: never;
        placement: "blank-canvas-root";
      }>)
  | (AtomicLayoutTreeGestureHandoffBase &
      Readonly<{
        axis: "width";
        coupledOrigin: Readonly<{ property: "x"; value: number }>;
        placement: "island-root";
      }>)
  | (AtomicLayoutTreeGestureHandoffBase &
      Readonly<{
        axis: "height";
        coupledOrigin: Readonly<{ property: "y"; value: number }>;
        placement: "island-root";
      }>)
  | (AtomicLayoutTreeGestureHandoffBase &
      Readonly<{
        coupledOrigin?: never;
        placement: "legacy-boundary";
      }>);

export type AtomicLayoutTreeReceipt = Readonly<{
  activeAxisWrites: readonly AtomicLayoutTreeAxisWrite[];
  freeConstraintPreview?: AtomicFreeConstraintTreeReceipt;
  identity: AtomicLayoutTreeIdentity;
  islands: readonly AtomicLayoutAuthorityIslandReceipt[];
  kind: "atomic-layout-tree-v1";
  solveKey: string;
  stagedGestureHandoffs: readonly AtomicLayoutTreeGestureHandoffWrite[];
  scopes: readonly AtomicLayoutTreeScopeReceipt[];
  treeReceiptId: string;
}>;

export type AtomicLayoutTreeSolveResult =
  | Readonly<{
      identity: AtomicLayoutTreeIdentity;
      kind: "measurement-required";
      plan: AtomicLayoutTreeMeasurementPlan;
    }>
  | Readonly<{
      kind: "accepted";
      receipt: AtomicLayoutTreeReceipt;
    }>;

export type AtomicResolvedLayoutGapBand = Readonly<{
  axis: "x" | "y";
  crossEnd: number;
  crossStart: number;
  end: number;
  index: number;
  metric: "columnGap" | "rowGap";
  start: number;
  value: number;
}>;

export type AtomicResolvedLayoutPaddingBand = Readonly<{
  box: AtomicLayoutRect;
  metric: "paddingTop" | "paddingRight" | "paddingBottom" | "paddingLeft";
  value: number;
}>;

export type AtomicResolvedLayout = Readonly<{
  children: readonly AtomicResolvedLayoutChild[];
  containerBox: AtomicLayoutRect;
  contentBox: AtomicLayoutRect;
  gapBands: readonly AtomicResolvedLayoutGapBand[];
  identity: AtomicLayoutIdentity;
  mode: AtomicLayoutMode;
  order: readonly string[];
  padding: AtomicContainerLayoutPadding;
  paddingBands: readonly AtomicResolvedLayoutPaddingBand[];
}>;

export type AtomicLayoutErrorKind = "invalid" | "stale" | "unsupported";

export type AtomicLayoutErrorCode =
  | "DOCUMENT_AUTHORITY_UNAVAILABLE"
  | "DOCUMENT_POINTER_STALE"
  | "DEVICE_STALE"
  | "MEASUREMENT_FRAME_STALE"
  | "MEASUREMENT_FRAME_INVALID"
  | "ROOT_SCOPE_STALE"
  | "ROOT_ALLOCATION_INVALID"
  | "ROOT_ALLOCATION_STALE"
  | "RUNTIME_EPOCH_STALE"
  | "TREE_GENERATION_STALE"
  | "TOPOLOGY_STALE"
  | "GEOMETRY_PREVIEW_INVALID"
  | "GEOMETRY_PREVIEW_STALE"
  | "GEOMETRY_PREVIEW_COMMIT_STALE"
  | "OVERRIDE_SCOPE_INVALID"
  | "LAYOUT_DEPENDENCY_CYCLE"
  | "MEASUREMENT_PHASE_STALE"
  | "LAYOUT_TREE_NODE_SET_INVALID"
  | "CSS_WRITER_CONFLICT"
  | "SCOPE_NOT_FOUND"
  | "SCOPE_TYPE_UNSUPPORTED"
  | "LAYOUT_MODE_UNSUPPORTED"
  | "SIZE_MODE_UNSUPPORTED"
  | "SCOPE_FILL_UNSUPPORTED"
  | "FILL_REQUIRES_FINITE_AXIS"
  | "NESTED_HUG_UNSUPPORTED"
  | "WRAP_UNSUPPORTED"
  | "ALIGNMENT_UNSUPPORTED"
  | "GAP_ANCHOR_OFFSET_UNSUPPORTED"
  | "DETACHED_UNSUPPORTED"
  | "HIDDEN_CHILD_UNSUPPORTED"
  | "TRANSFORM_UNSUPPORTED"
  | "BORDER_UNSUPPORTED"
  | "INTRINSIC_MEASUREMENT_UNSUPPORTED"
  | "INTRINSIC_MEASUREMENT_REQUIRED"
  | "INTRINSIC_MEASUREMENT_IDENTITY_STALE"
  | "INTRINSIC_MEASUREMENT_NODE_SET_INVALID"
  | "INTRINSIC_MEASUREMENT_INVALID"
  | "INTRINSIC_MEASUREMENT_DEPENDENCY_UNSUPPORTED"
  | "INTRINSIC_FONT_PENDING"
  | "INTRINSIC_EDITING_ACTIVE"
  | "INTRINSIC_SOURCE_STALE"
  | "INTRINSIC_CONSTRAINT_STALE"
  | "RENDERER_IDENTITY_STALE"
  | "RENDERER_NODE_SET_STALE"
  | "RENDERER_TRANSACTION_FAILED"
  | "FRAME_INVALID"
  | "PADDING_INVALID"
  | "GAP_INVALID";

export class AtomicLayoutContractError extends Error {
  readonly code: AtomicLayoutErrorCode;
  readonly kind: AtomicLayoutErrorKind;
  readonly nodeId?: string;

  constructor({
    code,
    kind,
    message,
    nodeId,
  }: {
    code: AtomicLayoutErrorCode;
    kind: AtomicLayoutErrorKind;
    message: string;
    nodeId?: string;
  }) {
    super(message);
    this.name = "AtomicLayoutContractError";
    this.code = code;
    this.kind = kind;
    this.nodeId = nodeId;
  }
}
