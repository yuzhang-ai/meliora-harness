export type LinkTarget = "current" | "new";

export const getSafeLinkHref = (value?: string) => {
  const href = typeof value === "string" ? value.trim() : "";

  if (!href) return "";
  if (href.startsWith("#")) return href;
  if (href.startsWith("/") && !href.startsWith("//")) return href;

  try {
    const url = new URL(href);

    return ["https:", "mailto:", "tel:"].includes(url.protocol) ? href : "";
  } catch {
    return "";
  }
};

export const getSafeMediaUrl = (value?: string) => {
  const mediaUrl = typeof value === "string" ? value.trim() : "";

  if (!mediaUrl) return "";
  if (mediaUrl.startsWith("/") && !mediaUrl.startsWith("//")) return mediaUrl;

  try {
    const url = new URL(mediaUrl);

    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
};

export const getLinkTargetProps = (target?: LinkTarget, isEditing = false) =>
  target === "new" && !isEditing
    ? ({ target: "_blank", rel: "noopener noreferrer" } as const)
    : {};
