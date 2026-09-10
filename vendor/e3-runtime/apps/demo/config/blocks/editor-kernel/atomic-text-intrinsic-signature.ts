import type { AtomicLayoutDevice } from "./atomic-layout-authored-values";

type UnknownRecord = Readonly<Record<string, unknown>>;

const record = (value: unknown): UnknownRecord =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};

const inheritedTypographyValue = (
  props: UnknownRecord,
  device: AtomicLayoutDevice,
  field: "fontSize" | "fontWeight" | "letterSpacing" | "lineHeight"
) => {
  const responsive = record(props.responsiveTypography);
  const tablet = record(responsive.tablet);
  const mobile = record(responsive.mobile);
  if (device === "desktop") return props[field] ?? null;
  if (device === "tablet") return tablet[field] ?? props[field] ?? null;
  return mobile[field] ?? tablet[field] ?? props[field] ?? null;
};

/**
 * Stable authored signature shared by the graph-side measurement plan and the
 * rendered TextBox surface. A matching signature plus matching live text is
 * required before DOM geometry can be bound to an AtomicDocument pointer.
 */
export const resolveAtomicTextIntrinsicSourceSignature = ({
  device,
  props,
}: {
  device: AtomicLayoutDevice;
  props: UnknownRecord;
}) =>
  JSON.stringify({
    device,
    fontFamily: props.fontFamily ?? null,
    fontSize: inheritedTypographyValue(props, device, "fontSize"),
    fontStyle: props.fontStyle ?? "normal",
    fontWeight: inheritedTypographyValue(props, device, "fontWeight"),
    href: typeof props.href === "string" && props.href.length > 0,
    letterSpacing: inheritedTypographyValue(props, device, "letterSpacing"),
    lineHeight: inheritedTypographyValue(props, device, "lineHeight"),
    overflow: props.overflow ?? "hidden",
    semanticTag: props.semanticTag ?? "p",
    text: typeof props.text === "string" ? props.text : "",
    textAlign: props.textAlign ?? "left",
    textDecoration: props.textDecoration ?? "none",
    verticalAlign: props.verticalAlign ?? "top",
    version: 1,
  });
