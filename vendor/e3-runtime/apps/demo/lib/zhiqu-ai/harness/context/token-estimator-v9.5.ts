import type { ModelMessage, ToolDefinition } from "../contracts";

export const CONTEXT_TOKEN_ESTIMATOR_CONTRACT_V95 =
  "context-token-estimator-v9.5-r1" as const;

const finiteNonNegativeInteger = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.ceil(value)
    : null;

export const projectContextTokenEstimateV95 = (input: {
  serialized: string;
  providerReportedInputTokens?: number | null;
}) => {
  const utf8Bytes = Buffer.byteLength(input.serialized, "utf8");
  const legacyCharacterEstimate = Math.ceil(input.serialized.length / 4);
  // The local fallback is deliberately conservative for mixed Chinese, emoji
  // and JSON. A completed Provider usage fact remains authoritative even when
  // it is lower than this pre-request capacity projection.
  const conservativeUtf8Estimate = Math.max(
    legacyCharacterEstimate,
    Math.ceil(utf8Bytes / 3)
  );
  const providerReportedInputTokens = finiteNonNegativeInteger(
    input.providerReportedInputTokens
  );
  return {
    contractVersion: CONTEXT_TOKEN_ESTIMATOR_CONTRACT_V95,
    tokenCount:
      providerReportedInputTokens === null
        ? conservativeUtf8Estimate
        : providerReportedInputTokens,
    source:
      providerReportedInputTokens === null
        ? ("utf8_bytes_conservative" as const)
        : ("provider_reported" as const),
    utf8Bytes,
    utf16CodeUnits: input.serialized.length,
    legacyCharacterEstimate,
    conservativeUtf8Estimate,
    providerReportedInputTokens,
  } as const;
};

export const projectHarnessContextTokenEstimateV95 = (input: {
  messages: ModelMessage[];
  tools?: ToolDefinition[];
  providerReportedInputTokens?: number | null;
}) =>
  projectContextTokenEstimateV95({
    serialized: JSON.stringify({
      messages: input.messages,
      tools: input.tools || [],
    }),
    providerReportedInputTokens: input.providerReportedInputTokens,
  });
