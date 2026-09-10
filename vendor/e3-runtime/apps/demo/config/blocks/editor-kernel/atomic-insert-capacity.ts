import { insertAtomicComponentInTree } from "../atomic-writable-contract";
import { resolveAtomicOwnLayoutMode } from "../atomic-layout-capabilities";
import { FREE_CANVAS_MAX_HEIGHT } from "../FreeCanvas/constraints";
import {
  resolveAtomicBlankCanvasPreferredViewport,
  resolveAtomicContainerLayoutValues,
  resolveAtomicLayoutItem,
  resolveAtomicResponsiveFrame,
  type AtomicLayoutDevice,
  type AtomicResponsiveLayoutFrame,
  type AtomicResponsiveLayoutItem,
} from "./atomic-layout-authored-values";
import { projectAtomicDocumentGraph } from "./atomic-document-graph";
import {
  browserAtomicFingerprintPort,
  cloneAndDeepFreeze,
} from "./atomic-document-version";

type UnknownRecord = Readonly<Record<string, unknown>>;

export type AtomicPageRootInsertResize = Readonly<{
  capacityEvidenceRef: string;
  desktopHeight: number;
  mobileHeight: number;
  nodeId: string;
  tabletHeight: number;
}>;

export type AtomicInsertCapacityPlan = Readonly<{
  disposition: "accepted";
  pageRootResize: AtomicPageRootInsertResize | null;
}>;

export class AtomicInsertCapacityError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "AtomicInsertCapacityError";
    this.code = code;
  }
}

const devices = ["desktop", "tablet", "mobile"] as const;

const finite = (value: unknown, field: string) => {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    throw new AtomicInsertCapacityError(
      "insert_capacity_invalid",
      `${field} must be finite while planning an atomic insert.`
    );
  }
  return number;
};

const readNodeFrame = (props: UnknownRecord, device: AtomicLayoutDevice) => {
  const frame = props.frame as AtomicResponsiveLayoutFrame | undefined;
  if (!frame?.desktop) {
    throw new AtomicInsertCapacityError(
      "insert_capacity_invalid",
      `Atomic insert child ${String(props.id ?? "unknown")} has no authored frame.`
    );
  }
  return resolveAtomicResponsiveFrame(frame, device);
};

const readParentSize = (
  type: string,
  props: UnknownRecord,
  device: AtomicLayoutDevice
) => {
  if (type === "BlankCanvas") {
    return resolveAtomicBlankCanvasPreferredViewport({ device, props });
  }
  const frame = readNodeFrame(props, device);
  return { height: frame.height, width: frame.width };
};

const requiredFlowExtent = ({
  device,
  mode,
  parentProps,
  children,
}: {
  device: AtomicLayoutDevice;
  mode: "horizontal" | "vertical";
  parentProps: UnknownRecord;
  children: readonly Readonly<{ props: UnknownRecord }>[];
}) => {
  const values = resolveAtomicContainerLayoutValues({ device, props: parentProps });
  const visible = children.filter(({ props }) => props.hidden !== true);
  const flow = visible.filter(({ props }) => {
    const item = resolveAtomicLayoutItem(
      props.layoutItem as AtomicResponsiveLayoutItem | undefined,
      device
    );
    return !item.detached;
  });
  const detached = visible.filter(({ props }) => {
    const item = resolveAtomicLayoutItem(
      props.layoutItem as AtomicResponsiveLayoutItem | undefined,
      device
    );
    return item.detached;
  });
  const frames = flow.map(({ props }) => ({
    frame: readNodeFrame(props, device),
    item: resolveAtomicLayoutItem(
      props.layoutItem as AtomicResponsiveLayoutItem | undefined,
      device
    ),
  }));
  const mainGap = mode === "vertical" ? values.rowGap : values.columnGap;
  const main = frames.reduce((sum, { frame, item }) => {
    const size = mode === "vertical" ? frame.height : frame.width;
    const axisMode = mode === "vertical" ? item.heightMode : item.widthMode;
    return sum + (axisMode === "fill" ? 0 : size);
  }, Math.max(0, frames.length - 1) * mainGap);
  const cross = frames.reduce((maximum, { frame, item }) => {
    const size = mode === "vertical" ? frame.width : frame.height;
    const axisMode = mode === "vertical" ? item.widthMode : item.heightMode;
    return Math.max(maximum, axisMode === "fill" ? 0 : size);
  }, 0);
  const detachedBounds = detached.reduce(
    (bounds, { props }) => {
      const frame = readNodeFrame(props, device);
      return {
        height: Math.max(bounds.height, frame.y + frame.height),
        width: Math.max(bounds.width, frame.x + frame.width),
      };
    },
    { height: 0, width: 0 }
  );
  const flowWidth =
    mode === "vertical"
      ? values.padding.left + cross + values.padding.right
      : values.padding.left + main + values.padding.right;
  const flowHeight =
    mode === "vertical"
      ? values.padding.top + main + values.padding.bottom
      : values.padding.top + cross + values.padding.bottom;
  return {
    height: Math.max(flowHeight, detachedBounds.height + values.padding.bottom),
    width: Math.max(flowWidth, detachedBounds.width + values.padding.right),
  };
};

const requiredFreeExtent = (
  device: AtomicLayoutDevice,
  children: readonly Readonly<{ props: UnknownRecord }>[]
) =>
  children
    .filter(({ props }) => props.hidden !== true)
    .reduce(
      (extent, { props }) => {
        const frame = readNodeFrame(props, device);
        return {
          height: Math.max(extent.height, frame.y + frame.height),
          width: Math.max(extent.width, frame.x + frame.width),
        };
      },
      { height: 0, width: 0 }
    );

const getRequiredExtent = ({
  device,
  mode,
  parentProps,
  children,
}: {
  device: AtomicLayoutDevice;
  mode: ReturnType<typeof resolveAtomicOwnLayoutMode>;
  parentProps: UnknownRecord;
  children: readonly Readonly<{ props: UnknownRecord }>[];
}) => {
  if (mode === "horizontal" || mode === "vertical") {
    if (parentProps.wrap === true) {
      throw new AtomicInsertCapacityError(
        "insert_capacity_unsupported",
        "Wrapped fixed parents require a measured capacity receipt before insertion."
      );
    }
    return requiredFlowExtent({ device, mode, parentProps, children });
  }
  if (mode === "free") return requiredFreeExtent(device, children);
  throw new AtomicInsertCapacityError(
    "insert_capacity_unsupported",
    "Grid insertion requires a measured capacity receipt before insertion."
  );
};

const readCurrentPageRootHeights = (props: UnknownRecord) => {
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
  const desktopHeight = finite(props.height, "BlankCanvas.height");
  const tabletHeight = finite(
    tablet.height ?? desktopHeight,
    "BlankCanvas.responsiveSize.tablet.height"
  );
  const mobileHeight = finite(
    mobile.height ?? tabletHeight,
    "BlankCanvas.responsiveSize.mobile.height"
  );
  return { desktopHeight, mobileHeight, tabletHeight };
};

/**
 * Pure prospective capacity planner shared by every InsertAtomicTree caller.
 * It never mutates the supplied document. A top-level vertical BlankCanvas may
 * grow, while every other fixed parent must already have enough authored room.
 */
export const planAtomicInsertCapacity = ({
  data,
  index,
  parentId,
  tree,
}: {
  data: unknown;
  index: number;
  parentId: string;
  tree: UnknownRecord;
}): AtomicInsertCapacityPlan => {
  const before = projectAtomicDocumentGraph(data);
  const parent = before.getNode(parentId);
  if (!parent) {
    throw new AtomicInsertCapacityError(
      "insert_capacity_parent_missing",
      "Atomic insert capacity parent no longer exists."
    );
  }
  if (
    parent.type !== "BlankCanvas" &&
    devices.some((device) => {
      const item = resolveAtomicLayoutItem(
        parent.props.layoutItem as AtomicResponsiveLayoutItem | undefined,
        device
      );
      return item.widthMode === "hug" || item.heightMode === "hug";
    })
  ) {
    throw new AtomicInsertCapacityError(
      "insert_capacity_hug_ancestor_unsupported",
      "该自适应容器暂不支持直接插入，请投放到页面根或固定容器。"
    );
  }
  const candidate = insertAtomicComponentInTree(data, parentId, tree, index);
  const after = projectAtomicDocumentGraph(candidate);
  const candidateParent = after.getNode(parentId);
  if (!candidateParent) {
    throw new AtomicInsertCapacityError(
      "insert_capacity_parent_missing",
      "Atomic insert capacity parent disappeared from the prospective tree."
    );
  }
  const mode = resolveAtomicOwnLayoutMode(parent.type, parent.props);
  const isPageRoot =
    parent.type === "BlankCanvas" &&
    parent.parentId === null &&
    before.rootId === parent.id;
  const extents = Object.fromEntries(
    devices.map((device) => [
      device,
      getRequiredExtent({
        children: after.getChildren(parentId),
        device,
        mode,
        parentProps: candidateParent.props,
      }),
    ])
  ) as Record<AtomicLayoutDevice, { height: number; width: number }>;

  if (isPageRoot && mode === "vertical") {
    const current = readCurrentPageRootHeights(parent.props);
    const target = {
      desktopHeight: Math.max(current.desktopHeight, Math.ceil(extents.desktop.height)),
      tabletHeight: Math.max(current.tabletHeight, Math.ceil(extents.tablet.height)),
      mobileHeight: Math.max(current.mobileHeight, Math.ceil(extents.mobile.height)),
    };
    if (Object.values(target).some((height) => height > FREE_CANVAS_MAX_HEIGHT)) {
      throw new AtomicInsertCapacityError(
        "insert_capacity_exceeded",
        `Atomic page root insertion would exceed the finite ${FREE_CANVAS_MAX_HEIGHT}px height limit.`
      );
    }
    const changed =
      target.desktopHeight !== current.desktopHeight ||
      target.tabletHeight !== current.tabletHeight ||
      target.mobileHeight !== current.mobileHeight;
    if (!changed) {
      return Object.freeze({ disposition: "accepted", pageRootResize: null });
    }
    const basis = {
      current,
      extents,
      index,
      parentId,
      target,
      tree,
    };
    return cloneAndDeepFreeze({
      disposition: "accepted" as const,
      pageRootResize: {
        capacityEvidenceRef: browserAtomicFingerprintPort.fingerprint(basis),
        nodeId: parentId,
        ...target,
      },
    });
  }

  devices.forEach((device) => {
    const parentSize = readParentSize(parent.type, parent.props, device);
    const extent = extents[device];
    const parentLayoutItem = resolveAtomicLayoutItem(
      parent.props.layoutItem as AtomicResponsiveLayoutItem | undefined,
      device
    );
    const fixedWidth =
      parent.type === "BlankCanvas" || parentLayoutItem.widthMode !== "hug";
    const fixedHeight =
      parent.type === "BlankCanvas" || parentLayoutItem.heightMode !== "hug";
    if (
      (fixedWidth && extent.width > parentSize.width) ||
      (fixedHeight && extent.height > parentSize.height)
    ) {
      throw new AtomicInsertCapacityError(
        "insert_capacity_exceeded",
        `Atomic insert does not fit the fixed ${device} parent bounds.`
      );
    }
  });
  return Object.freeze({ disposition: "accepted", pageRootResize: null });
};
