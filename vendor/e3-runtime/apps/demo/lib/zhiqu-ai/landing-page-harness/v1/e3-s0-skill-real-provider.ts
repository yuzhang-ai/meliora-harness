import { createHarnessModelProvider } from "../../harness/model-provider";
import {
  B2LocalProviderAttemptLedgerV1,
  HarnessProviderActorAdapterV1,
} from "./provider-adapter";
import type {
  E3S0SkillFinalAnswerProviderV1,
  E3S0SkillModelOutputV1,
} from "./e3-s0-skill-final-answer";
import { hashCanonicalJsonV1 } from "./strict-json";

export const E3_S0_SKILL_REAL_PROVIDER_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-real-provider-v1",
  maximumProviderAttempts: 1,
  hiddenRetry: false,
  secretProjection: "forbidden",
} as const);

export type E3S0SkillRealProviderV1 = E3S0SkillFinalAnswerProviderV1 &
  Readonly<{
    attemptSnapshot: () => ReturnType<B2LocalProviderAttemptLedgerV1["snapshot"]>;
  }>;

/**
 * E3-owned adapter around the existing governed MiniMax transport.  The local
 * attempt ledger rejects attempt index > 0, so a transient response cannot be
 * followed by a hidden network retry.  Credentials remain captured inside the
 * existing provider and are never included in this adapter's identity or
 * output.
 */
export const createE3S0SkillRealProviderV1 = (): E3S0SkillRealProviderV1 => {
  // The adapter is reused by the three independently admitted A4 runs.  Each
  // invocation is still restricted to attemptIndex=0 by the ledger; the total
  // capacity merely records those three separate single-attempt runs.
  const attemptLedger = new B2LocalProviderAttemptLedgerV1(3);
  const actor = new HarnessProviderActorAdapterV1(createHarnessModelProvider(), {
    b2AttemptLedger: attemptLedger,
    totalAttemptBudgetMs: 300_000,
  });
  const providerBindingHash = hashCanonicalJsonV1({
    contractVersion: E3_S0_SKILL_REAL_PROVIDER_V1.contractVersion,
    modelRuntimeBinding: actor.modelRuntimeBinding,
    maximumProviderAttempts: 1,
  });
  return Object.freeze({
    modelIdentity: actor.modelIdentity,
    providerBindingHash,
    maximumProviderAttempts: 1 as const,
    attemptSnapshot: () => attemptLedger.snapshot(),
    completeFinalAnswerV1: async (
      input: Parameters<E3S0SkillFinalAnswerProviderV1["completeFinalAnswerV1"]>[0]
    ): Promise<E3S0SkillModelOutputV1> => {
      const actorRequestHash = hashCanonicalJsonV1({
        runId: input.runId,
        lifecycleKind: input.lifecycleKind,
        messages: input.messages,
        tools: input.tools,
      });
      const actorCallId = `e3-real-provider-call:${input.runId}`;
      const output = await actor.completeTurn({
        messages: input.messages,
        tools: input.tools,
        executionEvidence: {
          authorityKind: "h1-runtime-admission-v1",
          workerId: "e3-s0-real-provider-worker",
          runId: input.runId,
          actorCallId,
          actorBindingHash: hashCanonicalJsonV1({ actorCallId, providerBindingHash }),
          actorRequestHash,
          catalogBindingHash: hashCanonicalJsonV1(input.tools),
        },
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      if (input.lifecycleKind === "unavailable") {
        if (output.toolCalls.length !== 0) {
          throw new Error("e3_real_provider_unavailable_tool_call_invalid");
        }
        if (!output.content.trim()) {
          throw new Error("e3_real_provider_unavailable_content_missing");
        }
        if (output.finishReason !== "stop") {
          throw new Error("e3_real_provider_unavailable_finish_invalid");
        }
        return Object.freeze({
          content: output.content,
          finishReason: output.finishReason === "stop" ? "stop" : output.finishReason,
          lifecycleDecision: "report_unavailable" as const,
          toolCalls: Object.freeze([]),
        }) as E3S0SkillModelOutputV1;
      }
      if (output.toolCalls.length !== 1) {
        throw new Error("e3_real_provider_tool_call_count_invalid");
      }
      const call = output.toolCalls[0]!;
      let argumentsValue: unknown;
      try {
        argumentsValue = JSON.parse(call.argumentsJson);
      } catch {
        throw new Error("e3_real_provider_tool_arguments_json_invalid");
      }
      if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
        throw new Error("e3_real_provider_tool_arguments_shape_invalid");
      }
      if (Object.keys(argumentsValue).length !== 2) {
        throw new Error("e3_real_provider_tool_arguments_key_count_invalid");
      }
      if (
        (argumentsValue as { contractVersion?: unknown }).contractVersion !==
        "h1-effective-facts-canvas-inspect-request-v1"
      ) {
        throw new Error("e3_real_provider_tool_arguments_version_invalid");
      }
      if (!['summary', 'selection'].includes(String((argumentsValue as { scope?: unknown }).scope))) {
        throw new Error("e3_real_provider_tool_arguments_scope_invalid");
      }
      return Object.freeze({
        content: output.content,
        finishReason: output.finishReason === "tool_calls" ? "tool_calls" : output.finishReason,
        lifecycleDecision: "request_read" as const,
        toolCalls: Object.freeze(output.toolCalls),
      }) as E3S0SkillModelOutputV1;
    },
  });
};
