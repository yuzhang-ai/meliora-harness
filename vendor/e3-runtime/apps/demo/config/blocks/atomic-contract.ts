import {
  PAGE_FACT_COMPONENT_TYPES,
  type PageFactComponentType,
} from "./page-fact-types";
import { SURFACE_FILL_MODES, SURFACE_IMAGE_FITS } from "./FreeCanvas/fill";
import type { LinkTarget } from "../lib/safe-content";
import { inspectAtomicEffectFact } from "./shared/atomic-effect";

/** Existing generic link contract; no new interaction behavior is built in P0-P3. */
export type AtomicInteraction = {
  analyticsActionKey?: string;
  ariaLabel?: string;
  disabled?: boolean;
  href?: string;
  kind: "link";
  target?: LinkTarget;
};

type UnknownRecord = Record<string, unknown>;

const COMMON_ATOM_PROPS = ["id", "editorName"] as const;
const SURFACE_PROPS = [
  "backgroundColor",
  "fill",
  "borderColor",
  "borderWidth",
  "borderPosition",
  "borderStyle",
  "borderTop",
  "borderRight",
  "borderBottom",
  "borderLeft",
  "borderTopWidth",
  "borderRightWidth",
  "borderBottomWidth",
  "borderLeftWidth",
  "borderDashLength",
  "borderDashGap",
  "borderDashCap",
  "borderRadius",
  "borderRadiusTopLeft",
  "borderRadiusTopRight",
  "borderRadiusBottomRight",
  "borderRadiusBottomLeft",
  "effect",
  "shadow",
  "opacity",
] as const;
const PLACED_ATOM_PROPS = [
  "frame",
  "layoutItem",
  "constraints",
  "transform",
  "hidden",
  "locked",
] as const;
const AUTO_LAYOUT_PROPS = [
  "layoutMode",
  "columns",
  "tabletColumns",
  "mobileColumns",
  "rows",
  "tabletRows",
  "mobileRows",
  "columnGap",
  "rowGap",
  "paddingX",
  "paddingY",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
  "tabletColumnGap",
  "tabletRowGap",
  "tabletPaddingX",
  "tabletPaddingY",
  "tabletPaddingTop",
  "tabletPaddingRight",
  "tabletPaddingBottom",
  "tabletPaddingLeft",
  "mobileColumnGap",
  "mobileRowGap",
  "mobilePaddingX",
  "mobilePaddingY",
  "mobilePaddingTop",
  "mobilePaddingRight",
  "mobilePaddingBottom",
  "mobilePaddingLeft",
  "gapAnchorOffset",
  "tabletGapAnchorOffset",
  "mobileGapAnchorOffset",
  "alignItems",
  "justifyContent",
  "wrap",
] as const;

const propSet = (...groups: readonly (readonly string[])[]) =>
  new Set(groups.flatMap((group) => [...group]));

/**
 * The writable page-fact contract. Template, recipe and presentation identity
 * fields are intentionally absent. Any future field must be reviewed here
 * before it may cross Store/Save/Preview/AI boundaries.
 */
export const PAGE_FACT_PROP_ALLOWLISTS: Record<
  PageFactComponentType,
  ReadonlySet<string>
> = {
  BlankCanvas: propSet(COMMON_ATOM_PROPS, SURFACE_PROPS, AUTO_LAYOUT_PROPS, [
    "canvasVersion",
    "offsetX",
    "horizontalAlign",
    "width",
    "height",
    "responsiveSize",
    "shape",
    "overflow",
    "items",
  ]),
  ContainerElement: propSet(
    COMMON_ATOM_PROPS,
    SURFACE_PROPS,
    PLACED_ATOM_PROPS,
    AUTO_LAYOUT_PROPS,
    [
      "containerVersion",
      "interaction",
      "shape",
      "overflow",
      "childWidthMode",
      "childHeightMode",
      "items",
    ]
  ),
  TextBox: propSet(COMMON_ATOM_PROPS, PLACED_ATOM_PROPS, [
    "text",
    "href",
    "target",
    "semanticTag",
    "backgroundColor",
    "backgroundFill",
    "fill",
    "textFillVersion",
    "borderColor",
    "borderWidth",
    "borderPosition",
    "borderStyle",
    "borderTop",
    "borderRight",
    "borderBottom",
    "borderLeft",
    "borderTopWidth",
    "borderRightWidth",
    "borderBottomWidth",
    "borderLeftWidth",
    "borderDashLength",
    "borderDashGap",
    "borderDashCap",
    "borderRadius",
    "borderRadiusTopLeft",
    "borderRadiusTopRight",
    "borderRadiusBottomRight",
    "borderRadiusBottomLeft",
    "effect",
    "shadow",
    "opacity",
    "overflow",
    "fontFamily",
    "fontSize",
    "fontWeight",
    "responsiveTypography",
    "fontStyle",
    "lineHeight",
    "letterSpacing",
    "color",
    "textDecoration",
    "textAlign",
    "verticalAlign",
    "emphasisWords",
  ]),
  ImageElement: propSet(COMMON_ATOM_PROPS, PLACED_ATOM_PROPS, SURFACE_PROPS, [
    "src",
    "alt",
    "href",
    "target",
    "shape",
    "maskFill",
    "objectFit",
    "objectPositionX",
    "objectPositionY",
  ]),
  VideoElement: propSet(COMMON_ATOM_PROPS, PLACED_ATOM_PROPS, SURFACE_PROPS, [
    "src",
    "posterUrl",
    "controls",
    "autoplay",
    "muted",
    "loop",
    "playsInline",
    "objectFit",
    "objectPositionX",
    "objectPositionY",
  ]),
  ShapeElement: propSet(COMMON_ATOM_PROPS, PLACED_ATOM_PROPS, SURFACE_PROPS, [
    "shapeVersion",
    "shape",
    "overflow",
  ]),
  IconElement: propSet(COMMON_ATOM_PROPS, PLACED_ATOM_PROPS, SURFACE_PROPS, [
    "iconVersion",
    "source",
    "icon",
    "svgContent",
    "iconColor",
    "iconSize",
    "strokeWidth",
    "decorative",
    "ariaLabel",
    "padding",
    "overflow",
  ]),
};

export type AtomicFactViolationCode =
  | "duplicate-id"
  | "invalid-child"
  | "invalid-prop"
  | "invalid-root"
  | "missing-id"
  | "unknown-type";

export type AtomicFactViolation = {
  code: AtomicFactViolationCode;
  path: string;
  type: string;
  field?: string;
  decision: string;
};

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const pageFactTypes = new Set<string>(PAGE_FACT_COMPONENT_TYPES);
const HIDDEN_IDENTITY_FIELDS = new Set([
  "componentType",
  "cardPreset",
  "containerRole",
  "instanceId",
  "preset",
  "presetElementRole",
  "presetMigration",
  "recipeKind",
  "recipeVersion",
  "role",
  "sectionKind",
  "semantic",
  "templateId",
  "templateKind",
]);
const FILL_FIELDS = new Set(["backgroundFill", "fill", "maskFill"]);
const FILL_KEYS = new Set([
  "color",
  "enabled",
  "gradientAngle",
  "gradientFrom",
  "gradientMirror",
  "gradientTo",
  "imageFit",
  "imageOverlay",
  "imagePositionX",
  "imagePositionY",
  "imageUrl",
  "mode",
  "opacity",
  "stops",
]);
const FILL_STOP_KEYS = new Set(["color", "id", "opacity", "position"]);
const FILL_IMAGE_OVERLAY_KEYS = new Set(["color", "opacity"]);
const RESPONSIVE_KEYS = new Set(["desktop", "mobile", "tablet"]);
const FRAME_KEYS = new Set(["height", "width", "x", "y", "zIndex"]);
const LAYOUT_ITEM_KEYS = new Set([
  "columnSpan",
  "columnStart",
  "detached",
  "heightMode",
  "mobile",
  "rowSpan",
  "rowStart",
  "tablet",
  "widthMode",
]);
const LAYOUT_ITEM_DEVICE_KEYS = new Set([
  "columnSpan",
  "columnStart",
  "heightMode",
  "rowSpan",
  "rowStart",
  "widthMode",
]);
const CONSTRAINT_KEYS = new Set([
  "horizontal",
  "vertical",
  "mobile",
  "tablet",
]);
const CONSTRAINT_DEVICE_KEYS = new Set(["horizontal", "vertical"]);
const HORIZONTAL_CONSTRAINT_VALUES = new Set([
  "left",
  "center",
  "right",
  "stretch",
  "scale",
]);
const VERTICAL_CONSTRAINT_VALUES = new Set([
  "top",
  "center",
  "bottom",
  "stretch",
  "scale",
]);
const TRANSFORM_KEYS = new Set(["desktop", "mobile", "tablet"]);
const TRANSFORM_VALUE_KEYS = new Set([
  "flipHorizontal",
  "flipVertical",
  "rotation",
]);
const SIZE_KEYS = new Set(["height", "width"]);
const TYPOGRAPHY_KEYS = new Set(["fontSize", "letterSpacing", "lineHeight"]);
const INTERACTION_KEYS = new Set([
  "analyticsActionKey",
  "ariaLabel",
  "disabled",
  "href",
  "kind",
  "target",
]);

export const inspectAtomicFactTree = (
  value: unknown
): AtomicFactViolation[] => {
  const violations: AtomicFactViolation[] = [];
  const ids = new Map<string, string>();
  const visitedNodes = new WeakSet<object>();

  const invalidNestedField = (
    path: string,
    type: PageFactComponentType,
    field: string,
    decision = "结构化字段包含未声明键。"
  ) =>
    violations.push({
      code: "invalid-prop",
      path,
      type,
      field,
      decision,
    });

  const validateRecordKeys = (
    value: unknown,
    allowed: ReadonlySet<string>,
    path: string,
    type: PageFactComponentType
  ) => {
    if (!isRecord(value)) {
      invalidNestedField(path, type, path.split(".").at(-1) ?? path);
      return;
    }
    Object.keys(value).forEach((key) => {
      if (!allowed.has(key)) invalidNestedField(`${path}.${key}`, type, key);
    });
  };

  const validateValue = (
    valid: boolean,
    path: string,
    type: PageFactComponentType,
    field: string,
    decision: string
  ) => {
    if (!valid) invalidNestedField(path, type, field, decision);
  };
  const finite = (candidate: unknown) =>
    typeof candidate === "number" && Number.isFinite(candidate);
  const validateFiniteFields = (
    candidate: unknown,
    fields: ReadonlySet<string>,
    path: string,
    type: PageFactComponentType,
    positiveFields = new Set<string>()
  ) => {
    if (!isRecord(candidate)) return;
    fields.forEach((field) => {
      if (candidate[field] === undefined) return;
      validateValue(
        finite(candidate[field]) &&
          (!positiveFields.has(field) || Number(candidate[field]) > 0),
        `${path}.${field}`,
        type,
        field,
        positiveFields.has(field)
          ? "几何尺寸必须是大于 0 的有限数。"
          : "几何值必须是有限数。"
      );
    });
  };
  const validateLayoutItemValues = (
    candidate: unknown,
    path: string,
    type: PageFactComponentType
  ) => {
    if (!isRecord(candidate)) return;
    (["widthMode", "heightMode"] as const).forEach((field) => {
      if (candidate[field] === undefined) return;
      validateValue(
        candidate[field] === "fixed" ||
          candidate[field] === "hug" ||
          candidate[field] === "fill",
        `${path}.${field}`,
        type,
        field,
        "尺寸方式必须是 fixed、hug 或 fill。"
      );
    });
    if (candidate.detached !== undefined) {
      validateValue(
        typeof candidate.detached === "boolean",
        `${path}.detached`,
        type,
        "detached",
        "detached 必须是布尔值。"
      );
    }
    (["columnSpan", "columnStart", "rowSpan", "rowStart"] as const).forEach(
      (field) => {
        if (candidate[field] === undefined) return;
        validateValue(
          finite(candidate[field]) &&
            Number.isInteger(candidate[field]) &&
            Number(candidate[field]) >= 1,
          `${path}.${field}`,
          type,
          field,
          "栅格位置和跨度必须是大于等于 1 的整数。"
        );
      }
    );
  };

  const validateStructuredProp = (
    field: string,
    value: unknown,
    path: string,
    type: PageFactComponentType
  ) => {
    const scanHiddenIdentity = (candidate: unknown, candidatePath: string) => {
      if (Array.isArray(candidate)) {
        candidate.forEach((item, index) =>
          scanHiddenIdentity(item, `${candidatePath}[${index}]`)
        );
        return;
      }
      if (!isRecord(candidate)) return;
      Object.entries(candidate).forEach(([key, child]) => {
        if (
          HIDDEN_IDENTITY_FIELDS.has(key) ||
          key.startsWith("slotPlaceholder") ||
          key.startsWith("sectionPadding")
        ) {
          invalidNestedField(
            `${candidatePath}.${key}`,
            type,
            key,
            "页面事实的嵌套结构不得携带模板、Recipe 或语义身份。"
          );
        }
        scanHiddenIdentity(child, `${candidatePath}.${key}`);
      });
    };
    scanHiddenIdentity(value, path);

    if (FILL_FIELDS.has(field)) {
      validateRecordKeys(value, FILL_KEYS, path, type);
      if (isRecord(value)) {
        if (value.enabled !== undefined) {
          validateValue(
            typeof value.enabled === "boolean",
            `${path}.enabled`,
            type,
            "enabled",
            "填充开关必须是布尔值。"
          );
        }
        if (value.mode !== undefined) {
          validateValue(
            (SURFACE_FILL_MODES as readonly unknown[]).includes(value.mode) ||
              value.mode === "gradient",
            `${path}.mode`,
            type,
            "mode",
            "填充模式必须是已支持的纯色、渐变或图片类型。"
          );
        }
        if (value.imageFit !== undefined) {
          validateValue(
            (SURFACE_IMAGE_FITS as readonly unknown[]).includes(value.imageFit) ||
              value.imageFit === "crop",
            `${path}.imageFit`,
            type,
            "imageFit",
            "图片适应方式必须是 cover、contain、stretch 或兼容的 crop。"
          );
        }
        ["color", "gradientFrom", "gradientTo", "imageUrl"].forEach((key) => {
          if (value[key] === undefined) return;
          validateValue(
            typeof value[key] === "string",
            `${path}.${key}`,
            type,
            key,
            "颜色或素材字段必须是字符串。"
          );
        });
        [
          "gradientAngle",
          "imagePositionX",
          "imagePositionY",
          "opacity",
        ].forEach((key) => {
          if (value[key] === undefined) return;
          validateValue(
            finite(value[key]),
            `${path}.${key}`,
            type,
            key,
            "填充数值必须是有限数。"
          );
        });
        if (value.gradientMirror !== undefined) {
          validateValue(
            typeof value.gradientMirror === "boolean",
            `${path}.gradientMirror`,
            type,
            "gradientMirror",
            "渐变镜像开关必须是布尔值。"
          );
        }
      }
      if (isRecord(value) && value.stops !== undefined) {
        if (!Array.isArray(value.stops)) {
          invalidNestedField(`${path}.stops`, type, "stops");
        } else {
          value.stops.forEach((stop, index) => {
            validateRecordKeys(
              stop,
              FILL_STOP_KEYS,
              `${path}.stops[${index}]`,
              type
            );
            if (!isRecord(stop)) return;
            if (stop.color !== undefined) {
              validateValue(
                typeof stop.color === "string",
                `${path}.stops[${index}].color`,
                type,
                "color",
                "渐变色必须是字符串。"
              );
            }
            ["opacity", "position"].forEach((key) => {
              if (stop[key] === undefined) return;
              validateValue(
                finite(stop[key]),
                `${path}.stops[${index}].${key}`,
                type,
                key,
                "渐变停靠点数值必须是有限数。"
              );
            });
          });
        }
      }
      if (isRecord(value) && value.imageOverlay !== undefined) {
        validateRecordKeys(
          value.imageOverlay,
          FILL_IMAGE_OVERLAY_KEYS,
          `${path}.imageOverlay`,
          type
        );
        if (isRecord(value.imageOverlay)) {
          if (value.imageOverlay.color !== undefined) {
            validateValue(
              typeof value.imageOverlay.color === "string",
              `${path}.imageOverlay.color`,
              type,
              "color",
              "叠加颜色必须是字符串。"
            );
          }
          if (value.imageOverlay.opacity !== undefined) {
            validateValue(
              finite(value.imageOverlay.opacity),
              `${path}.imageOverlay.opacity`,
              type,
              "opacity",
              "叠加透明度必须是有限数。"
            );
          }
        }
      }
      return;
    }
    if (field === "frame") {
      validateRecordKeys(value, RESPONSIVE_KEYS, path, type);
      if (isRecord(value)) {
        Object.entries(value).forEach(([device, frame]) => {
          validateRecordKeys(frame, FRAME_KEYS, `${path}.${device}`, type);
          validateFiniteFields(
            frame,
            FRAME_KEYS,
            `${path}.${device}`,
            type,
            new Set(["height", "width"])
          );
        });
      }
      return;
    }
    if (field === "layoutItem") {
      validateRecordKeys(value, LAYOUT_ITEM_KEYS, path, type);
      if (isRecord(value)) {
        validateLayoutItemValues(value, path, type);
        (["tablet", "mobile"] as const).forEach((device) => {
          if (value[device] !== undefined) {
            validateRecordKeys(
              value[device],
              LAYOUT_ITEM_DEVICE_KEYS,
              `${path}.${device}`,
              type
            );
            validateLayoutItemValues(value[device], `${path}.${device}`, type);
          }
        });
      }
      return;
    }
    if (field === "constraints") {
      validateRecordKeys(value, CONSTRAINT_KEYS, path, type);
      if (isRecord(value)) {
        const validateConstraintValues = (
          candidate: unknown,
          candidatePath: string
        ) => {
          if (!isRecord(candidate)) return;
          if (candidate.horizontal !== undefined) {
            validateValue(
              HORIZONTAL_CONSTRAINT_VALUES.has(candidate.horizontal as string),
              `${candidatePath}.horizontal`,
              type,
              "horizontal",
              "水平约束必须是 left、center、right、stretch 或 scale。"
            );
          }
          if (candidate.vertical !== undefined) {
            validateValue(
              VERTICAL_CONSTRAINT_VALUES.has(candidate.vertical as string),
              `${candidatePath}.vertical`,
              type,
              "vertical",
              "垂直约束必须是 top、center、bottom、stretch 或 scale。"
            );
          }
        };
        validateConstraintValues(value, path);
        (["tablet", "mobile"] as const).forEach((device) => {
          if (value[device] === undefined) return;
          validateRecordKeys(
            value[device],
            CONSTRAINT_DEVICE_KEYS,
            `${path}.${device}`,
            type
          );
          validateConstraintValues(value[device], `${path}.${device}`);
        });
      }
      return;
    }
    if (field === "effect") {
      inspectAtomicEffectFact(value).forEach((violation) =>
        invalidNestedField(
          violation.path === "effect"
            ? path
            : `${path}.${violation.path}`,
          type,
          String(violation.field),
          violation.decision
        )
      );
      return;
    }
    if (field === "shadow") {
      validateValue(
        typeof value === "string",
        path,
        type,
        "shadow",
        "Legacy shadow 只允许字符串兼容读取；任何新效果写入必须使用 effect。"
      );
      return;
    }
    if (field === "transform") {
      validateRecordKeys(value, TRANSFORM_KEYS, path, type);
      if (isRecord(value)) {
        Object.entries(value).forEach(([device, transform]) => {
          validateRecordKeys(
            transform,
            TRANSFORM_VALUE_KEYS,
            `${path}.${device}`,
            type
          );
          if (!isRecord(transform)) return;
          if (transform.rotation !== undefined) {
            validateValue(
              finite(transform.rotation),
              `${path}.${device}.rotation`,
              type,
              "rotation",
              "旋转角度必须是有限数。"
            );
          }
          (["flipHorizontal", "flipVertical"] as const).forEach((key) => {
            if (transform[key] === undefined) return;
            validateValue(
              typeof transform[key] === "boolean",
              `${path}.${device}.${key}`,
              type,
              key,
              "翻转状态必须是布尔值。"
            );
          });
        });
      }
      return;
    }
    if (field === "responsiveSize") {
      validateRecordKeys(value, RESPONSIVE_KEYS, path, type);
      if (isRecord(value)) {
        Object.entries(value).forEach(([device, size]) => {
          validateRecordKeys(size, SIZE_KEYS, `${path}.${device}`, type);
          validateFiniteFields(
            size,
            SIZE_KEYS,
            `${path}.${device}`,
            type,
            SIZE_KEYS
          );
        });
      }
      return;
    }
    if (field === "responsiveTypography") {
      validateRecordKeys(value, RESPONSIVE_KEYS, path, type);
      if (isRecord(value)) {
        Object.entries(value).forEach(([device, typography]) => {
          validateRecordKeys(
            typography,
            TYPOGRAPHY_KEYS,
            `${path}.${device}`,
            type
          );
          validateFiniteFields(
            typography,
            TYPOGRAPHY_KEYS,
            `${path}.${device}`,
            type
          );
        });
      }
      return;
    }
    if (field === "interaction") {
      validateRecordKeys(value, INTERACTION_KEYS, path, type);
      if (!isRecord(value)) return;
      validateValue(
        value.kind === "link",
        `${path}.kind`,
        type,
        "kind",
        "交互类型必须是 link。"
      );
      if (value.disabled !== undefined) {
        validateValue(
          typeof value.disabled === "boolean",
          `${path}.disabled`,
          type,
          "disabled",
          "disabled 必须是布尔值。"
        );
      }
      (["href", "ariaLabel", "analyticsActionKey"] as const).forEach((key) => {
        if (value[key] === undefined) return;
        validateValue(
          typeof value[key] === "string",
          `${path}.${key}`,
          type,
          key,
          `${key} 必须是字符串。`
        );
      });
      if (value.target !== undefined) {
        validateValue(
          value.target === "current" || value.target === "new",
          `${path}.target`,
          type,
          "target",
          "target 必须是 current 或 new。"
        );
      }
    }
  };

  const inspectNode = (candidate: unknown, path: string, nested: boolean) => {
    if (!isRecord(candidate) || typeof candidate.type !== "string") {
      violations.push({
        code: "unknown-type",
        path,
        type: "unknown",
        decision: "页面节点必须是七原子之一。",
      });
      return;
    }
    if (visitedNodes.has(candidate)) {
      violations.push({
        code: "invalid-child",
        path,
        type: candidate.type,
        decision:
          "页面事实树不能包含循环引用或在多个位置共享同一个节点对象。",
      });
      return;
    }
    visitedNodes.add(candidate);
    const type = candidate.type;
    if (!pageFactTypes.has(type)) {
      violations.push({
        code: "unknown-type",
        path,
        type,
        decision: "非七原子类型不能进入活动页面事实树。",
      });
      return;
    }
    if (nested && type === "BlankCanvas") {
      violations.push({
        code: "invalid-child",
        path,
        type,
        decision: "BlankCanvas 只能作为页面根节点，不能嵌套。",
      });
    }
    if (!nested && type !== "BlankCanvas") {
      violations.push({
        code: "invalid-root",
        path,
        type,
        decision: "页面 content 根节点必须是 BlankCanvas。",
      });
    }
    const props = candidate.props;
    if (!isRecord(props)) {
      violations.push({
        code: "missing-id",
        path: `${path}.props`,
        type,
        field: "id",
        decision: "原子节点必须拥有 Props 和页面内唯一 ID。",
      });
      return;
    }
    const id = typeof props.id === "string" ? props.id.trim() : "";
    if (!id) {
      violations.push({
        code: "missing-id",
        path: `${path}.props.id`,
        type,
        field: "id",
        decision: "原子节点必须拥有非空 ID。",
      });
    } else {
      const firstPath = ids.get(id);
      if (firstPath) {
        violations.push({
          code: "duplicate-id",
          path: `${path}.props.id`,
          type,
          field: "id",
          decision: `ID 已在 ${firstPath} 使用。`,
        });
      } else {
        ids.set(id, `${path}.props.id`);
      }
    }
    const allowlist = PAGE_FACT_PROP_ALLOWLISTS[type as PageFactComponentType];
    Object.keys(props).forEach((field) => {
      if (!allowlist.has(field)) {
        violations.push({
          code: "invalid-prop",
          path: `${path}.props.${field}`,
          type,
          field,
          decision: "字段不属于该原子的正式 Props allowlist。",
        });
        return;
      }
      if (field !== "items") {
        validateStructuredProp(
          field,
          props[field],
          `${path}.props.${field}`,
          type as PageFactComponentType
        );
      }
    });
    if (
      Object.prototype.hasOwnProperty.call(props, "effect") &&
      Object.prototype.hasOwnProperty.call(props, "shadow")
    ) {
      violations.push({
        code: "invalid-prop",
        path: `${path}.props.effect`,
        type,
        field: "effect",
        decision:
          "effect 与 legacy shadow 不能同时成为页面写入事实；首次 Effect 提交必须在同一事务中删除 shadow。",
      });
    }
    const items = props.items;
    if (items !== undefined && !Array.isArray(items)) {
      violations.push({
        code: "invalid-child",
        path: `${path}.props.items`,
        type,
        field: "items",
        decision: "items 存在时必须是子节点数组。",
      });
      return;
    }
    if (Array.isArray(items)) {
      if (type !== "BlankCanvas" && type !== "ContainerElement") {
        violations.push({
          code: "invalid-child",
          path: `${path}.props.items`,
          type,
          field: "items",
          decision: "只有 BlankCanvas 和 ContainerElement 可以包含子节点。",
        });
        return;
      }
      items.forEach((item, index) =>
        inspectNode(item, `${path}.props.items[${index}]`, true)
      );
    }
  };

  if (!isRecord(value)) {
    violations.push({
      code: "invalid-root",
      path: "root",
      type: "unknown",
      decision: "页面事实必须是包含唯一 BlankCanvas 根节点的数据对象。",
    });
    return violations;
  }
  if (!Array.isArray(value.content) || value.content.length !== 1) {
    violations.push({
      code: "invalid-root",
      path: "content",
      type: "unknown",
      decision: "页面 content 必须且只能包含一个 BlankCanvas 根节点。",
    });
  }
  if (Array.isArray(value.content)) {
    value.content.forEach((item, index) =>
      inspectNode(item, `content[${index}]`, false)
    );
  }
  if (!isRecord(value.zones)) {
    violations.push({
      code: "invalid-root",
      path: "zones",
      type: "unknown",
      decision:
        "原子事实树要求 zones 为对象；活动节点只能存在于 content/items。",
    });
  } else {
    Object.entries(value.zones).forEach(([zone, items]) => {
      if (!Array.isArray(items) || items.length === 0) return;
      violations.push({
        code: "invalid-root",
        path: `zones.${zone}`,
        type: "unknown",
        decision:
          "活动节点不得旁路到 zones；请使用 BlankCanvas/ContainerElement.items。",
      });
      items.forEach((item, index) =>
        inspectNode(item, `zones.${zone}[${index}]`, true)
      );
    });
  }
  return violations;
};

export class AtomicFactTreeError extends Error {
  readonly violations: AtomicFactViolation[];

  constructor(phase: string, violations: AtomicFactViolation[]) {
    super(
      `Atomic fact tree rejected during ${phase}: ${violations
        .map(({ path, decision }) => `${path}: ${decision}`)
        .join("; ")}`
    );
    this.name = "AtomicFactTreeError";
    this.violations = violations;
  }
}

export const assertAtomicFactTree = (value: unknown, phase: string) => {
  const violations = inspectAtomicFactTree(value);
  if (violations.length > 0) throw new AtomicFactTreeError(phase, violations);
};

/** Validate one editor mutation without weakening nested/root ownership rules. */
export const assertAtomicComponentFact = (
  type: unknown,
  props: unknown,
  phase = "store-mutation"
) => {
  const node = { type, props };
  const value =
    type === "BlankCanvas"
      ? { content: [node], zones: {} }
      : {
          content: [
            {
              type: "BlankCanvas",
              props: {
                id: "__atomic-mutation-boundary__",
                items: [node],
              },
            },
          ],
          zones: {},
        };
  assertAtomicFactTree(value, phase);
};
