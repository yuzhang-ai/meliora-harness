import type {
  AtomicLayoutDevice,
  AtomicLayoutFrame,
} from "./atomic-layout-authored-values";
import {
  ATOMIC_FRAME_MIN_HEIGHT,
  ATOMIC_FRAME_MIN_WIDTH,
} from "./atomic-geometry-limits";

export type AtomicHorizontalConstraint =
  | "left"
  | "center"
  | "right"
  | "stretch"
  | "scale";

export type AtomicVerticalConstraint =
  | "top"
  | "center"
  | "bottom"
  | "stretch"
  | "scale";

export type AtomicConstraintValue = Readonly<{
  horizontal?: AtomicHorizontalConstraint;
  vertical?: AtomicVerticalConstraint;
}>;

export type AtomicResponsiveConstraints = AtomicConstraintValue &
  Readonly<{
    tablet?: AtomicConstraintValue;
    mobile?: AtomicConstraintValue;
  }>;

export type AtomicResolvedConstraints = Readonly<{
  horizontal: AtomicHorizontalConstraint;
  vertical: AtomicVerticalConstraint;
}>;

export class AtomicConstraintContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AtomicConstraintContractError";
    this.code = code;
  }
}

const horizontalValues = new Set<AtomicHorizontalConstraint>([
  "left",
  "center",
  "right",
  "stretch",
  "scale",
]);

const verticalValues = new Set<AtomicVerticalConstraint>([
  "top",
  "center",
  "bottom",
  "stretch",
  "scale",
]);

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const assertExactKeys = (
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  path: string
) => {
  const allowedKeys = new Set(allowed);
  const unexpected = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unexpected) {
    throw new AtomicConstraintContractError(
      "unexpected_constraint_field",
      `${path}.${unexpected} is not part of the constraints contract.`
    );
  }
};

const assertConstraintValue = (
  value: unknown,
  path: string
): AtomicConstraintValue => {
  if (!isRecord(value)) {
    throw new AtomicConstraintContractError(
      "invalid_constraints",
      `${path} must be an object.`
    );
  }
  assertExactKeys(value, ["horizontal", "vertical"], path);
  if (
    value.horizontal !== undefined &&
    !horizontalValues.has(value.horizontal as AtomicHorizontalConstraint)
  ) {
    throw new AtomicConstraintContractError(
      "invalid_horizontal_constraint",
      `${path}.horizontal is invalid.`
    );
  }
  if (
    value.vertical !== undefined &&
    !verticalValues.has(value.vertical as AtomicVerticalConstraint)
  ) {
    throw new AtomicConstraintContractError(
      "invalid_vertical_constraint",
      `${path}.vertical is invalid.`
    );
  }
  return value as AtomicConstraintValue;
};

const assertResponsiveConstraints = (
  value: unknown
): AtomicResponsiveConstraints => {
  if (value === undefined) return Object.freeze({});
  if (!isRecord(value)) {
    throw new AtomicConstraintContractError(
      "invalid_constraints",
      "constraints must be an object."
    );
  }
  assertExactKeys(
    value,
    ["horizontal", "vertical", "tablet", "mobile"],
    "constraints"
  );
  assertConstraintValue(
    { horizontal: value.horizontal, vertical: value.vertical },
    "constraints"
  );
  if (value.tablet !== undefined) {
    assertConstraintValue(value.tablet, "constraints.tablet");
  }
  if (value.mobile !== undefined) {
    assertConstraintValue(value.mobile, "constraints.mobile");
  }
  return value as AtomicResponsiveConstraints;
};

export const resolveAtomicConstraints = (
  value: unknown,
  device: AtomicLayoutDevice
): AtomicResolvedConstraints => {
  const constraints = assertResponsiveConstraints(value);
  const desktop = {
    horizontal: constraints.horizontal ?? "left",
    vertical: constraints.vertical ?? "top",
  } satisfies AtomicResolvedConstraints;
  if (device === "desktop") return Object.freeze(desktop);
  const tablet = {
    horizontal: constraints.tablet?.horizontal ?? desktop.horizontal,
    vertical: constraints.tablet?.vertical ?? desktop.vertical,
  } satisfies AtomicResolvedConstraints;
  if (device === "tablet") return Object.freeze(tablet);
  return Object.freeze({
    horizontal: constraints.mobile?.horizontal ?? tablet.horizontal,
    vertical: constraints.mobile?.vertical ?? tablet.vertical,
  });
};

export const applyAtomicConstraintsPatch = (
  value: unknown,
  device: AtomicLayoutDevice,
  patch: AtomicConstraintValue
): AtomicResponsiveConstraints => {
  const constraints = assertResponsiveConstraints(value);
  const normalizedPatch = assertConstraintValue(patch, "patch");
  const patchesHorizontal = Object.hasOwn(normalizedPatch, "horizontal");
  const patchesVertical = Object.hasOwn(normalizedPatch, "vertical");
  const next: {
    horizontal?: AtomicHorizontalConstraint;
    vertical?: AtomicVerticalConstraint;
    tablet?: AtomicConstraintValue;
    mobile?: AtomicConstraintValue;
  } = {
    ...(constraints.horizontal === undefined
      ? {}
      : { horizontal: constraints.horizontal }),
    ...(constraints.vertical === undefined
      ? {}
      : { vertical: constraints.vertical }),
    ...(constraints.tablet ? { tablet: { ...constraints.tablet } } : {}),
    ...(constraints.mobile ? { mobile: { ...constraints.mobile } } : {}),
  };

  if (device === "desktop") {
    if (patchesHorizontal) {
      if (normalizedPatch.horizontal === undefined) delete next.horizontal;
      else next.horizontal = normalizedPatch.horizontal;
    }
    if (patchesVertical) {
      if (normalizedPatch.vertical === undefined) delete next.vertical;
      else next.vertical = normalizedPatch.vertical;
    }
  } else {
    const inherited = resolveAtomicConstraints(
      constraints,
      device === "mobile" ? "tablet" : "desktop"
    );
    const override = { ...(next[device] ?? {}) };
    if (patchesHorizontal) {
      if (normalizedPatch.horizontal === undefined) delete override.horizontal;
      else if (normalizedPatch.horizontal === inherited.horizontal) {
        delete override.horizontal;
      } else override.horizontal = normalizedPatch.horizontal;
    }
    if (patchesVertical) {
      if (normalizedPatch.vertical === undefined) delete override.vertical;
      else if (normalizedPatch.vertical === inherited.vertical) {
        delete override.vertical;
      } else override.vertical = normalizedPatch.vertical;
    }
    if (Object.keys(override).length === 0) delete next[device];
    else next[device] = override;
  }

  return Object.freeze({
    ...next,
    ...(next.tablet ? { tablet: Object.freeze({ ...next.tablet }) } : {}),
    ...(next.mobile ? { mobile: Object.freeze({ ...next.mobile }) } : {}),
  });
};

const assertFinitePositiveSize = (
  frame: Readonly<{ height: number; width: number }>,
  path: string
) => {
  if (
    !Number.isFinite(frame.width) ||
    !Number.isFinite(frame.height) ||
    frame.width <= 0 ||
    frame.height <= 0
  ) {
    throw new AtomicConstraintContractError(
      "invalid_constraint_frame",
      `${path} must have finite positive width and height.`
    );
  }
};

const assertFiniteFrame = (frame: AtomicLayoutFrame, path: string) => {
  assertFinitePositiveSize(frame, path);
  if (
    !Number.isFinite(frame.x) ||
    !Number.isFinite(frame.y) ||
    !Number.isFinite(frame.zIndex)
  ) {
    throw new AtomicConstraintContractError(
      "invalid_constraint_frame",
      `${path} must contain finite x, y and zIndex.`
    );
  }
};

/**
 * C1's pure Free Layout resolver. Callers must always pass the gesture-start
 * snapshots; feeding a prior preview back into this function would accumulate
 * rounding drift and violates the Preview/Commit contract. `layoutItem` is
 * intentionally absent: while the direct parent is Free, its retained
 * Auto/Grid size intent is dormant and cannot compete for either axis.
 */
export const resolveConstrainedFreeChildFrame = ({
  afterParent,
  beforeChild,
  beforeParent,
  constraints,
}: {
  afterParent: Readonly<{ height: number; width: number }>;
  beforeChild: AtomicLayoutFrame;
  beforeParent: Readonly<{ height: number; width: number }>;
  constraints: AtomicResolvedConstraints;
}): AtomicLayoutFrame =>
  resolveConstrainedFreeChildFrameDetailed({
    afterParent,
    beforeChild,
    beforeParent,
    constraints,
  }).frame;

export type AtomicConstrainedFrameResolution = Readonly<{
  clampedAxes: readonly ("height" | "width")[];
  frame: AtomicLayoutFrame;
}>;

/** K4 receipt form of the same Free Layout calculation, including clamp evidence. */
export const resolveConstrainedFreeChildFrameDetailed = ({
  afterParent,
  beforeChild,
  beforeParent,
  constraints,
}: {
  afterParent: Readonly<{ height: number; width: number }>;
  beforeChild: AtomicLayoutFrame;
  beforeParent: Readonly<{ height: number; width: number }>;
  constraints: AtomicResolvedConstraints;
}): AtomicConstrainedFrameResolution => {
  assertFinitePositiveSize(beforeParent, "beforeParent");
  assertFinitePositiveSize(afterParent, "afterParent");
  assertFiniteFrame(beforeChild, "beforeChild");
  const widthDelta = afterParent.width - beforeParent.width;
  const heightDelta = afterParent.height - beforeParent.height;
  const widthScale = afterParent.width / beforeParent.width;
  const heightScale = afterParent.height / beforeParent.height;
  let x = beforeChild.x;
  let y = beforeChild.y;
  let width = beforeChild.width;
  let height = beforeChild.height;

  if (constraints.horizontal === "center") x += widthDelta / 2;
  else if (constraints.horizontal === "right") x += widthDelta;
  else if (constraints.horizontal === "stretch") width += widthDelta;
  else if (constraints.horizontal === "scale") {
    x *= widthScale;
    width *= widthScale;
  }

  if (constraints.vertical === "center") y += heightDelta / 2;
  else if (constraints.vertical === "bottom") y += heightDelta;
  else if (constraints.vertical === "stretch") height += heightDelta;
  else if (constraints.vertical === "scale") {
    y *= heightScale;
    height *= heightScale;
  }

  const roundedHeight = Math.round(height);
  const roundedWidth = Math.round(width);
  const clampedAxes = [
    ...(roundedWidth < ATOMIC_FRAME_MIN_WIDTH ? (["width"] as const) : []),
    ...(roundedHeight < ATOMIC_FRAME_MIN_HEIGHT ? (["height"] as const) : []),
  ];
  return Object.freeze({
    clampedAxes: Object.freeze(clampedAxes),
    frame: Object.freeze({
      height: Math.max(ATOMIC_FRAME_MIN_HEIGHT, roundedHeight),
      width: Math.max(ATOMIC_FRAME_MIN_WIDTH, roundedWidth),
      x: Math.round(x),
      y: Math.round(y),
      zIndex: beforeChild.zIndex,
    }),
  });
};
