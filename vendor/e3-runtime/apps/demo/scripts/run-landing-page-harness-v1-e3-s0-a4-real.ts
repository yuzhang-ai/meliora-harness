import assert from "node:assert/strict";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  realpathSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

import type { E3S0AdmissionInputV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-admission-service";
import { createE3S0SkillRealProviderV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-real-provider";
import { createE3S0SkillRunnerCompositionV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-runner-composition";
import { ActorProviderErrorV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/model-port";
import {
  createAuthoritativePublicLifecycleEventV1,
  type PublicLifecycleSourceV1,
} from "../lib/zhiqu-ai/landing-page-harness/v1/authority-fabric-public-projection";
import { canonicalJsonV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/strict-json";

let stage = "preflight";

const fail = (code: string): never => {
  throw new Error(code);
};
const privateDirectory = (value: string) => {
  if (!existsSync(value)) mkdirSync(value, { mode: 0o700 });
  const stat = lstatSync(value);
  if (
    stat.isSymbolicLink() ||
    !stat.isDirectory() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0
  ) fail("e3_a4_private_directory_invalid");
  return realpathSync(value);
};
const privateFile = (value: string) => {
  const stat = lstatSync(value);
  if (
    stat.isSymbolicLink() ||
    !stat.isFile() ||
    stat.uid !== process.getuid?.() ||
    (stat.mode & 0o077) !== 0 ||
    stat.size < 1 ||
    stat.size > 32_768
  ) fail("e3_a4_private_file_invalid");
  return realpathSync(value);
};
const primaryCredential = (source: string) => {
  const content = readFileSync(source, "utf8");
  const sections = content
    .split(/^## /m)
    .slice(1)
    .filter((part) => /^primary\b/iu.test(part));
  if (sections.length !== 1) fail("e3_a4_primary_section_invalid");
  const fenced = [...sections[0]!.matchAll(/```[^\n]*\n([\s\S]*?)```/gu)]
    .map((match) => match[1]!.trim())
    .filter((value) => /^[A-Za-z0-9_.-]{20,}$/u.test(value));
  const pasted =
    sections[0]!.match(
      /(?<![A-Za-z0-9_-])(?:sk-[A-Za-z0-9_-]{12,}|eyJ[A-Za-z0-9_.-]{20,})/gu
    ) || [];
  const candidates = new Set([...fenced, ...pasted]);
  if (candidates.size !== 1) fail("e3_a4_primary_credential_invalid");
  return [...candidates][0]!;
};

const request = (
  suffix: string,
  source: "user_explicit" | "actor_selected",
  available: boolean,
  now: number
): E3S0AdmissionInputV1 => ({
  runId: `run-e3-s0-a4-${suffix}-${randomUUID()}`,
  turnId: `turn-e3-s0-a4-${suffix}-${randomUUID()}`,
  requestId: `request-e3-s0-a4-${suffix}-${randomUUID()}`,
  actorId: `actor-e3-s0-a4-${suffix}`,
  sessionId: `session-e3-s0-a4-${suffix}`,
  source,
  available,
  userGoal: available
    ? "Read the current page facts with canvas_inspect, then plan the fixed SaaS demo booking page. Call the available read tool exactly once with arguments exactly {\"contractVersion\":\"h1-effective-facts-canvas-inspect-request-v1\",\"scope\":\"summary\"}; do not add any other argument key."
    : "Report that the requested repo Skill is unavailable. Do not claim any page read or mutation.",
  issuedAt: new Date(now - 1_000).toISOString(),
  expiresAt: new Date(now + 10 * 60_000).toISOString(),
});

async function main() {
  process.umask(0o077);
  stage = "private_root";
  const base = privateDirectory(
    join(
      privateDirectory(join(homedir(), ".codex", "private")),
      "ai-landing-page-harness"
    )
  );
  stage = "provider_source";
  const source = privateFile(join(base, "provider-input.md"));
  stage = "credential_shape";
  process.env.ZHIQU_AGENT_MODEL_PROFILE = "primary";
  const credential = primaryCredential(source);
  process.env.ZHIQU_AGENT_PRIMARY_MODEL_API_KEY = credential;
  stage = "provider_composition";
  const provider = createE3S0SkillRealProviderV1();
  const now = Date.now();
  const revisionBinding = "f".repeat(64);
  stage = "runner_composition";
  let composition = createE3S0SkillRunnerCompositionV1({
    privateRoot: base,
    provider,
  });
  stage = "user_explicit";
  const explicitRequest = request("explicit", "user_explicit", true, now);
  const explicit = await composition.driver.run({
    request: explicitRequest,
    revisionBinding,
  });
  assert.equal(explicit.kind, "active");
  assert.equal(explicit.output.lifecycleDecision, "request_read");
  assert.equal(explicit.output.toolCalls[0]?.toolId, "canvas_inspect");
  composition.close();

  composition = createE3S0SkillRunnerCompositionV1({
    privateRoot: base,
    provider,
  });
  stage = "restart_replay";
  const replay = await composition.driver.run({
    request: explicitRequest,
    revisionBinding,
  });
  assert.equal(replay.replayed, true);
  stage = "actor_selected";
  const actorRequest = request("actor", "actor_selected", true, Date.now());
  const actor = await composition.driver.run({
    request: actorRequest,
    revisionBinding,
  });
  assert.equal(actor.kind, "active");
  stage = "skill_unavailable";
  const unavailableRequest = request("unavailable", "actor_selected", false, Date.now());
  const unavailable = await composition.driver.run({
    request: unavailableRequest,
    revisionBinding,
  });
  stage = "assert_unavailable_kind";
  assert.equal(unavailable.kind, "unavailable");
  stage = "assert_unavailable_decision";
  assert.equal(unavailable.output.lifecycleDecision, "report_unavailable");
  stage = "assert_unavailable_tools";
  assert.equal(unavailable.output.toolCalls.length, 0);

  stage = "public_projection_readback";
  const projected: string[] = [];
  const project = (sourceMaterial: PublicLifecycleSourceV1, runId: string, turnId: string) => {
    const event = createAuthoritativePublicLifecycleEventV1({
      source: sourceMaterial,
      context: { runId, turnId },
      authority: {
        resolveSource: () => sourceMaterial,
        verifyRunContext: ({ source: resolved, runId: expectedRunId, turnId: expectedTurnId }) =>
          expectedRunId === runId &&
          expectedTurnId === turnId &&
          (resolved.kind === "skill_activation"
            ? resolved.receipt.runId === expectedRunId
            : resolved.kind === "unavailable" &&
              resolved.fact.runId === expectedRunId &&
              resolved.fact.turnId === expectedTurnId),
        verifyThreadContext: () => false,
      },
    });
    projected.push(canonicalJsonV1(event));
  };
  if (explicit.kind !== "active" || actor.kind !== "active" || unavailable.kind !== "unavailable") {
    throw new Error("e3_a4_projection_source_missing");
  }
  project({ kind: "skill_activation", receipt: explicit.admitted.activationReceipt }, explicitRequest.runId, explicitRequest.turnId);
  project({ kind: "skill_activation", receipt: actor.admitted.activationReceipt }, actorRequest.runId, actorRequest.turnId);
  project({ kind: "unavailable", fact: unavailable.admitted.fact }, unavailableRequest.runId, unavailableRequest.turnId);
  const publicProjectionJson = `[${projected.join(",")}]`;
  const secretProjected = publicProjectionJson.includes(credential);
  assert.equal(secretProjected, false);
  composition.close();

  stage = "assert_attempts";
  const attempts = provider.attemptSnapshot();
  assert.equal(attempts.consumedAttempts, 3);
  assert.ok(attempts.attempts.every((attempt) => attempt.attemptIndex === 0));
  console.log(
    JSON.stringify({
      gate: "e3-s0-a4-real-provider",
      status: "PASS",
      paths: ["user_explicit", "actor_selected", "skill_unavailable"],
      modelIdentity: provider.modelIdentity,
      providerCalls: attempts.consumedAttempts,
      completedRestartReplayWithoutProviderCall: true,
      promptManifestBound: true,
      secretProjected,
      publicProjectionReadback: true,
      canvasWrite: false,
      browser: false,
    })
  );
}

void main().catch((error) => {
  const localDiagnostic =
    !["user_explicit", "actor_selected", "skill_unavailable"].includes(stage) &&
    error instanceof Error
      ? error.message.replace(/[^A-Za-z0-9_.:-]+/gu, "_").slice(0, 160)
      : "";
  const code =
    error instanceof ActorProviderErrorV1
      ? error.publicCode
      : error &&
          typeof error === "object" &&
          "code" in error &&
          /^[A-Za-z0-9_.:-]{1,160}$/u.test(String(error.code))
        ? String(error.code)
      : error instanceof Error && /^[A-Za-z0-9_.:-]{1,160}$/u.test(error.message)
      ? error.message
      : localDiagnostic || "redacted";
  console.error(`e3_s0_a4_failed:${stage}:${code}; no secret details logged`);
  process.exitCode = 1;
});
