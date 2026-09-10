import assert from "node:assert/strict";
import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

import { createE3MinimumIntegrationData } from "../config/fixtures/e3-minimum-integration";
import { createAtomicDocumentSnapshot } from "../config/blocks/editor-kernel/atomic-document-version";
import { E3S0SkillAdmissionServiceV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-admission-service";
import { E3S1SkillAdmissionServiceV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s1-skill-admission-service";
import {
  DurableE3S1ActivationAuthorityV1,
  E3S1AtomicCommandExecutorV1,
} from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s1-atomic-command-executor";
import { MemoryE3S1UxHostV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s1-ux-host-port";
import { SqliteE3S0SkillLedgerV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/sqlite-e3-s0-skill-ledger";
import { SqliteE3S1CommandLedgerV1 } from "../lib/zhiqu-ai/landing-page-harness/v1/sqlite-e3-s1-command-ledger";

const root = mkdtempSync(join(tmpdir(), "e3-s1-durable-"));
chmodSync(root, 0o700);
let now = Date.parse("2026-09-06T08:00:00.000Z");
let nonce = 0;
const request = (sectionKind: "header" | "hero" | "cta") => ({
  commandId: `saas-section:${sectionKind}`,
  sectionKind,
  slots: {
    heading: `${sectionKind} heading`,
    body: `${sectionKind} body`,
    action: `${sectionKind} action`,
  },
});
const create = (name: string) => {
  const host = new MemoryE3S1UxHostV1(
    createAtomicDocumentSnapshot(structuredClone(createE3MinimumIntegrationData()), 0)
  );
  const databasePath = join(root, `${name}.sqlite`);
  const skillDatabasePath = join(root, `${name}-skill.sqlite`);
  const actorId = `actor-${name}`;
  const sessionId = `session-${name}`;
  const skillStore = new SqliteE3S0SkillLedgerV1({
    databasePath: skillDatabasePath,
    clock: () => now,
    nonce: () => `skill-owner-${++nonce}`,
  });
  const admitted = new E3S1SkillAdmissionServiceV1(skillStore).admit({
    runId: `run-${name}`,
    turnId: `turn-${name}`,
    requestId: `request-${name}`,
    actorId,
    sessionId,
    userGoal: "Build the fixed three-section SaaS acceptance page.",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 600_000).toISOString(),
  });
  assert.equal(admitted.kind, "active");
  if (admitted.kind !== "active") throw new Error("expected durable active receipt");
  const ledger = new SqliteE3S1CommandLedgerV1(databasePath, () => now, () => `owner-${++nonce}`);
  const executor = new E3S1AtomicCommandExecutorV1(
    ledger,
    host,
    new DurableE3S1ActivationAuthorityV1(skillStore),
    () => now
  );
  return { host, ledger, executor, databasePath, skillDatabasePath, skillStore, activation: admitted.activationReceipt, actorId, sessionId };
};
const lease = (
  runtime: ReturnType<typeof create>,
  name: string,
  sections: readonly ("header" | "hero" | "cta")[],
  effect: "single_section" | "fixed_page_batch"
) => runtime.executor.issueLease({
  activation: runtime.activation,
  actorId: runtime.actorId,
  sessionId: runtime.sessionId,
  base: runtime.host.capture().pointer,
  sections,
  effect,
  leaseId: `lease-${name}`,
});

try {
  for (const section of ["header", "hero", "cta"] as const) {
    const runtime = create(`single-${section}`);
    const issued = lease(runtime, `single-${section}`, [section], "single_section");
    const result = runtime.executor.execute({
      lease: issued,
      idempotencyKey: `execute-${section}`,
      requests: [request(section)],
    });
    assert.equal(result.kind, "completed");
    assert.equal(result.replayed, false);
    if (result.kind === "completed") {
      assert.equal(result.receipt.after.revision, 1);
      assert.equal(result.receipt.createdIds.length, 1);
    }
    const replay = runtime.executor.execute({
      lease: issued,
      idempotencyKey: `execute-${section}`,
      requests: [request(section)],
    });
    assert.equal(replay.kind, "completed");
    assert.equal(replay.replayed, true);
    assert.throws(() => runtime.executor.execute({
      lease: issued,
      idempotencyKey: `execute-${section}`,
      requests: [{ ...request(section), slots: { ...request(section).slots, body: "different" } }],
    }), /idempotency_conflict/);
    runtime.ledger.close();
    runtime.skillStore.close();
  }

  const batchRuntime = create("batch");
  const batchLease = lease(batchRuntime, "batch", ["header", "hero", "cta"], "fixed_page_batch");
  const before = batchRuntime.host.capture();
  const batch = batchRuntime.executor.execute({
    lease: batchLease,
    idempotencyKey: "execute-batch",
    requests: [request("header"), request("hero"), request("cta")],
  });
  assert.equal(batch.kind, "completed");
  assert.equal(batchRuntime.host.capture().pointer.revision, 1);
  const committedFingerprint = batchRuntime.host.capture().pointer.atomicFingerprint;
  const undone = batchRuntime.host.undo();
  assert.equal(undone.pointer.atomicFingerprint, before.pointer.atomicFingerprint);
  const redone = batchRuntime.host.redo();
  assert.equal(redone.pointer.atomicFingerprint, committedFingerprint);
  const saved = batchRuntime.host.save();
  assert.equal(batchRuntime.host.reload().pointer.atomicFingerprint, saved.pointer.atomicFingerprint);
  batchRuntime.ledger.close();
  batchRuntime.skillStore.close();
  const reopened = new SqliteE3S1CommandLedgerV1(batchRuntime.databasePath, () => now, () => `owner-${++nonce}`);
  const reopenedSkillStore = new SqliteE3S0SkillLedgerV1({ databasePath: batchRuntime.skillDatabasePath, clock: () => now, nonce: () => `skill-owner-${++nonce}` });
  const reopenedExecutor = new E3S1AtomicCommandExecutorV1(reopened, batchRuntime.host, new DurableE3S1ActivationAuthorityV1(reopenedSkillStore), () => now);
  const durableReplay = reopenedExecutor.execute({
    lease: batchLease,
    idempotencyKey: "execute-batch",
    requests: [request("header"), request("hero"), request("cta")],
  });
  assert.equal(durableReplay.kind, "completed");
  assert.equal(durableReplay.replayed, true);
  reopened.close();
  reopenedSkillStore.close();

  const invalidRuntime = create("invalid-batch");
  const invalidLease = lease(invalidRuntime, "invalid-batch", ["header", "hero", "cta"], "fixed_page_batch");
  const invalidBefore = invalidRuntime.host.capture();
  assert.throws(() => invalidRuntime.executor.execute({
    lease: invalidLease,
    idempotencyKey: "invalid-batch",
    requests: [
      request("header"),
      { ...request("hero"), slots: { ...request("hero").slots, heading: "x".repeat(241) } },
      request("cta"),
    ],
  }), /fixed text-slot contract/);
  assert.deepEqual(invalidRuntime.host.capture(), invalidBefore);
  invalidRuntime.ledger.close();
  invalidRuntime.skillStore.close();

  const unknownRuntime = create("unknown");
  const unknownLease = lease(unknownRuntime, "unknown", ["header", "hero", "cta"], "fixed_page_batch");
  unknownRuntime.host.injectUnknownAfterNextCommit();
  const unknown = unknownRuntime.executor.execute({
    lease: unknownLease,
    idempotencyKey: "unknown-batch",
    requests: [request("header"), request("hero"), request("cta")],
  });
  assert.equal(unknown.kind, "unknown");
  assert.equal(unknownRuntime.host.capture().pointer.revision, 1);
  const reconciled = unknownRuntime.executor.execute({
    lease: unknownLease,
    idempotencyKey: "unknown-batch",
    requests: [request("header"), request("hero"), request("cta")],
  });
  assert.equal(reconciled.kind, "completed");
  assert.equal(unknownRuntime.host.capture().pointer.revision, 1, "unknown outcome must reconcile without replay");
  unknownRuntime.ledger.close();
  unknownRuntime.skillStore.close();

  const readOnlyRuntime = create("read-only");
  const readOnlyAdmission = new E3S0SkillAdmissionServiceV1(readOnlyRuntime.skillStore).admit({
    runId: "run-read-only-s0",
    turnId: "turn-read-only-s0",
    requestId: "request-read-only-s0",
    actorId: readOnlyRuntime.actorId,
    sessionId: readOnlyRuntime.sessionId,
    source: "user_explicit",
    available: true,
    userGoal: "Read the current Canvas without writing it.",
    issuedAt: new Date(now - 1_000).toISOString(),
    expiresAt: new Date(now + 600_000).toISOString(),
  });
  assert.equal(readOnlyAdmission.kind, "active");
  if (readOnlyAdmission.kind !== "active") throw new Error("expected read-only activation");
  assert.throws(() => readOnlyRuntime.executor.issueLease({
    activation: readOnlyAdmission.activationReceipt,
    actorId: readOnlyRuntime.actorId,
    sessionId: readOnlyRuntime.sessionId,
    base: readOnlyRuntime.host.capture().pointer,
    sections: ["header"],
    effect: "single_section",
    leaseId: "lease-read-only-escalation",
  }), /activation_acl_mismatch|activation_write_closure_mismatch/);
  readOnlyRuntime.ledger.close();
  readOnlyRuntime.skillStore.close();

  const forgedRuntime = create("forged");
  assert.throws(() => forgedRuntime.executor.issueLease({
    activation: { ...forgedRuntime.activation, receiptHash: "f".repeat(64) },
    actorId: forgedRuntime.actorId,
    sessionId: forgedRuntime.sessionId,
    base: forgedRuntime.host.capture().pointer,
    sections: ["header"],
    effect: "single_section",
    leaseId: "lease-forged",
  }), /hash differs|activation_not_durably_active/);
  assert.throws(() => forgedRuntime.executor.issueLease({
    activation: forgedRuntime.activation,
    actorId: "different-actor",
    sessionId: forgedRuntime.sessionId,
    base: forgedRuntime.host.capture().pointer,
    sections: ["header"],
    effect: "single_section",
    leaseId: "lease-wrong-principal",
  }), /activation_principal_mismatch/);
  forgedRuntime.skillStore.transition({
    activationReceipt: forgedRuntime.activation,
    nextState: "cancelled",
    transitionReasonCode: "authority-negative-test",
    evidenceSet: null,
    evidenceContext: null,
    idempotencyKey: "transition-forged-runtime",
    issuedAt: new Date(now + 1_000).toISOString(),
  });
  assert.throws(() => forgedRuntime.executor.issueLease({
    activation: forgedRuntime.activation,
    actorId: forgedRuntime.actorId,
    sessionId: forgedRuntime.sessionId,
    base: forgedRuntime.host.capture().pointer,
    sections: ["header"],
    effect: "single_section",
    leaseId: "lease-terminal-activation",
  }), /activation_not_durably_active/);
  forgedRuntime.ledger.close();
  forgedRuntime.skillStore.close();

  const crashRuntime = create("crash-reservation");
  const crashLease = lease(crashRuntime, "crash-reservation", ["header"], "single_section");
  const crashRequestHash = "9".repeat(64);
  assert.equal(crashRuntime.ledger.beginExecution({
    lease: crashLease,
    idempotencyKey: "crash-reservation",
    requestHash: crashRequestHash,
  }).kind, "owner");
  now += 300_001;
  assert.equal(crashRuntime.ledger.beginExecution({
    lease: crashLease,
    idempotencyKey: "crash-reservation",
    requestHash: crashRequestHash,
  }).kind, "unknown");
  crashRuntime.ledger.close();
  crashRuntime.skillStore.close();

  const expiredRuntime = create("expired");
  const expiredLease = lease(expiredRuntime, "expired", ["header"], "single_section");
  now = Date.parse(expiredLease.expiresAt) + 1;
  assert.throws(() => expiredRuntime.executor.execute({
    lease: expiredLease,
    idempotencyKey: "expired",
    requests: [request("header")],
  }), /lease_expired/);
  assert.equal(expiredRuntime.host.capture().pointer.revision, 0);
  expiredRuntime.ledger.close();
  expiredRuntime.skillStore.close();

  console.log(JSON.stringify({
    gate: "e3-s1-durable-command-and-batch",
    status: "PASS",
    singleCommands: ["header", "hero", "cta"],
    durableLeaseCas: true,
    independentDurableS1WriteActivation: true,
    readOnlyActivationCannotEscalate: true,
    forgedAndTerminalActivationRejected: true,
    exactReplayConflict: true,
    crashReservationReconcilesOnly: true,
    invalidBatchZeroWrite: true,
    unknownOutcomeReconcileOnly: true,
    batchSingleRevision: true,
    undoRedoSaveReload: true,
  }));
} finally {
  rmSync(root, { recursive: true, force: true });
}
