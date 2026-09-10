import {
  getExplicitAtomicLayoutItemSizeMode,
  resolveAtomicLayoutItem,
  resolveAtomicResponsiveFrame,
} from "../blocks/editor-kernel/atomic-layout-authored-values";

export const FREE_CANVAS_SELECT_EVENT = "puck-free-canvas-select";
export const FREE_CANVAS_COMMIT_EVENT = "puck-free-canvas-commit";
export const FREE_CANVAS_PREVIEW_EVENT = "puck-free-canvas-preview";
export const FREE_CANVAS_ACTION_EVENT = "puck-free-canvas-action";
export const FREE_CANVAS_RENAME_EVENT = "puck-free-canvas-rename";
export const FREE_CANVAS_DRAWER_DROP_EVENT = "puck-free-canvas-drawer-drop";
export const FREE_CANVAS_DRAWER_CLICK_EVENT = "puck-free-canvas-drawer-click";
export const FREE_CANVAS_TEMPLATE_INSERT_EVENT =
  "puck-free-canvas-template-insert";
export const FREE_CANVAS_REPARENT_EVENT = "puck-free-canvas-reparent";
export const FREE_CANVAS_REPARENT_PREVIEW_EVENT =
  "puck-free-canvas-reparent-preview";
export const CONTAINER_LAYOUT_METRIC_FOCUS_EVENT =
  "puck-container-layout-metric-focus";

export type FreeCanvasDevice = "desktop" | "tablet" | "mobile";

/** Short-lived creation intent. `assetId` must never be copied into page Props. */
export type FreeCanvasTemplateInsertDetail = {
  assetId: string;
  canvasId?: string;
  destinationIndex?: number;
  framePatch?: Pick<CanvasFrame, "height" | "width" | "x" | "y">;
};

export type FreeCanvasReparentPreviewDetail = {
  componentId: string;
  destinationCanvasId: string;
  destinationIndex: number;
} | null;

export type CanvasFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
};

export type ResponsiveCanvasFrame = {
  desktop: CanvasFrame;
  tablet?: Partial<CanvasFrame>;
  mobile?: Partial<CanvasFrame>;
};

export type CanvasTransform = {
  flipHorizontal: boolean;
  flipVertical: boolean;
  rotation: number;
};

export type ResponsiveCanvasTransform = {
  desktop: CanvasTransform;
  tablet?: Partial<CanvasTransform>;
  mobile?: Partial<CanvasTransform>;
};

export type AutoLayoutItemSizeMode = "fixed" | "hug" | "fill";

export type AutoLayoutItemValue = {
  /** Keep the item on the free-positioning layer without changing the parent mode. */
  detached?: boolean;
  /** Grid-only 1-based column start. Zero keeps legacy automatic placement. */
  columnStart?: number;
  /** Grid-only span. Values are clamped by the renderer and Inspector. */
  columnSpan?: number;
  /** Grid-only 1-based row start. Zero keeps legacy automatic placement. */
  rowStart?: number;
  rowSpan?: number;
  widthMode?: AutoLayoutItemSizeMode;
  heightMode?: AutoLayoutItemSizeMode;
};

type ResponsiveAutoLayoutItemValue = Omit<AutoLayoutItemValue, "detached">;

/** Per-child contract owned by the child while its parent owns flow layout. */
export type AutoLayoutItem = AutoLayoutItemValue & {
  tablet?: Partial<ResponsiveAutoLayoutItemValue>;
  mobile?: Partial<ResponsiveAutoLayoutItemValue>;
};

export type AutoLayoutGridMetricItem = {
  frame?: ResponsiveCanvasFrame;
  layoutItem?: AutoLayoutItem;
};

export type AutoLayoutGridPlacement = {
  columnSpan: number;
  columnStart: number;
  index: number;
  rowSpan: number;
  rowStart: number;
};

/**
 * Resolve CSS Grid's row-wise placement into a persistent occupancy map.
 * Fully explicit items reserve their cells first; legacy automatic items then
 * keep source order and use the first legal position. This mirrors
 * `grid-auto-flow: row dense` and backfills a legal hole before adding rows.
 */
export const resolveAutoLayoutGridPlacements = ({
  columns,
  device,
  items,
}: {
  columns: number;
  device: FreeCanvasDevice;
  items: AutoLayoutGridMetricItem[];
}): AutoLayoutGridPlacement[] => {
  const columnCount = Math.max(1, Math.min(12, Math.round(columns) || 1));
  const occupied: boolean[][] = [];
  const placements: Array<AutoLayoutGridPlacement | undefined> = Array(
    items.length
  );
  const normalized = items.map((item, index) => {
    const layout = resolveAutoLayoutItem(item.layoutItem, device);
    return {
      columnSpan: Math.max(1, Math.min(columnCount, layout.columnSpan)),
      columnStart: layout.columnStart,
      detached: layout.detached,
      index,
      rowSpan: Math.max(1, layout.rowSpan),
      rowStart: layout.rowStart,
    };
  });
  const canPlace = (
    row: number,
    column: number,
    rowSpan: number,
    columnSpan: number
  ) => {
    if (row < 0 || column < 0 || column + columnSpan > columnCount) {
      return false;
    }
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      const occupiedRow = occupied[row + rowOffset] ?? [];
      for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
        if (occupiedRow[column + columnOffset]) return false;
      }
    }
    return true;
  };
  const occupy = (
    row: number,
    column: number,
    rowSpan: number,
    columnSpan: number
  ) => {
    for (let rowOffset = 0; rowOffset < rowSpan; rowOffset += 1) {
      const occupiedRow = occupied[row + rowOffset] ?? [];
      occupied[row + rowOffset] = occupiedRow;
      for (let columnOffset = 0; columnOffset < columnSpan; columnOffset += 1) {
        occupiedRow[column + columnOffset] = true;
      }
    }
  };

  normalized.forEach((item) => {
    if (item.detached || item.columnStart < 1 || item.rowStart < 1) return;
    const row = item.rowStart - 1;
    const column = item.columnStart - 1;
    if (!canPlace(row, column, item.rowSpan, item.columnSpan)) return;
    occupy(row, column, item.rowSpan, item.columnSpan);
    placements[item.index] = {
      columnSpan: item.columnSpan,
      columnStart: column + 1,
      index: item.index,
      rowSpan: item.rowSpan,
      rowStart: row + 1,
    };
  });

  normalized.forEach((item) => {
    if (item.detached || placements[item.index]) return;
    for (let position = 0; ; position += 1) {
      const row = Math.floor(position / columnCount);
      const column = position % columnCount;
      if (!canPlace(row, column, item.rowSpan, item.columnSpan)) continue;
      occupy(row, column, item.rowSpan, item.columnSpan);
      placements[item.index] = {
        columnSpan: item.columnSpan,
        columnStart: column + 1,
        index: item.index,
        rowSpan: item.rowSpan,
        rowStart: row + 1,
      };
      break;
    }
  });

  return placements.filter((placement): placement is AutoLayoutGridPlacement =>
    Boolean(placement)
  );
};

/** Resolve the minimum grid height from actual responsive spans and frames. */
export const getAutoLayoutGridContentMetrics = ({
  columns,
  device,
  gap,
  items,
  paddingY,
}: {
  columns: number;
  device: FreeCanvasDevice;
  gap: number;
  items: AutoLayoutGridMetricItem[];
  paddingY: number;
}) => {
  const columnCount = Math.max(1, Math.min(12, Math.round(columns) || 1));
  const resolvedGap = Math.max(0, Number(gap) || 0);
  const flowItems = items.flatMap((item) => {
    const layout = resolveAutoLayoutItem(item.layoutItem, device);
    if (layout.detached || !item.frame) return [];
    const frame = resolveCanvasFrame(item.frame, device);
    const columnSpan = Math.max(1, Math.min(columnCount, layout.columnSpan));
    const rowSpan = Math.max(1, layout.rowSpan);
    return [{ columnSpan, frame, layoutItem: item.layoutItem, rowSpan }];
  });
  const rowHeight = Math.max(
    0,
    ...flowItems.map(({ frame, rowSpan }) =>
      Math.max(
        0,
        (frame.height - Math.max(0, rowSpan - 1) * resolvedGap) / rowSpan
      )
    )
  );
  if (flowItems.length === 0) {
    return {
      height: Math.max(96, Math.max(0, paddingY) * 2),
      rowHeight,
      rows: 0,
    };
  }
  const placements = resolveAutoLayoutGridPlacements({
    columns: columnCount,
    device,
    items: flowItems.map(({ layoutItem }) => ({ layoutItem })),
  });
  const rows = placements.reduce(
    (maximum, placement) =>
      Math.max(maximum, placement.rowStart - 1 + placement.rowSpan),
    0
  );
  return {
    height:
      rows * rowHeight +
      Math.max(0, rows - 1) * resolvedGap +
      Math.max(0, paddingY) * 2,
    rowHeight,
    rows,
  };
};

export const getExplicitAutoLayoutItemSizeMode = (
  item: AutoLayoutItem | undefined,
  device: FreeCanvasDevice,
  field: "widthMode" | "heightMode"
): AutoLayoutItemSizeMode | undefined =>
  getExplicitAtomicLayoutItemSizeMode(item, device, field);

export const resolveAutoLayoutItem = (
  item: AutoLayoutItem | undefined,
  device: FreeCanvasDevice,
  fallback?: Partial<AutoLayoutItemValue>
): Required<AutoLayoutItemValue> =>
  resolveAtomicLayoutItem(item, device, fallback);

export const applyAutoLayoutItemPatch = (
  item: AutoLayoutItem | undefined,
  device: FreeCanvasDevice,
  patch: Partial<AutoLayoutItemValue>
): AutoLayoutItem => {
  const current = item ?? {};
  const { detached, ...responsivePatch } = patch;
  const withDetached =
    detached === undefined ? current : { ...current, detached };
  const mergeDefined = <T extends Record<string, unknown>>(
    source: T,
    next: Record<string, unknown>
  ) => {
    const merged = { ...source, ...next };
    Object.entries(next).forEach(([key, value]) => {
      if (value === undefined) delete merged[key as keyof typeof merged];
    });
    return merged;
  };
  if (device === "desktop") {
    return mergeDefined(withDetached, responsivePatch) as AutoLayoutItem;
  }
  const responsive = mergeDefined(
    current[device] ?? {},
    responsivePatch
  ) as Partial<ResponsiveAutoLayoutItemValue>;
  const next = { ...withDetached };
  if (Object.keys(responsive).length > 0) next[device] = responsive;
  else delete next[device];
  return next;
};

export const DEFAULT_CANVAS_TRANSFORM: CanvasTransform = {
  flipHorizontal: false,
  flipVertical: false,
  rotation: 0,
};

export type FreeCanvasGuide = {
  axis: "horizontal" | "vertical";
  end: number;
  kind: "center" | "edge";
  position: number;
  source: "canvas" | "element";
  start: number;
  targetId?: string;
};

export type FreeCanvasProjection = {
  axis: "horizontal" | "vertical";
  end: number;
  kind: "canvas-center" | "canvas-edge" | "element-center" | "element-edge";
  position: number;
  start: number;
  targetId?: string;
};

export type FreeCanvasMeasurement = {
  axis: "horizontal" | "vertical";
  fromX: number;
  fromY: number;
  label: string;
  toX: number;
  toY: number;
};

export type FreeCanvasSelectDetail = {
  componentId: string;
};

export type FreeCanvasActionDetail = {
  action: "delete" | "duplicate" | "sendBackward" | "bringForward";
  componentId: string;
  device: FreeCanvasDevice;
};

export type FreeCanvasRenameDetail = {
  componentId: string;
  editorName: string | null;
};

export type FreeCanvasCommitDetail = {
  atomicLayoutCommitRef?: string;
  componentId: string;
  device: FreeCanvasDevice;
  frame?: CanvasFrame;
  framePatch?: Partial<CanvasFrame>;
  patch?: Record<string, unknown>;
  resizeHandle?: "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
  snapEvidenceRef?: string;
  source?: "canvas" | "inspector";
};

export type FreeCanvasDrawerDropDetail = {
  canvasId: string;
  componentType:
    | "TextBox"
    | "ImageElement"
    | "VideoElement"
    | "ButtonElement"
    | "DividerElement"
    | "TabBarElement"
    | "ContainerElement"
    | "CardContainerElement"
    | "ShapeElement"
    | "IconElement"
    | "CardElement";
  device: FreeCanvasDevice;
  destinationIndex?: number;
  existingComponentIds: string[];
  existingPageComponentIds?: string[];
  framePatch: Pick<CanvasFrame, "height" | "width" | "x" | "y">;
};

export type FreeCanvasReparentDetail = {
  componentId: string;
  destinationCanvasId: string;
  destinationIndex: number;
  device: FreeCanvasDevice;
  framePatch: Pick<CanvasFrame, "height" | "width" | "x" | "y">;
  reparentPermitRef: string;
};

export type FreeCanvasPreviewDetail = {
  activeFrame?: CanvasFrame;
  canvasId: string;
  guides: FreeCanvasGuide[];
  measurements: FreeCanvasMeasurement[];
  mode: "move" | "selection";
  projections: FreeCanvasProjection[];
};

export const resolveCanvasFrame = (
  frame: ResponsiveCanvasFrame,
  device: FreeCanvasDevice
): CanvasFrame => resolveAtomicResponsiveFrame(frame, device);

export const resolveCanvasTransform = (
  transform: ResponsiveCanvasTransform | undefined,
  device: FreeCanvasDevice
): CanvasTransform => {
  const desktop = {
    ...DEFAULT_CANVAS_TRANSFORM,
    ...(transform?.desktop ?? {}),
  };
  if (device === "desktop") return desktop;
  const tablet = { ...desktop, ...(transform?.tablet ?? {}) };
  if (device === "tablet") return tablet;
  return { ...tablet, ...(transform?.mobile ?? {}) };
};

const canvasFrameKeys = ["x", "y", "width", "height", "zIndex"] as const;

export const diffCanvasFrames = (
  start: CanvasFrame,
  end: CanvasFrame
): Partial<CanvasFrame> =>
  Object.fromEntries(
    canvasFrameKeys
      .filter((key) => start[key] !== end[key])
      .map((key) => [key, end[key]])
  ) as Partial<CanvasFrame>;

export const applyCanvasFramePatch = (
  frame: ResponsiveCanvasFrame,
  device: FreeCanvasDevice,
  patch: Partial<CanvasFrame>
): ResponsiveCanvasFrame => {
  if (device === "desktop") {
    return { ...frame, desktop: { ...frame.desktop, ...patch } };
  }

  const inherited = resolveCanvasFrame(
    frame,
    device === "mobile" ? "tablet" : "desktop"
  );
  const override = { ...(frame[device] ?? {}) };
  canvasFrameKeys.forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    if (value === inherited[key]) delete override[key];
    else override[key] = value;
  });

  if (Object.keys(override).length > 0) {
    return { ...frame, [device]: override };
  }
  const next = { ...frame };
  Reflect.deleteProperty(next, device);
  return next;
};

const canvasTransformKeys = [
  "flipHorizontal",
  "flipVertical",
  "rotation",
] as const;

export const applyCanvasTransformPatch = (
  transform: ResponsiveCanvasTransform | undefined,
  device: FreeCanvasDevice,
  patch: Partial<CanvasTransform>
): ResponsiveCanvasTransform => {
  const current: ResponsiveCanvasTransform = transform?.desktop
    ? transform
    : { desktop: { ...DEFAULT_CANVAS_TRANSFORM } };
  if (device === "desktop") {
    return {
      ...current,
      desktop: { ...DEFAULT_CANVAS_TRANSFORM, ...current.desktop, ...patch },
    };
  }

  const inherited = resolveCanvasTransform(
    current,
    device === "mobile" ? "tablet" : "desktop"
  );
  const override = { ...(current[device] ?? {}) };
  const mutableOverride = override as Record<string, number | boolean>;
  canvasTransformKeys.forEach((key) => {
    const value = patch[key];
    if (value === undefined) return;
    if (value === inherited[key]) delete mutableOverride[key];
    else mutableOverride[key] = value;
  });

  if (Object.keys(override).length > 0) {
    return { ...current, [device]: override };
  }
  const next = { ...current };
  Reflect.deleteProperty(next, device);
  return next;
};

export const emitFreeCanvasSelect = (componentId: string) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasSelectDetail>(FREE_CANVAS_SELECT_EVENT, {
      detail: { componentId },
    })
  );

export const emitFreeCanvasCommit = (detail: FreeCanvasCommitDetail) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasCommitDetail>(FREE_CANVAS_COMMIT_EVENT, {
      cancelable: true,
      detail,
    })
  );

export const emitFreeCanvasPreview = (detail: FreeCanvasPreviewDetail) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasPreviewDetail>(FREE_CANVAS_PREVIEW_EVENT, {
      detail,
    })
  );

export const emitFreeCanvasAction = (detail: FreeCanvasActionDetail) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasActionDetail>(FREE_CANVAS_ACTION_EVENT, {
      detail,
    })
  );

export const emitFreeCanvasRename = (detail: FreeCanvasRenameDetail) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasRenameDetail>(FREE_CANVAS_RENAME_EVENT, {
      detail,
    })
  );

export const emitFreeCanvasDrawerDrop = (detail: FreeCanvasDrawerDropDetail) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasDrawerDropDetail>(FREE_CANVAS_DRAWER_DROP_EVENT, {
      detail,
    })
  );

export const emitFreeCanvasReparent = (detail: FreeCanvasReparentDetail) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasReparentDetail>(FREE_CANVAS_REPARENT_EVENT, {
      detail,
    })
  );

export const emitFreeCanvasReparentPreview = (
  detail: FreeCanvasReparentPreviewDetail
) =>
  window.dispatchEvent(
    new CustomEvent<FreeCanvasReparentPreviewDetail>(
      FREE_CANVAS_REPARENT_PREVIEW_EVENT,
      { detail }
    )
  );
