/** The only component identities allowed in newly persisted page trees. */
export const PAGE_FACT_COMPONENT_TYPES = [
  "BlankCanvas",
  "ContainerElement",
  "TextBox",
  "ImageElement",
  "VideoElement",
  "ShapeElement",
  "IconElement",
] as const;

export type PageFactComponentType =
  (typeof PAGE_FACT_COMPONENT_TYPES)[number];

export const NESTED_PAGE_FACT_COMPONENT_TYPES = PAGE_FACT_COMPONENT_TYPES.filter(
  (type) => type !== "BlankCanvas"
);

export const isPageFactComponentType = (
  value: unknown
): value is PageFactComponentType =>
  typeof value === "string" &&
  PAGE_FACT_COMPONENT_TYPES.includes(value as PageFactComponentType);
