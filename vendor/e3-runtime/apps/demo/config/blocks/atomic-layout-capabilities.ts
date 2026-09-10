import {
  resolveAutoLayoutItem,
  type AutoLayoutItem,
  type AutoLayoutItemSizeMode,
  type FreeCanvasDevice,
} from "../lib/free-canvas-bridge";
import {
  isPageFactComponentType,
  type PageFactComponentType,
} from "./page-fact-types";

export type AtomicLayoutAxis = "height" | "width";
export type AtomicParentLayoutMode =
  | "root"
  | "free"
  | "horizontal"
  | "vertical"
  | "grid";
export type AtomicLayoutCapabilityState = "derived" | "illegal" | "legal";
export type AtomicLayoutSolverOwner =
  | "authored-frame"
  | "intrinsic-content"
  | "parent-flow"
  | "parent-grid";

export type AtomicLayoutCapability = {
  axis: AtomicLayoutAxis;
  mode: AutoLayoutItemSizeMode;
  owner: AtomicLayoutSolverOwner;
  reason: string;
  state: AtomicLayoutCapabilityState;
};

const intrinsicHugTypes = new Set<PageFactComponentType>([
  "ContainerElement",
  "TextBox",
]);

/**
 * Single source for Inspector, commands, normalization and Save validation.
 * Geometry is derived when the parent or intrinsic content owns an axis; only
 * authored fixed frames may be written as the final axis value in page facts.
 */
export const resolveAtomicLayoutCapability = ({
  axis,
  detached = false,
  mode,
  parentLayout,
  type,
  ownLayoutMode,
  parentAxisFinite = true,
}: {
  axis: AtomicLayoutAxis;
  detached?: boolean;
  mode: AutoLayoutItemSizeMode;
  parentLayout: AtomicParentLayoutMode;
  type: PageFactComponentType;
  ownLayoutMode?: AtomicParentLayoutMode;
  parentAxisFinite?: boolean;
}): AtomicLayoutCapability => {
  if (type === "BlankCanvas") {
    return mode === "fixed"
      ? {
          axis,
          mode,
          owner: "authored-frame",
          reason: "BlankCanvas is a page root and owns an authored viewport.",
          state: "legal",
        }
      : {
          axis,
          mode,
          owner: "authored-frame",
          reason: "BlankCanvas cannot size against a parent layout.",
          state: "illegal",
        };
  }

  if (detached || parentLayout === "free" || parentLayout === "root") {
    if (mode === "fixed") {
      return {
        axis,
        mode,
        owner: "authored-frame",
        reason: "Free-positioned atoms own their authored frame.",
        state: "legal",
      };
    }
    if (
      mode === "hug" &&
      (type === "TextBox" ||
        (type === "ContainerElement" &&
          (ownLayoutMode === "horizontal" || ownLayoutMode === "vertical")))
    ) {
      return {
        axis,
        mode,
        owner: "intrinsic-content",
        reason:
          type === "TextBox"
            ? "TextBox may derive intrinsic size without a flow parent."
            : "A flow Container may Hug its own content while freely positioned.",
        state: "derived",
      };
    }
    return {
      axis,
      mode,
      owner: "authored-frame",
      reason:
        "Fill requires a finite parent track; this free-positioned atom has no intrinsic Hug contract.",
      state: "illegal",
    };
  }

  if (mode === "fill") {
    if (!parentAxisFinite) {
      return {
        axis,
        mode,
        owner: parentLayout === "grid" ? "parent-grid" : "parent-flow",
        reason:
          "Fill requires a finite parent axis; a Hug parent cannot allocate a finite remainder.",
        state: "illegal",
      };
    }
    return {
      axis,
      mode,
      owner: parentLayout === "grid" ? "parent-grid" : "parent-flow",
      reason: "The parent allocates the finite remainder or grid track.",
      state: "derived",
    };
  }

  if (mode === "fixed") {
    return {
      axis,
      mode,
      owner: "authored-frame",
      reason: "The atom keeps its authored axis inside the parent layout.",
      state: "legal",
    };
  }

  if (parentLayout === "grid") {
    return {
      axis,
      mode,
      owner: "parent-grid",
      reason:
        "Grid children use fixed or track Fill; Hug would create a second track solver.",
      state: "illegal",
    };
  }

  if (type === "ContainerElement" && ownLayoutMode === "grid") {
    return {
      axis,
      mode,
      owner: "intrinsic-content",
      reason:
        "A Grid container itself supports Fixed or legal Fill, never Hug.",
      state: "illegal",
    };
  }

  if (intrinsicHugTypes.has(type)) {
    return {
      axis,
      mode,
      owner: "intrinsic-content",
      reason:
        type === "TextBox"
          ? "Text metrics derive the axis."
          : "Horizontal or vertical Auto Layout content derives the axis.",
      state: "derived",
    };
  }

  return {
    axis,
    mode,
    owner: "intrinsic-content",
    reason: "This atom has no intrinsic Hug solver.",
    state: "illegal",
  };
};

export const getLegalAtomicSizeModes = (
  input: Omit<Parameters<typeof resolveAtomicLayoutCapability>[0], "mode">
) =>
  (["fixed", "hug", "fill"] as const).filter(
    (mode) =>
      resolveAtomicLayoutCapability({ ...input, mode }).state !== "illegal"
  );

/**
 * Constraints have exactly one active geometry owner: a placed atom whose
 * direct parent is Free layout. Flow/Grid children (including detached items)
 * keep the authored fact dormant, but must not expose an editing surface.
 */
export const canEditAtomicConstraints = ({
  parentLayout,
  type,
}: {
  detached?: boolean;
  parentLayout: AtomicParentLayoutMode;
  type: unknown;
}) =>
  isPageFactComponentType(type) &&
  type !== "BlankCanvas" &&
  parentLayout === "free";

export type AtomicLayoutViolation = {
  decision: string;
  field: "heightMode" | "widthMode";
  path: string;
  type: PageFactComponentType;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const devices: FreeCanvasDevice[] = ["desktop", "tablet", "mobile"];

export const resolveAtomicOwnLayoutMode = (
  type: unknown,
  props: unknown
): AtomicParentLayoutMode => {
  if (
    (type === "BlankCanvas" || type === "ContainerElement") &&
    isRecord(props) &&
    (props.layoutMode === "horizontal" ||
      props.layoutMode === "vertical" ||
      props.layoutMode === "grid")
  ) {
    return props.layoutMode;
  }
  return "free";
};

/** Deep validation shared by load, Store writes, Save, Preview and UX AI. */
export const inspectAtomicLayoutTree = (
  value: unknown
): AtomicLayoutViolation[] => {
  const violations: AtomicLayoutViolation[] = [];
  type ParentContext = {
    fallback: {
      heightMode: AutoLayoutItemSizeMode;
      widthMode: AutoLayoutItemSizeMode;
    };
    finite: Record<FreeCanvasDevice, { height: boolean; width: boolean }>;
    mode: AtomicParentLayoutMode;
  };
  const inspectNode = (
    candidate: unknown,
    path: string,
    parentContext: ParentContext
  ) => {
    if (!isRecord(candidate) || !isPageFactComponentType(candidate.type)) {
      return;
    }
    const type = candidate.type;
    const props = isRecord(candidate.props) ? candidate.props : {};
    const item = isRecord(props.layoutItem)
      ? (props.layoutItem as AutoLayoutItem)
      : undefined;
    const ownLayoutMode = resolveAtomicOwnLayoutMode(type, props);

    if (type !== "BlankCanvas") {
      devices.forEach((device) => {
        const resolved = resolveAutoLayoutItem(
          item,
          device,
          parentContext.fallback
        );
        (["width", "height"] as const).forEach((axis) => {
          const field = `${axis}Mode` as "heightMode" | "widthMode";
          const capability = resolveAtomicLayoutCapability({
            axis,
            detached: resolved.detached,
            mode: resolved[field],
            ownLayoutMode,
            parentAxisFinite: parentContext.finite[device][axis],
            parentLayout: parentContext.mode,
            type,
          });
          if (capability.state !== "illegal") return;
          violations.push({
            decision: capability.reason,
            field,
            path: `${path}.props.layoutItem${
              device === "desktop" ? "" : `.${device}`
            }.${field}`,
            type,
          });
        });
      });
    }

    if (
      (type === "BlankCanvas" || type === "ContainerElement") &&
      Array.isArray(props.items)
    ) {
      const childWidthMode =
        props.childWidthMode === "fill" || props.childWidthMode === "hug"
          ? props.childWidthMode
          : "fixed";
      const childHeightMode =
        props.childHeightMode === "fill" || props.childHeightMode === "hug"
          ? props.childHeightMode
          : "fixed";
      const ownResolvedByDevice = Object.fromEntries(
        devices.map((device) => [
          device,
          type === "BlankCanvas"
            ? { heightMode: "fixed", widthMode: "fixed" }
            : resolveAutoLayoutItem(item, device, parentContext.fallback),
        ])
      ) as Record<
        FreeCanvasDevice,
        {
          heightMode: AutoLayoutItemSizeMode;
          widthMode: AutoLayoutItemSizeMode;
        }
      >;
      const childParentContext: ParentContext = {
        fallback: {
          heightMode: childHeightMode,
          widthMode: childWidthMode,
        },
        finite: Object.fromEntries(
          devices.map((device) => [
            device,
            {
              height: ownResolvedByDevice[device].heightMode !== "hug",
              width: ownResolvedByDevice[device].widthMode !== "hug",
            },
          ])
        ) as ParentContext["finite"],
        mode: ownLayoutMode,
      };
      props.items.forEach((child, index) =>
        inspectNode(child, `${path}.props.items[${index}]`, childParentContext)
      );
    }
  };

  if (!isRecord(value)) return violations;
  if (Array.isArray(value.content)) {
    value.content.forEach((node, index) =>
      inspectNode(node, `content[${index}]`, {
        fallback: { heightMode: "fixed", widthMode: "fixed" },
        finite: {
          desktop: { height: true, width: true },
          mobile: { height: true, width: true },
          tablet: { height: true, width: true },
        },
        mode: "root",
      })
    );
  }
  if (isRecord(value.zones)) {
    Object.entries(value.zones).forEach(([zone, items]) => {
      if (!Array.isArray(items)) return;
      items.forEach((node, index) =>
        inspectNode(node, `zones.${zone}[${index}]`, {
          fallback: { heightMode: "fixed", widthMode: "fixed" },
          finite: {
            desktop: { height: true, width: true },
            mobile: { height: true, width: true },
            tablet: { height: true, width: true },
          },
          mode: "free",
        })
      );
    });
  }
  return violations;
};
