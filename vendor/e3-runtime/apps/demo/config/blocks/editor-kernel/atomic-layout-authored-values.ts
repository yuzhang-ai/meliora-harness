import {
  clampFreeCanvasHeight,
  FREE_CANVAS_MIN_WIDTH,
  getFreeCanvasMaxWidth,
} from "../FreeCanvas/constraints";

export type AtomicLayoutDevice = "desktop" | "tablet" | "mobile";

export type AtomicLayoutFrame = Readonly<{
  height: number;
  width: number;
  x: number;
  y: number;
  zIndex: number;
}>;

export type AtomicResponsiveLayoutFrame = Readonly<{
  desktop: AtomicLayoutFrame;
  tablet?: Partial<AtomicLayoutFrame>;
  mobile?: Partial<AtomicLayoutFrame>;
}>;

export type AtomicLayoutSizeMode = "fixed" | "hug" | "fill";

export type AtomicLayoutItemValue = Readonly<{
  detached?: boolean;
  columnStart?: number;
  columnSpan?: number;
  rowStart?: number;
  rowSpan?: number;
  widthMode?: AtomicLayoutSizeMode;
  heightMode?: AtomicLayoutSizeMode;
}>;

type AtomicResponsiveLayoutItemValue = Omit<AtomicLayoutItemValue, "detached">;

export type AtomicResponsiveLayoutItem = AtomicLayoutItemValue &
  Readonly<{
    tablet?: Partial<AtomicResponsiveLayoutItemValue>;
    mobile?: Partial<AtomicResponsiveLayoutItemValue>;
  }>;

export type AtomicContainerLayoutPadding = Readonly<{
  bottom: number;
  left: number;
  right: number;
  top: number;
}>;

export type AtomicContainerLayoutValues = Readonly<{
  columnGap: number;
  gapAnchorOffset: number;
  padding: AtomicContainerLayoutPadding;
  rowGap: number;
}>;

export type AtomicBlankCanvasPreferredViewport = Readonly<{
  height: number;
  offsetX: number;
  width: number;
}>;

export type AtomicBlankCanvasViewport = AtomicBlankCanvasPreferredViewport;

type UnknownRecord = Readonly<Record<string, unknown>>;

const finiteNumber = (value: unknown, fallback = 0) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

const paddingMetric = (value: unknown, fallback = 0) =>
  Math.max(0, finiteNumber(value, fallback));

const gapMetric = (value: unknown, fallback = 0) =>
  Math.max(-240, Math.min(240, finiteNumber(value, fallback)));

const clampBlankCanvasWidth = (value: unknown) =>
  Math.round(
    Math.min(
      Math.max(
        typeof value === "number" && Number.isFinite(value)
          ? value
          : FREE_CANVAS_MIN_WIDTH,
        FREE_CANVAS_MIN_WIDTH
      ),
      getFreeCanvasMaxWidth("desktop")
    )
  );

const clampBlankCanvasHeight = (value: unknown) =>
  clampFreeCanvasHeight(
    typeof value === "number" && Number.isFinite(value) ? value : 64
  );

const deviceField = (device: AtomicLayoutDevice, field: string): string =>
  device === "desktop"
    ? field
    : `${device}${field[0]?.toUpperCase() ?? ""}${field.slice(1)}`;

/**
 * Pure BlankCanvas viewport resolver shared by the K4-B2 tree transaction and
 * (during the runtime cutover) the existing CSS painter. Tablet and mobile
 * independently inherit the resolved desktop viewport, matching the current
 * BlankCanvas CSS-variable painter rather than Container responsive fallback.
 */
export const resolveAtomicBlankCanvasPreferredViewport = ({
  device,
  props,
  transient,
}: {
  device: AtomicLayoutDevice;
  props: UnknownRecord;
  transient?: Partial<AtomicBlankCanvasViewport>;
}): AtomicBlankCanvasViewport => {
  const responsive =
    props.responsiveSize &&
    typeof props.responsiveSize === "object" &&
    !Array.isArray(props.responsiveSize)
      ? (props.responsiveSize as UnknownRecord)
      : {};
  const tablet =
    responsive.tablet &&
    typeof responsive.tablet === "object" &&
    !Array.isArray(responsive.tablet)
      ? (responsive.tablet as UnknownRecord)
      : {};
  const mobile =
    responsive.mobile &&
    typeof responsive.mobile === "object" &&
    !Array.isArray(responsive.mobile)
      ? (responsive.mobile as UnknownRecord)
      : {};
  const hasPageAlignment =
    props.horizontalAlign === "left" ||
    props.horizontalAlign === "center" ||
    props.horizontalAlign === "right";
  const authoredOffsetX = Math.max(0, Number(props.offsetX) || 0);
  const offsetX = hasPageAlignment
    ? 0
    : transient?.offsetX ?? authoredOffsetX;
  const desktopWidth = Math.min(
    clampBlankCanvasWidth(props.width),
    Math.max(
      FREE_CANVAS_MIN_WIDTH,
      getFreeCanvasMaxWidth("desktop") - offsetX
    )
  );
  const desktopHeight = clampBlankCanvasHeight(props.height);
  const tabletWidth = clampBlankCanvasWidth(tablet.width ?? desktopWidth);
  const tabletHeight = clampBlankCanvasHeight(tablet.height ?? desktopHeight);
  const mobileWidth = clampBlankCanvasWidth(mobile.width ?? desktopWidth);
  const mobileHeight = clampBlankCanvasHeight(mobile.height ?? desktopHeight);
  const preferredWidth = transient?.width === undefined
    ? device === "mobile"
      ? mobileWidth
      : device === "tablet"
      ? tabletWidth
      : desktopWidth
    : clampBlankCanvasWidth(transient.width);
  const preferredHeight = transient?.height === undefined
    ? device === "mobile"
      ? mobileHeight
      : device === "tablet"
      ? tabletHeight
      : desktopHeight
    : clampBlankCanvasHeight(transient.height);
  return Object.freeze({
    height: preferredHeight,
    offsetX,
    width: preferredWidth,
  });
};

/** Applies an explicit external containing-block constraint to authored intent. */
export const allocateAtomicBlankCanvasViewport = ({
  hostInlineSize,
  preferred,
}: {
  hostInlineSize: number;
  preferred: AtomicBlankCanvasPreferredViewport;
}): AtomicBlankCanvasViewport => {
  const finiteHostInlineSize = Number.isFinite(hostInlineSize)
    ? Math.max(0, hostInlineSize)
    : 0;
  const minimumWidth = Math.min(
    FREE_CANVAS_MIN_WIDTH,
    finiteHostInlineSize
  );
  const offsetX = Math.min(
    Math.max(0, Number.isFinite(preferred.offsetX) ? preferred.offsetX : 0),
    Math.max(0, finiteHostInlineSize - minimumWidth)
  );
  const availableWidth = Math.max(0, finiteHostInlineSize - offsetX);
  const preferredWidth = Number.isFinite(preferred.width)
    ? preferred.width
    : minimumWidth;
  return Object.freeze({
    height: preferred.height,
    offsetX,
    width: Math.max(minimumWidth, Math.min(preferredWidth, availableWidth)),
  });
};

/**
 * The single responsive fallback rule shared by the CSS renderer adapter and
 * K4 LayoutSolver projection. Mobile inherits tablet, tablet inherits desktop.
 */
export const resolveAtomicContainerLayoutValues = ({
  device,
  overrides,
  props,
}: {
  device: AtomicLayoutDevice;
  overrides?: Partial<{
    columnGap: number;
    gapAnchorOffset: number;
    paddingBottom: number;
    paddingLeft: number;
    paddingRight: number;
    paddingTop: number;
    rowGap: number;
  }>;
  props: UnknownRecord;
}): AtomicContainerLayoutValues => {
  const desktopPadding = {
    bottom: paddingMetric(props.paddingBottom, paddingMetric(props.paddingY)),
    left: paddingMetric(props.paddingLeft, paddingMetric(props.paddingX)),
    right: paddingMetric(props.paddingRight, paddingMetric(props.paddingX)),
    top: paddingMetric(props.paddingTop, paddingMetric(props.paddingY)),
  };
  const tabletPadding = {
    bottom: paddingMetric(
      props.tabletPaddingBottom,
      paddingMetric(props.tabletPaddingY, desktopPadding.bottom)
    ),
    left: paddingMetric(
      props.tabletPaddingLeft,
      paddingMetric(props.tabletPaddingX, desktopPadding.left)
    ),
    right: paddingMetric(
      props.tabletPaddingRight,
      paddingMetric(props.tabletPaddingX, desktopPadding.right)
    ),
    top: paddingMetric(
      props.tabletPaddingTop,
      paddingMetric(props.tabletPaddingY, desktopPadding.top)
    ),
  };
  const mobilePadding = {
    bottom: paddingMetric(
      props.mobilePaddingBottom,
      paddingMetric(props.mobilePaddingY, tabletPadding.bottom)
    ),
    left: paddingMetric(
      props.mobilePaddingLeft,
      paddingMetric(props.mobilePaddingX, tabletPadding.left)
    ),
    right: paddingMetric(
      props.mobilePaddingRight,
      paddingMetric(props.mobilePaddingX, tabletPadding.right)
    ),
    top: paddingMetric(
      props.mobilePaddingTop,
      paddingMetric(props.mobilePaddingY, tabletPadding.top)
    ),
  };
  const inheritedPadding =
    device === "mobile"
      ? mobilePadding
      : device === "tablet"
      ? tabletPadding
      : desktopPadding;
  const responsiveValue = (field: string, fallback = 0) => {
    const desktop = finiteNumber(props[field], fallback);
    const tablet = finiteNumber(
      props[`tablet${field[0].toUpperCase()}${field.slice(1)}`],
      desktop
    );
    return device === "mobile"
      ? finiteNumber(
          props[`mobile${field[0].toUpperCase()}${field.slice(1)}`],
          tablet
        )
      : device === "tablet"
      ? tablet
      : desktop;
  };
  const padding = Object.freeze({
    bottom: paddingMetric(overrides?.paddingBottom, inheritedPadding.bottom),
    left: paddingMetric(overrides?.paddingLeft, inheritedPadding.left),
    right: paddingMetric(overrides?.paddingRight, inheritedPadding.right),
    top: paddingMetric(overrides?.paddingTop, inheritedPadding.top),
  });
  return Object.freeze({
    columnGap: gapMetric(overrides?.columnGap, responsiveValue("columnGap")),
    gapAnchorOffset: gapMetric(
      overrides?.gapAnchorOffset,
      responsiveValue("gapAnchorOffset")
    ),
    padding,
    rowGap: gapMetric(overrides?.rowGap, responsiveValue("rowGap")),
  });
};

export const resolveAtomicResponsiveFrame = (
  frame: AtomicResponsiveLayoutFrame,
  device: AtomicLayoutDevice
): AtomicLayoutFrame => {
  if (device === "desktop") return { ...frame.desktop };
  if (device === "tablet") return { ...frame.desktop, ...frame.tablet };
  return { ...frame.desktop, ...frame.tablet, ...frame.mobile };
};

export const getExplicitAtomicLayoutItemSizeMode = (
  item: AtomicResponsiveLayoutItem | undefined,
  device: AtomicLayoutDevice,
  field: "widthMode" | "heightMode"
): AtomicLayoutSizeMode | undefined => {
  const value =
    device === "desktop"
      ? item?.[field]
      : device === "tablet"
      ? item?.tablet?.[field] ?? item?.[field]
      : item?.mobile?.[field] ?? item?.tablet?.[field] ?? item?.[field];
  return value === "fixed" || value === "hug" || value === "fill"
    ? value
    : undefined;
};

export const resolveAtomicLayoutItem = (
  item: AtomicResponsiveLayoutItem | undefined,
  device: AtomicLayoutDevice,
  fallback?: Partial<AtomicLayoutItemValue>
): Required<AtomicLayoutItemValue> => {
  const base = {
    columnStart: 0,
    columnSpan: 1,
    detached: false,
    heightMode: "fixed" as const,
    rowStart: 0,
    rowSpan: 1,
    widthMode: "fixed" as const,
    ...fallback,
    ...(item ?? {}),
  };
  const responsive =
    device === "desktop"
      ? base
      : device === "tablet"
      ? { ...base, ...(item?.tablet ?? {}) }
      : { ...base, ...(item?.tablet ?? {}), ...(item?.mobile ?? {}) };
  const sizeMode = (value: unknown): AtomicLayoutSizeMode =>
    value === "hug" || value === "fill" ? value : "fixed";
  return {
    columnStart: Math.max(
      0,
      Math.min(12, Math.round(Number(responsive.columnStart)) || 0)
    ),
    columnSpan: Math.max(
      1,
      Math.min(12, Math.round(Number(responsive.columnSpan)) || 1)
    ),
    detached: (item?.detached ?? fallback?.detached) === true,
    heightMode: sizeMode(responsive.heightMode),
    rowStart: Math.max(
      0,
      Math.min(100, Math.round(Number(responsive.rowStart)) || 0)
    ),
    rowSpan: Math.max(
      1,
      Math.min(12, Math.round(Number(responsive.rowSpan)) || 1)
    ),
    widthMode: sizeMode(responsive.widthMode),
  };
};

export const getAtomicDeviceField = deviceField;
