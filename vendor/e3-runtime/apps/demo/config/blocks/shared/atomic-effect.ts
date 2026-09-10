export const ATOMIC_EFFECT_TYPES = [
  "outer-shadow",
  "inner-shadow",
  "layer-blur",
  "background-blur",
] as const;

export type AtomicEffectType = (typeof ATOMIC_EFFECT_TYPES)[number];

export type AtomicEffectV1 = Readonly<{
  version: 1;
  enabled: boolean;
  type: AtomicEffectType;
  x: number;
  y: number;
  blur: number;
  spread: number;
  color: string;
  opacity: number;
}>;

export type AtomicEffectFactViolation = Readonly<{
  field: keyof AtomicEffectV1 | "effect";
  path: string;
  decision: string;
}>;

export type AtomicEffectSourceResolution =
  | Readonly<{ kind: "none"; effect: null }>
  | Readonly<{ kind: "structured"; effect: AtomicEffectV1 }>
  | Readonly<{ kind: "legacy"; effect: AtomicEffectV1; shadow: string }>
  | Readonly<{
      kind: "unsupported-legacy";
      effect: null;
      reason: string;
      shadow: string;
    }>
  | Readonly<{
      kind: "invalid";
      effect: null;
      reason: "dual-authority" | "invalid-effect";
    }>;

const effectTypes = new Set<string>(ATOMIC_EFFECT_TYPES);
const effectKeys = new Set<keyof AtomicEffectV1>([
  "version",
  "enabled",
  "type",
  "x",
  "y",
  "blur",
  "spread",
  "color",
  "opacity",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);
const inRange = (value: unknown, min: number, max: number) =>
  finite(value) && value >= min && value <= max;

export const inspectAtomicEffectFact = (
  value: unknown
): readonly AtomicEffectFactViolation[] => {
  const violations: AtomicEffectFactViolation[] = [];
  const invalid = (
    field: AtomicEffectFactViolation["field"],
    decision: string
  ) => violations.push({ field, path: String(field), decision });
  if (!isRecord(value)) {
    invalid("effect", "Effect 必须是单层结构化对象。");
    return violations;
  }
  Object.keys(value).forEach((key) => {
    if (!effectKeys.has(key as keyof AtomicEffectV1)) {
      violations.push({
        field: "effect",
        path: key,
        decision: "Effect 包含未声明字段；一期不支持多层 Stack 或排序。",
      });
    }
  });
  effectKeys.forEach((key) => {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      invalid(key, `Effect 缺少必填字段 ${key}。`);
    }
  });
  if (value.version !== 1) invalid("version", "Effect 版本必须为 1。");
  if (typeof value.enabled !== "boolean") {
    invalid("enabled", "Effect 显示状态必须是布尔值。");
  }
  if (!effectTypes.has(String(value.type))) {
    invalid(
      "type",
      "Effect 类型必须是 outer-shadow、inner-shadow、layer-blur 或 background-blur。"
    );
  }
  if (!inRange(value.x, -128, 128)) {
    invalid("x", "Effect X 必须是 -128 到 128 的有限数。");
  }
  if (!inRange(value.y, -128, 128)) {
    invalid("y", "Effect Y 必须是 -128 到 128 的有限数。");
  }
  if (!inRange(value.blur, 0, 64)) {
    invalid("blur", "Effect Blur 必须是 0 到 64 的有限数。");
  }
  if (!inRange(value.spread, -64, 64)) {
    invalid("spread", "Effect Spread 必须是 -64 到 64 的有限数。");
  }
  if (typeof value.color !== "string" || !/^#[0-9A-F]{6}$/u.test(value.color)) {
    invalid("color", "Effect 颜色必须是规范化的大写 #RRGGBB。");
  }
  if (!inRange(value.opacity, 0, 1)) {
    invalid("opacity", "Effect 透明度必须是 0 到 1 的有限数。");
  }
  if (value.type === "layer-blur" || value.type === "background-blur") {
    if (value.x !== 0) invalid("x", "Blur Effect 的 X 必须为 0。");
    if (value.y !== 0) invalid("y", "Blur Effect 的 Y 必须为 0。");
    if (value.spread !== 0) {
      invalid("spread", "Blur Effect 的 Spread 必须为 0。");
    }
    if (value.color !== "#000000") {
      invalid("color", "Blur Effect 的惰性颜色必须为 #000000。");
    }
    if (value.opacity !== 1) {
      invalid("opacity", "Blur Effect 的惰性透明度必须为 1。");
    }
  }
  return violations;
};

export const isAtomicEffectV1 = (value: unknown): value is AtomicEffectV1 =>
  inspectAtomicEffectFact(value).length === 0;

const toHex = (value: number) =>
  Math.round(value).toString(16).padStart(2, "0").toUpperCase();

const parseLegacyColor = (
  value: string
): Readonly<{ color: string; opacity: number }> | null => {
  const color = value.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu.exec(color);
  if (hex) {
    const raw = hex[1]!;
    const expanded =
      raw.length <= 4
        ? raw
            .split("")
            .map((digit) => `${digit}${digit}`)
            .join("")
        : raw;
    return {
      color: `#${expanded.slice(0, 6).toUpperCase()}`,
      opacity:
        expanded.length === 8
          ? Number.parseInt(expanded.slice(6), 16) / 255
          : 1,
    };
  }
  const rgb =
    /^rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)(?:\s*,\s*(\d*\.?\d+))?\s*\)$/iu.exec(
      color
    );
  if (!rgb) return null;
  const channels = rgb.slice(1, 4).map(Number);
  const opacity = rgb[4] === undefined ? 1 : Number(rgb[4]);
  if (
    channels.some(
      (channel) =>
        !Number.isFinite(channel) || channel < 0 || channel > 255
    ) ||
    !Number.isFinite(opacity) ||
    opacity < 0 ||
    opacity > 1
  ) {
    return null;
  }
  return {
    color: `#${channels.map(toHex).join("")}`,
    opacity,
  };
};

const hasTopLevelComma = (value: string) => {
  let depth = 0;
  for (const character of value) {
    if (character === "(") depth += 1;
    else if (character === ")") depth -= 1;
    else if (character === "," && depth === 0) return true;
    if (depth < 0) return true;
  }
  return depth !== 0;
};

export const parseLegacyAtomicShadow = (
  input: unknown
): AtomicEffectSourceResolution => {
  if (typeof input !== "string") {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "Legacy shadow 必须是字符串。",
      shadow: String(input ?? ""),
    };
  }
  const shadow = input.trim();
  if (!shadow || shadow.toLowerCase() === "none") {
    return { kind: "none", effect: null };
  }
  if (hasTopLevelComma(shadow)) {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "一期不自动迁移多层 Legacy shadow。",
      shadow,
    };
  }
  const insetMatches = shadow.match(/\binset\b/giu) ?? [];
  if (insetMatches.length > 1) {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "Legacy shadow 包含重复 inset 标记。",
      shadow,
    };
  }
  const normalized = shadow.replace(/\binset\b/giu, " ").trim();
  const match =
    /^(-?\d+(?:\.\d+)?)(px)?\s+(-?\d+(?:\.\d+)?)(px)?\s+(\d+(?:\.\d+)?)(px)?(?:\s+(-?\d+(?:\.\d+)?)(px)?)?\s+(.+)$/iu.exec(
      normalized
    );
  if (!match) {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "Legacy shadow 语法无法无损转换。",
      shadow,
    };
  }
  const lengths = [
    { number: Number(match[1]), unit: match[2] },
    { number: Number(match[3]), unit: match[4] },
    { number: Number(match[5]), unit: match[6] },
    ...(match[7] === undefined
      ? []
      : [{ number: Number(match[7]), unit: match[8] }]),
  ];
  if (
    lengths.some(
      ({ number, unit }) =>
        !Number.isFinite(number) || (number !== 0 && unit !== "px")
    )
  ) {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "Legacy shadow 的非零长度必须使用 px。",
      shadow,
    };
  }
  const parsedColor = parseLegacyColor(match[9]!);
  if (!parsedColor) {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "Legacy shadow 颜色无法无损转换。",
      shadow,
    };
  }
  const effect: AtomicEffectV1 = {
    version: 1,
    enabled: true,
    type: insetMatches.length === 1 ? "inner-shadow" : "outer-shadow",
    x: Number(match[1]),
    y: Number(match[3]),
    blur: Number(match[5]),
    spread: match[7] === undefined ? 0 : Number(match[7]),
    color: parsedColor.color,
    opacity: parsedColor.opacity,
  };
  if (!isAtomicEffectV1(effect)) {
    return {
      kind: "unsupported-legacy",
      effect: null,
      reason: "Legacy shadow 超出 C2 Effect 安全边界。",
      shadow,
    };
  }
  return { kind: "legacy", effect, shadow };
};

export const resolveAtomicEffectSource = (
  props: Readonly<Record<string, unknown>>
): AtomicEffectSourceResolution => {
  const hasEffect = Object.prototype.hasOwnProperty.call(props, "effect");
  const hasShadow = Object.prototype.hasOwnProperty.call(props, "shadow");
  if (hasEffect && hasShadow) {
    return { kind: "invalid", effect: null, reason: "dual-authority" };
  }
  if (hasEffect) {
    return isAtomicEffectV1(props.effect)
      ? { kind: "structured", effect: props.effect }
      : { kind: "invalid", effect: null, reason: "invalid-effect" };
  }
  if (hasShadow) return parseLegacyAtomicShadow(props.shadow);
  return { kind: "none", effect: null };
};
