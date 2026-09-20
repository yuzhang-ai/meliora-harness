export type LocalProvider = "deepseek" | "kimi";

const officialEndpoints: Readonly<Record<LocalProvider, string>> = {
  deepseek: "https://api.deepseek.com/chat/completions",
  kimi: "https://api.moonshot.cn/v1/chat/completions",
};

export function resolveLocalProviderEndpoint(
  provider: LocalProvider,
  gatewayBaseUrl?: string,
  trustedOrigin?: string,
): Readonly<{ endpoint: string; trustedEndpointOrigins: readonly string[] }> {
  if (gatewayBaseUrl === undefined && trustedOrigin === undefined) {
    return { endpoint: officialEndpoints[provider], trustedEndpointOrigins: [] };
  }
  if (!gatewayBaseUrl || !trustedOrigin) throw new Error("Gateway base URL and trusted origin must be configured together.");

  let base: URL;
  let trust: URL;
  try {
    base = new URL(gatewayBaseUrl);
    trust = new URL(trustedOrigin);
  } catch {
    throw new Error("Invalid gateway URL configuration.");
  }
  if (
    base.protocol !== "https:" || base.username || base.password || base.search || base.hash ||
    trust.protocol !== "https:" || trust.username || trust.password || trust.search || trust.hash ||
    trust.pathname !== "/" || base.origin !== trust.origin || gatewayBaseUrl.includes("%") ||
    base.pathname.endsWith("/chat/completions") || !/^\/(?:[A-Za-z0-9._~-]+\/?)*$/u.test(base.pathname)
  ) {
    throw new Error("Invalid gateway URL configuration.");
  }
  const path = `${base.pathname.replace(/\/$/u, "")}/chat/completions`;
  return { endpoint: new URL(path, base.origin).toString(), trustedEndpointOrigins: [trust.origin] };
}
