export type ReferenceDesignComparableDomainV1 =
  | "color"
  | "typography"
  | "spacing"
  | "radius"
  | "shadow"
  | "surface";

export const REFERENCE_DESIGN_COMPARABLE_PROPERTY_DOMAINS_V1: Record<
  string,
  ReferenceDesignComparableDomainV1
> = {
  titleFontSize: "typography",
  titleFontWeight: "typography",
  titleLineHeight: "typography",
  titleLetterSpacing: "typography",
  bodyFontSize: "typography",
  bodyLineHeight: "typography",
  fontFamily: "typography",
  textColor: "color",
  paddingTop: "spacing",
  paddingRight: "spacing",
  paddingBottom: "spacing",
  paddingLeft: "spacing",
  backgroundColor: "surface",
  borderColor: "surface",
  borderRadius: "radius",
  boxShadow: "shadow",
};

export const referenceDesignComparableDomainForPropertyV1 = (
  property: string
) => REFERENCE_DESIGN_COMPARABLE_PROPERTY_DOMAINS_V1[property] || null;
