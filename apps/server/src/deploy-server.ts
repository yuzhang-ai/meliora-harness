import { createDeepSeekChatTransport, createKimiChatTransport } from "../../../packages/providers/index.js";
import { resolveLocalProviderEndpoint } from "./local-provider-config.js";
import { loadDeploymentFilesystemConfiguration, startLoopbackDeploymentServer } from "./deployment-runtime.js";
import { createFrozenReadOnlyWorkspaceCatalog, createProviderBackedReadOnlyRunModel } from "./turn-command-composition.js";

const required = (name: string): string => {
  const value = process.env[name];
  if (!value?.trim()) throw new Error(`Missing ${name}.`);
  return value;
};

async function main(): Promise<void> {
  const configuration = await loadDeploymentFilesystemConfiguration();
  const provider = required("MELIORA_PROVIDER");
  if (provider !== "deepseek" && provider !== "kimi") throw new Error("Provider must be deepseek or kimi.");
  const modelName = required("MELIORA_MODEL");
  const apiKey = required("MELIORA_API_KEY");
  const maxOutputTokens = process.env.MELIORA_MAX_OUTPUT_TOKENS === undefined
    ? undefined
    : Number(required("MELIORA_MAX_OUTPUT_TOKENS"));
  const { endpoint, trustedEndpointOrigins } = resolveLocalProviderEndpoint(
    provider,
    process.env.MELIORA_GATEWAY_BASE_URL,
    process.env.MELIORA_TRUSTED_PROVIDER_ORIGIN,
  );
  const transport = provider === "deepseek"
    ? createDeepSeekChatTransport({ endpoint, model: modelName, apiKey, trustedEndpointOrigins, maxOutputTokens })
    : createKimiChatTransport({ endpoint, model: modelName, apiKey, trustedEndpointOrigins, maxOutputTokens });
  const model = createProviderBackedReadOnlyRunModel({
    provider,
    transport,
    catalog: createFrozenReadOnlyWorkspaceCatalog(),
    now: () => new Date().toISOString(),
  });
  startLoopbackDeploymentServer(configuration, model, "provider");
}

main().catch(() => {
  // Do not echo paths, provider failures, URLs, or environment values.
  process.stderr.write("Meliora deployment API configuration or startup failed; check the restricted environment file.\n");
  process.exitCode = 1;
});
