import type { ActorMessageV1 } from "./model-port";
import type { ToolDescriptorV1 } from "./tools";
import { hashCanonicalJsonV1, requiredHashV1, requiredModelIdentityV1 } from "./strict-json";

export const E3_S0_SKILL_FINAL_ANSWER_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-final-answer-v1",
  phase: "final-answer",
  maximumProviderAttempts: 1,
  realProviderCalls: 0,
  canvasWrite: false,
} as const);

export type E3S0SkillModelOutputV1 = Readonly<{
  content: string;
  finishReason: "stop" | "tool_calls";
  lifecycleDecision: "request_read" | "report_unavailable";
  toolCalls: readonly Readonly<{
    callId: string;
    toolId: string;
    argumentsJson: string;
  }>[];
}>;

export interface E3S0SkillFinalAnswerProviderV1 {
  readonly modelIdentity: string;
  readonly providerBindingHash: string;
  readonly maximumProviderAttempts: 1;
  completeFinalAnswerV1(input: Readonly<{
    runId: string;
    messages: readonly ActorMessageV1[];
    tools: readonly ToolDescriptorV1[];
    lifecycleKind: "active" | "unavailable";
    abortSignal?: AbortSignal;
  }>): Promise<E3S0SkillModelOutputV1>;
}

export const assertE3S0SkillFinalAnswerProviderV1 = (
  provider: E3S0SkillFinalAnswerProviderV1
) => {
  if (provider.maximumProviderAttempts !== 1) {
    throw new Error("e3_skill_provider_attempt_policy_invalid");
  }
  requiredModelIdentityV1(provider.modelIdentity, "e3SkillProvider.modelIdentity");
  requiredHashV1(provider.providerBindingHash, "e3SkillProvider.providerBindingHash");
  return Object.freeze({
    modelIdentity: provider.modelIdentity,
    providerBindingHash: provider.providerBindingHash,
    providerIdentityHash: hashCanonicalJsonV1({
      modelIdentity: provider.modelIdentity,
      providerBindingHash: provider.providerBindingHash,
      maximumProviderAttempts: provider.maximumProviderAttempts,
    }),
  });
};
