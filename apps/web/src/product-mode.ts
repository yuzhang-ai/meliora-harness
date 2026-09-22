const WORKSPACE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/u;

export type ProductModeConfiguration = Readonly<{
  enabled: boolean;
  workspaceId: string;
  workspaceLabel: string;
}>;

export function resolveProductMode(environment: Readonly<Record<string, string | undefined>>): ProductModeConfiguration {
  const enabled = environment.VITE_MELIORA_PRODUCT_MODE === "public";
  const candidate = environment.VITE_MELIORA_WORKSPACE_ID?.trim() ?? "";
  const workspaceId = WORKSPACE_ID.test(candidate) ? candidate : "";
  const label = environment.VITE_MELIORA_WORKSPACE_LABEL?.trim().slice(0, 80) || "Meliora 源码工作区";
  return { enabled, workspaceId, workspaceLabel: label };
}
