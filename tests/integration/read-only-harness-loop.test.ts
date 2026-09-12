import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";

import { deepseekStreamTextSingleToolFixture } from "../../fixtures/contracts/v1/deepseek-stream-text-single-tool";
import {
  ReadOnlyRunLoop,
  type ReadOnlyModelStepCheckpointGate,
  type ReadOnlyRunIds,
} from "../../packages/agent-runtime/read-only-run-loop";
import type { CanonicalModelEvent } from "../../packages/model-protocol/contracts";
import { MemorySessionStore } from "../../packages/session-store/memory-session-store";
import {
  createReadOnlyWorkspaceTools,
  type PrivateToolArtifactWriter,
  type ServerOwnedReadOnlyToolProjector,
} from "../../packages/tool-runtime/read-only-workspace-tools";
import type { ToolCatalogSnapshot } from "../../packages/tool-runtime/contracts";
import { NodeWorkspaceHost } from "../../packages/workspace-host/node-workspace-host";

const fixedNow = "2026-09-10T10:00:00.000Z";
const workspaceId = "workspace-read-only-integration";
const privateArtifactId = "artifact-private-real-workspace-read";
const publicArtifactId = "artifact-public-safe-read-summary";
const workspaceMarker = "MELIORA_REAL_WORKSPACE_MARKER";
const privateSecret = "API_KEY=private-real-workspace-secret";
const safeProjection = "已核验真实工作区目标文件；文件原文仅保存在私有证据中。";

let idSequence = 0;
const ids = (): ReadOnlyRunIds => ({
  nextModelStepId: () => `model-step-integration-${++idSequence}`,
  nextEventId: () => `event-integration-${++idSequence}`,
  nextReceiptId: () => `receipt-integration-${++idSequence}`,
  nextOutcomeId: () => `outcome-integration-${++idSequence}`,
});

const contentHash = (content: Uint8Array): string => createHash("sha256").update(content).digest("hex");
const execFileAsync = promisify(execFile);

const temporaryParent = await mkdtemp(join(tmpdir(), "meliora-read-only-loop-"));
const workspaceRoot = join(temporaryParent, "真实工作区");

try {
  const sourcePath = join(workspaceRoot, "packages", "agent-runtime", "run-state.ts");
  const sourceContent = [
    `export const fixture = \"${workspaceMarker}\";`,
    `export const secret = \"${privateSecret}\";`,
    "",
  ].join("\n");
  await mkdir(join(workspaceRoot, "packages", "agent-runtime"), { recursive: true });
  await writeFile(sourcePath, sourceContent, "utf8");
  await execFileAsync("git", ["init", "--quiet"], { cwd: workspaceRoot });

  const store = new MemorySessionStore({ clock: () => new Date(fixedNow) });
  const privateWriter: PrivateToolArtifactWriter = {
    writePrivate: async (input) => {
      const reference = await store.putArtifact({
        artifactId: privateArtifactId,
        contentHash: input.contentHash,
        mediaType: input.mediaType,
        content: input.content,
        visibility: "private",
        metadata: input.metadata,
        createdAt: fixedNow,
      });
      assert.equal(reference.visibility, "private");
      return { artifactId: reference.artifactId, visibility: "private" };
    },
  };
  const host = new NodeWorkspaceHost({ [workspaceId]: workspaceRoot });
  const tools = createReadOnlyWorkspaceTools({
    host,
    workspaceId,
    artifacts: privateWriter,
    nextVerificationId: () => "verification-real-workspace-read",
  });

  const projector: ServerOwnedReadOnlyToolProjector = {
    project: async ({ execution }) => {
      assert.equal(execution.status, "succeeded");
      assert.equal(execution.outputArtifactId, privateArtifactId);
      const privateArtifact = await store.getArtifact(privateArtifactId);
      assert.ok(privateArtifact, "the actual Node host output must be retained as a private artifact");
      assert.equal(privateArtifact.visibility, "private");
      const privateContent = new TextDecoder().decode(privateArtifact.content);
      assert.equal(privateContent, sourceContent, "the tool must have read the real temporary workspace file");

      const publicContent = new TextEncoder().encode(safeProjection);
      await store.putArtifact({
        artifactId: publicArtifactId,
        contentHash: contentHash(publicContent),
        mediaType: "text/plain",
        content: publicContent,
        visibility: "public",
        createdAt: fixedNow,
        metadata: { source: "server-owned-safe-projection" },
      });
      return {
        modelContent: safeProjection,
        publicSummary: safeProjection,
        publicArtifactIds: [publicArtifactId],
        publicVerificationArtifactIds: [publicArtifactId],
      };
    },
  };

  const catalog: ToolCatalogSnapshot = {
    schemaVersion: "meliora.tool-catalog.v1",
    catalogVersion: "read-only-integration-v1",
    catalogHash: "catalog-read-only-integration-v1",
    definitions: tools.definitions,
  };
  let modelCalls = 0;
  let checkpointStarts = 0;
  const modelStepCheckpoint: ReadOnlyModelStepCheckpointGate = {
    start: async (input) => {
      checkpointStarts += 1;
      const requestFingerprint = contentHash(new TextEncoder().encode(JSON.stringify({
        messages: input.messages,
        catalogHash: input.catalog.catalogHash,
      })));
      return { kind: "started", requestFingerprint };
    },
    finish: async () => ({ kind: "committed" }),
  };
  const loop = new ReadOnlyRunLoop({
    store,
    modelStepCheckpoint,
    model: {
      next: async ({ modelStepId, messages }) => {
        modelCalls += 1;
        assert.equal(checkpointStarts, modelCalls, "Provider calls must follow durable Model Step checkpoints");
        if (modelCalls === 1) {
          assert.deepEqual(messages, [{ role: "user", content: "读取真实工作区入口文件" }]);
          return deepseekStreamTextSingleToolFixture.expectedEvents.map((event) => ({ ...event, modelStepId }));
        }
        assert.equal(modelCalls, 2, "the fixture model should receive one provider follow-up after the tool receipt");
        assert.deepEqual(messages.at(-1), {
          role: "tool",
          invocationId: "invocation-deepseek-0-0",
          content: safeProjection,
        });
        return [{
          schemaVersion: "meliora.model-event.v1",
          modelStepId,
          streamIndex: 0,
          occurredAt: fixedNow,
          kind: "assistant_text_delta",
          delta: "入口文件已读取并完成可验证核验。",
        }, {
          schemaVersion: "meliora.model-event.v1",
          modelStepId,
          streamIndex: 1,
          occurredAt: fixedNow,
          kind: "model_step_completed",
          finishReason: "stop",
        }] satisfies readonly CanonicalModelEvent[];
      },
    },
    tools,
    ids: ids(),
    now: () => fixedNow,
    hashArguments: (argumentsValue) => contentHash(new TextEncoder().encode(JSON.stringify(argumentsValue))),
    projectToolResult: (input) => projector.project(input),
    projectAssistantText: ({ content }) => content,
    isPublicArtifact: async (artifactId) => (await store.getArtifact(artifactId))?.visibility === "public",
    ownerId: "integration-worker",
    leaseTtlMs: 60_000,
    policyVersion: "integration-policy-v1",
    principalId: "integration-user",
  });

  const result = await loop.run({
    sessionId: "session-read-only-integration",
    workspaceId,
    turnId: "turn-read-only-integration",
    runId: "run-read-only-integration",
    attemptId: "attempt-read-only-integration",
    intentRevision: 1,
    catalog,
    userMessage: "读取真实工作区入口文件",
  });

  assert.equal(modelCalls, 2, "model -> tool -> provider follow-up must complete");
  assert.equal(result.outcome.status, "completed");
  assert.equal(result.outcome.receiptRefs.length, 1);
  assert.deepEqual(result.outcome.evidenceRefs, [publicArtifactId]);
  assert.deepEqual(result.outcome.verificationRefs, ["verification-real-workspace-read"]);

  const receipt = await store.readReceipt({
    runId: "run-read-only-integration",
    attemptId: "attempt-read-only-integration",
    receiptId: result.outcome.receiptRefs[0]!,
  });
  assert.ok(receipt, "the outcome must only be accepted after a durable receipt exists");
  assert.equal(receipt.status, "succeeded");
  assert.equal(receipt.outputArtifactId, publicArtifactId, "receipt must reference only server-owned public evidence");
  assert.deepEqual(receipt.verificationArtifactIds, [publicArtifactId]);

  const privateArtifact = await store.getArtifact(privateArtifactId);
  assert.ok(privateArtifact);
  assert.equal(privateArtifact.visibility, "private");
  const publicArtifact = await store.getArtifact(publicArtifactId);
  assert.ok(publicArtifact);
  assert.equal(publicArtifact.visibility, "public");
  const publicArtifactContent = new TextDecoder().decode(publicArtifact.content);
  assert.equal(publicArtifactContent, safeProjection);

  const storedEvents = await store.readEvents({ runId: "run-read-only-integration", limit: 100 });
  const publicStoredEvents = storedEvents.events.filter((event) => event.visibility === "public");
  assert.ok(publicStoredEvents.length > 0);
  assert.ok(result.publicEvents.every((event) => event.schemaVersion === "meliora.public-run-event.v1" && event.visibility === "public"));
  assert.ok(result.publicEvents.some((event) => event.kind === "tool_result_presented"));
  assert.ok(result.publicEvents.some((event) => event.kind === "verification_updated"));
  assert.equal(result.publicEvents.at(-1)?.kind, "run_completed");

  const publicSurface = JSON.stringify({
    outcome: result.outcome,
    publicEvents: result.publicEvents,
    publicStoredEvents,
    receipt,
    publicArtifactContent,
  });
  for (const forbiddenValue of [sourceContent, workspaceMarker, privateSecret, privateArtifactId]) {
    assert.equal(publicSurface.includes(forbiddenValue), false, "private workspace evidence must not leak into public contracts");
  }

  console.log(JSON.stringify({
    gate: "meliora-m0-read-only-harness-loop-integration",
    status: "PASS",
    scenarios: ["real-node-workspace", "private-artifact", "safe-public-projection", "durable-receipt", "provider-follow-up", "completed-outcome"],
  }));
} finally {
  await rm(temporaryParent, { recursive: true, force: true, maxRetries: 3 });
}
