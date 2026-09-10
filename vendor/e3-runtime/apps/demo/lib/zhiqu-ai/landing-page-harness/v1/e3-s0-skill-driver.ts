import { E3S0SkillAdmissionServiceV1, type E3S0AdmissionInputV1 } from "./e3-s0-skill-admission-service";
import {
  assertE3S0SkillFinalAnswerProviderV1,
  type E3S0SkillFinalAnswerProviderV1,
  type E3S0SkillModelOutputV1,
} from "./e3-s0-skill-final-answer";
import { composeE3S0SkillPromptV1 } from "./e3-s0-skill-prompt-composition";
import { authorizeE3S0CanvasInspectV1 } from "./e3-s0-skill-tool-runtime";
import { E3_S0_SKILL_PACKAGE_V1 } from "./e3-s0-skill-package";
import { resolveE3S0SkillSelectionV1 } from "./e3-s0-skill-selection";
import { EFFECTIVE_FACTS_CANVAS_INSPECT_V1 } from "./effective-facts-canvas-inspect";
import { H1_RUNTIME_TOOL_DESCRIPTORS_V1 } from "./h1-runtime-authority";
import { SqliteE3S0SkillLedgerV1 } from "./sqlite-e3-s0-skill-ledger";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredIdV1,
  requiredStringV1,
} from "./strict-json";

export const E3_S0_SKILL_DRIVER_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-driver-v1",
  phase: "E3-A3",
  directedByRunId: true,
  candidatePolling: false,
  realProviderCalls: 0,
  browser: false,
  canvasWrite: false,
} as const);

const canvasInspectDescriptor = (() => {
  const descriptor = H1_RUNTIME_TOOL_DESCRIPTORS_V1.find(
    (tool) => tool.toolId === "canvas_inspect"
  );
  if (!descriptor || descriptor.effect !== "read_only") {
    throw new Error("e3_skill_driver_canvas_inspect_descriptor_missing");
  }
  return descriptor;
})();

const decodeOutput = (
  output: E3S0SkillModelOutputV1,
  lifecycleKind: "active" | "unavailable"
) => {
  const content = lifecycleKind === "active" && output.content === ""
    ? ""
    : requiredStringV1(output.content, "e3SkillDriver.output.content", 32_768);
  if (lifecycleKind === "unavailable") {
    if (
      output.lifecycleDecision !== "report_unavailable" ||
      output.finishReason !== "stop" ||
      output.toolCalls.length !== 0 ||
      content.length === 0
    ) throw new Error("e3_skill_driver_unavailable_rewritten");
    return Object.freeze({ ...output, content, toolCalls: Object.freeze([]) });
  }
  if (
    output.lifecycleDecision !== "request_read" ||
    output.finishReason !== "tool_calls" ||
    output.toolCalls.length !== 1 ||
    output.toolCalls[0]?.toolId !== "canvas_inspect"
  ) throw new Error("e3_skill_driver_active_output_invalid");
  const call = output.toolCalls[0]!;
  requiredIdV1(call.callId, "e3SkillDriver.output.callId");
  let argumentsValue: unknown;
  try {
    argumentsValue = JSON.parse(call.argumentsJson) as unknown;
  } catch {
    throw new Error("e3_skill_driver_tool_arguments_invalid");
  }
  if (
    !argumentsValue ||
    typeof argumentsValue !== "object" ||
    Array.isArray(argumentsValue) ||
    Object.keys(argumentsValue).length !== 2 ||
    (argumentsValue as { contractVersion?: string }).contractVersion !==
      EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion ||
    !["summary", "selection"].includes((argumentsValue as { scope?: string }).scope ?? "")
  ) throw new Error("e3_skill_driver_tool_arguments_invalid");
  return Object.freeze({
    ...output,
    content,
    toolCalls: Object.freeze([{ ...call, argumentsJson: canonicalJsonV1(argumentsValue) }]),
  });
};

const publicFailureCode = (error: unknown) =>
  error instanceof Error && /^[a-z0-9_:-]{1,120}$/.test(error.message)
    ? error.message
    : "e3_skill_provider_failed";

export class E3S0SkillDriverV1 {
  private readonly admission: E3S0SkillAdmissionServiceV1;

  constructor(
    private readonly store: SqliteE3S0SkillLedgerV1,
    private readonly provider: E3S0SkillFinalAnswerProviderV1,
    private readonly clock: () => number = Date.now
  ) {
    this.admission = new E3S0SkillAdmissionServiceV1(store);
    assertE3S0SkillFinalAnswerProviderV1(provider);
  }

  async run(input: Readonly<{
    request: E3S0AdmissionInputV1;
    revisionBinding: string;
    abortSignal?: AbortSignal;
  }>) {
    resolveE3S0SkillSelectionV1({
      source: input.request.source,
      skillId: E3_S0_SKILL_PACKAGE_V1.skillId,
      skillVersion: E3_S0_SKILL_PACKAGE_V1.skillVersion,
    });
    const now = this.clock();
    if (
      !Number.isFinite(now) ||
      now < Date.parse(input.request.issuedAt) ||
      now >= Date.parse(input.request.expiresAt)
    ) throw new Error("e3_skill_driver_authority_expired");
    const admitted = this.admission.admit(input.request);
    if (admitted.kind !== "active" && admitted.kind !== "unavailable") {
      throw new Error(`e3_skill_driver_admission_${admitted.kind}`);
    }
    const composition = composeE3S0SkillPromptV1({
      request: input.request,
      admitted,
      modelIdentity: this.provider.modelIdentity,
      revisionBinding: input.revisionBinding,
    });
    const tools = admitted.kind === "active" ? [canvasInspectDescriptor] : [];
    const requestMaterial = Object.freeze({
      contractVersion: "formal-r3-e3-s0-provider-request-v1",
      phase: "final-answer",
      lifecycleKind: admitted.kind,
      modelIdentity: this.provider.modelIdentity,
      providerBindingHash: this.provider.providerBindingHash,
      promptManifestHash: composition.promptCompositionManifest.manifestHash,
      executionAdmissionHash: composition.executionAdmission.admissionHash,
      systemPromptHash: composition.systemPromptHash,
      messages: composition.messages,
      tools,
    });
    const requestJson = canonicalJsonV1(requestMaterial);
    const requestHash = hashUtf8V1(requestJson);
    const modelCallBindingHash = hashCanonicalJsonV1({
      phase: "final-answer",
      compositionCallBindingHash: composition.callBindingHash,
      providerBindingHash: this.provider.providerBindingHash,
      requestHash,
    });
    const reservation = this.store.beginModelCall({
      runId: input.request.runId,
      phase: "final-answer",
      bindingHash: modelCallBindingHash,
    });
    if (reservation.kind === "completed") {
      const terminal = this.store.readModelCall(input.request.runId, "final-answer");
      if (
        !terminal?.responseJson ||
        terminal.bindingHash !== modelCallBindingHash ||
        terminal.modelIdentity !== this.provider.modelIdentity ||
        terminal.providerBindingHash !== this.provider.providerBindingHash ||
        terminal.promptManifestHash !== composition.promptCompositionManifest.manifestHash ||
        terminal.systemPromptHash !== composition.systemPromptHash ||
        terminal.requestHash !== requestHash
      ) {
        throw new Error("e3_skill_model_call_replay_terminal_missing");
      }
      const output = decodeOutput(
        JSON.parse(terminal.responseJson) as E3S0SkillModelOutputV1,
        admitted.kind
      );
      return Object.freeze({
        kind: admitted.kind,
        replayed: true,
        admitted,
        composition,
        output,
        terminal,
      });
    }
    if (reservation.kind !== "owner") {
      throw new Error(`e3_skill_model_call_${reservation.kind}`);
    }
    try {
      const rawOutput = await this.provider.completeFinalAnswerV1({
        runId: input.request.runId,
        messages: composition.messages,
        tools,
        lifecycleKind: admitted.kind,
        ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
      });
      const output = decodeOutput(rawOutput, admitted.kind);
      if (admitted.kind === "active") {
        const call = output.toolCalls[0]!;
        authorizeE3S0CanvasInspectV1({
          store: this.store,
          plan: admitted.candidate.resolutionPlan,
          activationReceipt: admitted.activationReceipt,
          callId: call.callId,
          requestId: input.request.requestId,
          idempotencyKey: `tool-${call.callId}`,
          scope: (JSON.parse(call.argumentsJson) as { scope: "summary" | "selection" }).scope,
          now: input.request.issuedAt,
        });
      }
      const responseJson = canonicalJsonV1(output);
      const terminal = this.store.settleModelCall({
        runId: input.request.runId,
        phase: "final-answer",
        bindingHash: modelCallBindingHash,
        ownerToken: reservation.ownerToken,
        state: "completed",
        modelIdentity: this.provider.modelIdentity,
        providerBindingHash: this.provider.providerBindingHash,
        promptManifestHash: composition.promptCompositionManifest.manifestHash,
        systemPromptHash: composition.systemPromptHash,
        requestHash,
        responseHash: hashUtf8V1(responseJson),
        responseJson,
        publicErrorCode: null,
      });
      return Object.freeze({ kind: admitted.kind, replayed: false, admitted, composition, output, terminal });
    } catch (error) {
      this.store.settleModelCall({
        runId: input.request.runId,
        phase: "final-answer",
        bindingHash: modelCallBindingHash,
        ownerToken: reservation.ownerToken,
        state: "failed",
        modelIdentity: this.provider.modelIdentity,
        providerBindingHash: this.provider.providerBindingHash,
        promptManifestHash: composition.promptCompositionManifest.manifestHash,
        systemPromptHash: composition.systemPromptHash,
        requestHash,
        responseHash: null,
        responseJson: null,
        publicErrorCode: publicFailureCode(error),
      });
      throw error;
    }
  }
}
