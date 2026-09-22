import type { CanonicalModelEvent } from "../../../packages/model-protocol/contracts.js";
import type { ReadOnlyRunModelPort } from "../../../packages/agent-runtime/index.js";
import { loadDeploymentFilesystemConfiguration, startLoopbackDeploymentServer } from "./deployment-runtime.js";

const occurredAt = (): string => new Date().toISOString();
const cleanGitStatusFact = "Git 工作区干净，没有未提交修改。";

/**
 * This is deliberately not a provider emulator. It is an offline, deterministic
 * demonstration flow: exactly one read-only `git_status` call followed by a
 * fixed public-safe conclusion. It has no network transport or credential.
 */
const createFixtureModel = (): ReadOnlyRunModelPort => {
  return {
    next: async ({ modelStepId, messages }): Promise<readonly CanonicalModelEvent[]> => {
      const hasToolResult = messages.some((message) => message.role === "tool");
      const invocationId = `${modelStepId}:fixture-git-status`;
      if (!hasToolResult) return [
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 0, occurredAt: occurredAt(), kind: "assistant_text_delta", delta: "演示模式：正在只读检查 Git 状态。" },
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 1, occurredAt: occurredAt(), kind: "tool_call_started", invocationId, toolName: "git_status", providerToolCallId: invocationId },
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 2, occurredAt: occurredAt(), kind: "tool_arguments_delta", invocationId, delta: "{}" },
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 3, occurredAt: occurredAt(), kind: "tool_call_completed", invocationId, rawArguments: "{}" },
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 4, occurredAt: occurredAt(), kind: "model_step_completed", finishReason: "tool_calls" },
      ];
      const toolResult = messages.find((message) => message.role === "tool");
      if (toolResult?.content !== cleanGitStatusFact) throw new Error("fixture_clean_git_status_fact_missing");
      return [
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 0, occurredAt: occurredAt(), kind: "assistant_text_delta", delta: cleanGitStatusFact },
        { schemaVersion: "meliora.model-event.v1", modelStepId, streamIndex: 1, occurredAt: occurredAt(), kind: "model_step_completed", finishReason: "stop" },
      ];
    },
  };
};

async function main(): Promise<void> {
  const configuration = await loadDeploymentFilesystemConfiguration();
  process.stdout.write("Meliora fixture demonstration mode: no Provider configured; no paid request can be made.\n");
  startLoopbackDeploymentServer(configuration, createFixtureModel(), "fixture");
}

main().catch(() => {
  process.stderr.write("Meliora fixture API configuration or startup failed; check the non-secret filesystem settings.\n");
  process.exitCode = 1;
});
