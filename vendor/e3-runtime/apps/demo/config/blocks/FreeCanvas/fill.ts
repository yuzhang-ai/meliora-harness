import type { CSSProperties } from "react";

export const SURFACE_FILL_MODES = ["angular", "diamond", "image", "linear", "radial", "solid"] as const;
export type SurfaceFillMode = (typeof SURFACE_FILL_MODES)[number];

export type SurfaceGradientStop = {
  color: string;
  id: string;
  opacity: number;
  position: number;
};

export const SURFACE_IMAGE_FITS = ["contain", "cover", "stretch"] as const;
export type SurfaceImageFit = (typeof SURFACE_IMAGE_FITS)[number];

export type SurfaceImageOverlay = {
  color: string;
  opacity: number;
};

export type SurfaceFill = {
  color: string;
  enabled: boolean;
  gradientAngle: number;
  gradientMirror: boolean;
  gradientFrom: string;
  gradientTo: string;
  imageFit: SurfaceImageFit;
  imageOverlay?: SurfaceImageOverlay;
  imagePositionX: number;
  imagePositionY: number;
  imageUrl: string;
  mode: SurfaceFillMode;
  opacity: number;
  stops: SurfaceGradientStop[];
};

export const createDefaultSurfaceFill = (
  enabled: boolean,
  color = "#FFFFFF"
): SurfaceFill => ({
  color,
  enabled,
  gradientAngle: 135,
  gradientMirror: false,
  gradientFrom: color,
  gradientTo: "#FFE3DC",
  imageFit: "cover",
  imageOverlay: {
    color: "#000000",
    opacity: 0,
  },
  imagePositionX: 50,
  imagePositionY: 50,
  imageUrl: "",
  mode: "solid",
  opacity: 100,
  stops: [
    { color, id: "start", opacity: 100, position: 0 },
    { color: "#FFE3DC", id: "end", opacity: 100, position: 100 },
  ],
});

const finite = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const resolveSurfaceFill = (
  value: unknown,
  legacyBackgroundColor: unknown,
  fallbackColor = "#FFFFFF"
): SurfaceFill => {
  const legacyColor =
    typeof legacyBackgroundColor === "string"
      ? legacyBackgroundColor
      : fallbackColor;
  const legacySolidColor =
    legacyColor === "transparent" || legacyColor === "rgba(0, 0, 0, 0)"
      ? fallbackColor
      : legacyColor;
  const source =
    value && typeof value === "object"
      ? (value as Partial<SurfaceFill>)
      : undefined;
  const sourceMode = String(source?.mode ?? "solid");
  const mode: SurfaceFillMode =
    sourceMode === "gradient"
      ? "linear"
      : ["angular", "diamond", "image", "linear", "radial"].includes(sourceMode)
      ? (sourceMode as SurfaceFillMode)
      : "solid";
  const sourceStops = Array.isArray(source?.stops) ? source.stops : [];
  const sourceImageOverlay =
    source?.imageOverlay && typeof source.imageOverlay === "object"
      ? source.imageOverlay
      : undefined;
  const stops = (
    sourceStops.length >= 2 && sourceMode !== "gradient"
      ? sourceStops
      : [
          {
            color:
              typeof source?.gradientFrom === "string"
                ? source.gradientFrom
                : legacySolidColor,
            id: "start",
            opacity: 100,
            position: 0,
          },
          {
            color:
              typeof source?.gradientTo === "string"
                ? source.gradientTo
                : "#FFE3DC",
            id: "end",
            opacity: 100,
            position: 100,
          },
        ]
  )
    .map((stop, index) => ({
      color: typeof stop?.color === "string" ? stop.color : "#FFFFFF",
      id: typeof stop?.id === "string" ? stop.id : `stop-${index}`,
      opacity: Math.max(0, Math.min(100, finite(stop?.opacity, 100))),
      position: Math.max(0, Math.min(100, finite(stop?.position, index * 100))),
    }))
    .sort((a, b) => a.position - b.position);
  return {
    ...createDefaultSurfaceFill(
      source?.enabled ?? legacyColor !== "transparent",
      typeof source?.color === "string" ? source.color : legacySolidColor
    ),
    ...source,
    enabled: source?.enabled ?? legacyColor !== "transparent",
    gradientAngle: Math.max(
      0,
      Math.min(360, finite(source?.gradientAngle, 135))
    ),
    gradientMirror: source?.gradientMirror === true,
    imageFit:
      source?.imageFit === "contain" || source?.imageFit === "stretch"
        ? source.imageFit
        : "cover",
    imageOverlay: {
      color:
        typeof sourceImageOverlay?.color === "string" &&
        /^#[0-9a-f]{6}$/i.test(sourceImageOverlay.color)
          ? sourceImageOverlay.color
          : "#000000",
      opacity: Math.max(
        0,
        Math.min(100, finite(sourceImageOverlay?.opacity, 0))
      ),
    },
    imagePositionX: Math.max(
      0,
      Math.min(100, finite(source?.imagePositionX, 50))
    ),
    imagePositionY: Math.max(
      0,
      Math.min(100, finite(source?.imagePositionY, 50))
    ),
    mode,
    opacity: Math.max(0, Math.min(100, finite(source?.opacity, 100))),
    stops,
  };
};

export const getSurfaceFillAcceptanceAttributes = (
  value: unknown,
  legacyColor: unknown,
  fallbackColor = "#FFFFFF"
) => {
  const fill = resolveSurfaceFill(value, legacyColor, fallbackColor);
  return {
    "data-surface-fill-color": fill.color.toUpperCase(),
    "data-surface-fill-enabled": fill.enabled ? "true" : "false",
    "data-surface-fill-mode": fill.mode,
    "data-surface-fill-opacity": String(fill.opacity),
  };
};

const colorWithAlpha = (color: string, opacity: number) => {
  if (opacity >= 100) return color;
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return color;
  const value = match[1];
  return `rgba(${Number.parseInt(value.slice(0, 2), 16)}, ${Number.parseInt(
    value.slice(2, 4),
    16
  )}, ${Number.parseInt(value.slice(4, 6), 16)}, ${Math.max(
    0,
    Math.min(1, opacity / 100)
  )})`;
};

const getGradientImage = (fill: SurfaceFill) => {
  const renderedStops = fill.gradientMirror
    ? [
        ...fill.stops.map((stop) => ({
          ...stop,
          position: stop.position / 2,
        })),
        ...[...fill.stops].reverse().map((stop) => ({
          ...stop,
          id: `${stop.id}-mirror`,
          position: 100 - stop.position / 2,
        })),
      ]
    : fill.stops;
  if (fill.mode === "diamond") return getDiamondGradientImage(fill, renderedStops);
  const stops = renderedStops
    .map(
      (stop) =>
        `${colorWithAlpha(stop.color, (stop.opacity * fill.opacity) / 100)} ${
          stop.position
        }%`
    )
    .join(", ");
  if (fill.mode === "radial") return `radial-gradient(circle, ${stops})`;
  if (fill.mode === "angular")
    return `conic-gradient(from ${fill.gradientAngle}deg, ${stops})`;
  return `linear-gradient(${fill.gradientAngle}deg, ${stops})`;
};

type GradientSampleStop = Pick<
  SurfaceGradientStop,
  "color" | "opacity" | "position"
>;

const hexToRgbChannels = (color: string): [number, number, number] => {
  const match = color.match(/^#([0-9a-f]{6})$/i);
  if (!match) return [255, 255, 255];
  return [
    Number.parseInt(match[1].slice(0, 2), 16),
    Number.parseInt(match[1].slice(2, 4), 16),
    Number.parseInt(match[1].slice(4, 6), 16),
  ];
};

// 按位置在渐变停靠点之间做 RGBA 插值，供菱形渐变的逐层采样使用。
const sampleGradientStops = (
  stops: GradientSampleStop[],
  overallOpacity: number,
  position: number
) => {
  const ordered = [...stops].sort((a, b) => a.position - b.position);
  const first = ordered[0] ?? { color: "#FFFFFF", opacity: 100, position: 0 };
  const last =
    ordered[ordered.length - 1] ?? { color: "#FFFFFF", opacity: 100, position: 100 };
  if (position <= first.position) {
    const [r, g, b] = hexToRgbChannels(first.color);
    return { a: (first.opacity * overallOpacity) / 10000, b, g, r };
  }
  if (position >= last.position) {
    const [r, g, b] = hexToRgbChannels(last.color);
    return { a: (last.opacity * overallOpacity) / 10000, b, g, r };
  }
  let left = first;
  let right = last;
  for (let index = 0; index < ordered.length - 1; index += 1) {
    if (
      position >= ordered[index].position &&
      position <= ordered[index + 1].position
    ) {
      left = ordered[index];
      right = ordered[index + 1];
      break;
    }
  }
  const span = Math.max(1e-6, right.position - left.position);
  const ratio = (position - left.position) / span;
  const leftRgb = hexToRgbChannels(left.color);
  const rightRgb = hexToRgbChannels(right.color);
  const lerp = (a: number, b: number) => Math.round(a + (b - a) * ratio);
  return {
    a: ((left.opacity + (right.opacity - left.opacity) * ratio) * overallOpacity) / 10000,
    b: lerp(leftRgb[2], rightRgb[2]),
    g: lerp(leftRgb[1], rightRgb[1]),
    r: lerp(leftRgb[0], rightRgb[0]),
  };
};

// CSS 没有原生菱形渐变（旧的 conic +45° 只是角度渐变的偏移，视觉上
// 没有菱形轮廓）。这里生成一张多层嵌套菱形 polygon 的 SVG data URI：
// 100% 落在盒边中点，四角钳制为末端停靠点颜色，随元素宽高比拉伸，
// 与 Figma / Pixso 的菱形渐变观感一致。
const getDiamondGradientImage = (
  fill: SurfaceFill,
  renderedStops: GradientSampleStop[]
) => {
  const layers = 48;
  const maxScale = 1.5;
  const polygons: string[] = [];
  for (let layer = layers; layer >= 0; layer -= 1) {
    const scale = (layer / layers) * maxScale;
    const radius = scale * 50;
    const sample = sampleGradientStops(
      renderedStops,
      fill.opacity,
      Math.min(100, scale * 100)
    );
    const points = `50,${50 - radius} ${50 + radius},50 50,${50 + radius} ${
      50 - radius
    },50`;
    polygons.push(
      `<polygon points="${points}" fill="rgba(${sample.r},${sample.g},${
        sample.b
      },${Number(sample.a.toFixed(3))})"/>`
    );
  }
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">` +
    `<g transform="rotate(${fill.gradientAngle} 50 50)">` +
    polygons.join("") +
    `</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
};

export const getSurfaceFillStyle = (
  value: unknown,
  legacyBackgroundColor: unknown,
  fallbackColor = "#FFFFFF"
): CSSProperties => {
  const fill = resolveSurfaceFill(value, legacyBackgroundColor, fallbackColor);
  if (!fill.enabled) {
    return { backgroundColor: "transparent", backgroundImage: "none" };
  }
  if (["angular", "diamond", "linear", "radial"].includes(fill.mode)) {
    return {
      backgroundColor: colorWithAlpha(
        fill.stops[0]?.color ?? fill.gradientFrom,
        fill.opacity
      ),
      backgroundImage: getGradientImage(fill),
    };
  }
  if (fill.mode === "image" && fill.imageUrl) {
    return {
      backgroundColor: "transparent",
      backgroundImage: "none",
    };
  }
  return {
    backgroundColor: colorWithAlpha(fill.color, fill.opacity),
    backgroundImage: "none",
  };
};

export const getSurfaceFillImageLayerStyle = (
  value: unknown,
  legacyBackgroundColor: unknown,
  fallbackColor = "#FFFFFF"
): CSSProperties | null => {
  const fill = resolveSurfaceFill(value, legacyBackgroundColor, fallbackColor);
  if (!fill.enabled || fill.mode !== "image" || !fill.imageUrl) return null;
  const overlayColor = colorWithAlpha(
    fill.imageOverlay?.color ?? "#000000",
    fill.imageOverlay?.opacity ?? 0
  );
  const imageLayer = `url(${JSON.stringify(fill.imageUrl)})`;
  const backgroundImage =
    (fill.imageOverlay?.opacity ?? 0) > 0
      ? `linear-gradient(${overlayColor}, ${overlayColor}), ${imageLayer}`
      : imageLayer;
  return {
    backgroundColor: fill.color,
    backgroundImage,
    backgroundPosition: `${fill.imagePositionX}% ${fill.imagePositionY}%`,
    backgroundRepeat: "no-repeat",
    backgroundSize: fill.imageFit === "stretch" ? "100% 100%" : fill.imageFit,
    opacity: fill.opacity / 100,
  };
};

export const getTextFillStyle = (
  value: unknown,
  legacyColor: unknown,
  fallbackColor = "#000000"
): CSSProperties => {
  const fill = resolveSurfaceFill(value, legacyColor, fallbackColor);
  if (!fill.enabled) {
    return {
      backgroundImage: "none",
      color: "transparent",
    };
  }
  if (fill.mode === "solid") {
    return {
      backgroundImage: "none",
      color: colorWithAlpha(fill.color, fill.opacity),
    };
  }
  const imageStyle = getSurfaceFillImageLayerStyle(fill, fallbackColor);
  const backgroundImage =
    fill.mode === "image"
      ? imageStyle?.backgroundImage ?? "none"
      : getGradientImage(fill);
  return {
    backgroundClip: "text",
    backgroundColor: "transparent",
    backgroundImage,
    backgroundPosition: imageStyle?.backgroundPosition,
    backgroundRepeat: imageStyle?.backgroundRepeat,
    backgroundSize: imageStyle?.backgroundSize,
    color: "transparent",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
  };
};
