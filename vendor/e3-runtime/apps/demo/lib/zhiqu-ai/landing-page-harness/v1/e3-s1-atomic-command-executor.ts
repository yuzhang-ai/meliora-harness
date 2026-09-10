import {
  ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
  ATOMIC_AI_SAAS_SECTION_PROFILE_V1,
  compileRestrictedAiSaasSectionsV1,
  type AtomicAiSaasSectionRequestV1,
} from "../../../../config/blocks/editor-kernel/atomic-ai-saas-section-profile";
import { ATOMIC_COMMAND_REGISTRY_HASH } from "../../../../config/blocks/editor-kernel/atomic-command-registry";
import type { AtomicDocumentPointer } from "../../../../config/blocks/editor-kernel/atomic-document-version";
import type { SkillActivationReceiptV1 } from "./authority-fabric-contracts";
import { decodeSkillActivationReceiptV1 } from "./authority-skill-lifecycle";
import type { E3S1UxHostPortV1 } from "./e3-s1-ux-host-port";
import type { SqliteE3S0SkillLedgerV1 } from "./sqlite-e3-s0-skill-ledger";
import {
  SqliteE3S1CommandLedgerV1,
  type E3S1CommandLeaseV1,
} from "./sqlite-e3-s1-command-ledger";
import { canonicalJsonV1, hashCanonicalJsonV1, hashUtf8V1 } from "./strict-json";
import { e3PrincipalHashV1, e3S1AclSnapshotHashV1 } from "./e3-effect-authority-profile";
import {
  E3_S1_COMPILED_TOOL_CATALOG_V1,
  E3_S1_RESOLVED_CLOSURE_HASH_V1,
  E3_S1_SKILL_CATALOG_V1,
} from "./e3-s1-skill-runtime-authority";

export const E3_S1_ATOMIC_COMMAND_EXECUTOR_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s1-atomic-command-executor-v1",
  routePath: "/atomic-acceptance",
  singleCommandEffects: ["header", "hero", "cta"],
  batchEffect: "fixed_page_batch",
  commitOutcomeUnknownPolicy: "reconcile_only_no_replay",
} as const);

export const E3_S1_SKILL_CLOSURE_HASH_V1 = E3_S1_RESOLVED_CLOSURE_HASH_V1;

export interface E3S1ActivationAuthorityV1 {
  verify(input: Readonly<{
    activation: SkillActivationReceiptV1;
    actorId: string;
    sessionId: string;
    now: number;
  }>): SkillActivationReceiptV1;
}

export const createE3S1ExecutionRequestHashV1 = (input: Readonly<{
  lease: E3S1CommandLeaseV1;
  idempotencyKey: string;
  requests: readonly AtomicAiSaasSectionRequestV1[];
}>) => hashCanonicalJsonV1({
  leaseHash: input.lease.leaseHash,
  idempotencyKey: input.idempotencyKey,
  requests: input.requests,
});

/**
 * The write executor never trusts a caller-supplied Activation Receipt.  It
 * reloads the exact active receipt from the dedicated E3-S0 durable ledger,
 * which rehydrates the lifecycle before returning it, then binds that receipt
 * to the Host actor/session and the fixed S1 ACL snapshot.
 */
export class DurableE3S1ActivationAuthorityV1 implements E3S1ActivationAuthorityV1 {
  constructor(private readonly store: SqliteE3S0SkillLedgerV1) {}

  verify(input: Readonly<{
    activation: SkillActivationReceiptV1;
    actorId: string;
    sessionId: string;
    now: number;
  }>): SkillActivationReceiptV1 {
    const supplied = decodeSkillActivationReceiptV1(input.activation);
    const durable = this.store.readActiveActivation(supplied.skillActivationId);
    if (!durable || canonicalJsonV1(durable) !== canonicalJsonV1(supplied)) {
      throw new Error("e3_s1_activation_not_durably_active");
    }
    if (durable.runId !== supplied.runId || durable.receiptHash !== supplied.receiptHash) {
      throw new Error("e3_s1_activation_binding_mismatch");
    }
    if (durable.principalHash !== e3PrincipalHashV1(input.actorId, input.sessionId)) {
      throw new Error("e3_s1_activation_principal_mismatch");
    }
    if (durable.aclSnapshotHash !== e3S1AclSnapshotHashV1(input.actorId, input.sessionId)) {
      throw new Error("e3_s1_activation_acl_mismatch");
    }
    if (
      durable.resolvedClosureHash !== E3_S1_RESOLVED_CLOSURE_HASH_V1 ||
      durable.toolCatalogHash !== E3_S1_COMPILED_TOOL_CATALOG_V1.catalogHash ||
      durable.skillCatalogHash !== E3_S1_SKILL_CATALOG_V1.catalogHash
    ) {
      throw new Error("e3_s1_activation_write_closure_mismatch");
    }
    if (input.now < Date.parse(durable.issuedAt) || input.now >= Date.parse(durable.expiresAt)) {
      throw new Error("e3_s1_activation_expired");
    }
    return durable;
  }
}

export class E3S1AtomicCommandExecutorV1<T = unknown> {
  constructor(
    private readonly ledger: SqliteE3S1CommandLedgerV1,
    private readonly host: E3S1UxHostPortV1<T>,
    private readonly activationAuthority: E3S1ActivationAuthorityV1,
    private readonly clock: () => number = Date.now
  ) {}

  issueLease(input: Readonly<{
    activation: SkillActivationReceiptV1;
    actorId: string;
    sessionId: string;
    base: AtomicDocumentPointer;
    sections: readonly ("header" | "hero" | "cta")[];
    effect: "single_section" | "fixed_page_batch";
    leaseId: string;
  }>): E3S1CommandLeaseV1 {
    const now = this.clock();
    const activation = this.activationAuthority.verify({
      activation: input.activation,
      actorId: input.actorId,
      sessionId: input.sessionId,
      now,
    });
    if (
      input.sections.length !== (input.effect === "fixed_page_batch" ? 3 : 1) ||
      input.sections.join(",") !==
        (input.effect === "fixed_page_batch"
          ? ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder.join(",")
          : input.sections[0])
    ) throw new Error("e3_s1_lease_scope_invalid");
    const expiresAt = new Date(
      Math.min(Date.parse(activation.expiresAt), now + 300_000)
    ).toISOString();
    return this.ledger.issueLease({
      leaseId: input.leaseId,
      runId: activation.runId,
      activationId: activation.skillActivationId,
      actorId: input.actorId,
      sessionId: input.sessionId,
      capabilityFingerprint: hashCanonicalJsonV1({
        activationReceiptHash: activation.receiptHash,
        resolvedClosureHash: activation.resolvedClosureHash,
        profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
        effect: input.effect,
        sections: input.sections,
      }),
      profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
      registryHash: ATOMIC_COMMAND_REGISTRY_HASH,
      base: input.base,
      basePointerHash: hashCanonicalJsonV1(input.base),
      allowedSections: [...input.sections],
      effect: input.effect,
      issuedAt: new Date(now).toISOString(),
      expiresAt,
    });
  }

  execute(input: Readonly<{
    lease: E3S1CommandLeaseV1;
    idempotencyKey: string;
    requests: readonly AtomicAiSaasSectionRequestV1[];
  }>) {
    if (
      input.lease.profileHash !== ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1 ||
      input.lease.registryHash !== ATOMIC_COMMAND_REGISTRY_HASH ||
      input.requests.map(({ sectionKind }) => sectionKind).join(",") !==
        input.lease.allowedSections.join(",")
    ) throw new Error("e3_s1_execution_profile_mismatch");
    const requestHash = createE3S1ExecutionRequestHashV1(input);
    const reservation = this.ledger.beginExecution({
      lease: input.lease,
      idempotencyKey: input.idempotencyKey,
      requestHash,
    });
    if (reservation.kind === "completed") {
      return Object.freeze({ kind: "completed" as const, replayed: true, receipt: reservation.receipt });
    }
    if (reservation.kind === "unknown") {
      const reconciled = this.host.reconcile(input.idempotencyKey);
      if (!reconciled) return Object.freeze({ kind: "unknown" as const, replayed: false });
      this.ledger.reconcileUnknown({ idempotencyKey: input.idempotencyKey, requestHash, receipt: reconciled });
      return Object.freeze({ kind: "completed" as const, replayed: true, reconciled: true, receipt: reconciled });
    }
    if (reservation.kind !== "owner") throw new Error(`e3_s1_execution_${reservation.kind}`);
    try {
      const current = this.host.capture();
      if (hashCanonicalJsonV1(current.pointer) !== input.lease.basePointerHash) {
        throw new Error("e3_s1_base_pointer_stale");
      }
      const batch = compileRestrictedAiSaasSectionsV1({
        batchId: `e3-s1:${hashUtf8V1(input.idempotencyKey).slice(0, 24)}`,
        idempotencyKey: input.idempotencyKey,
        base: current.pointer,
        requests: input.requests,
        current,
        authority: {
          actorId: input.lease.actorId,
          sessionId: input.lease.sessionId,
          capabilityFingerprint: input.lease.capabilityFingerprint,
          evidenceRefs: [`lease:${input.lease.leaseId}`, `activation:${input.lease.activationId}`],
        },
        expectedAuthority: {
          actorId: input.lease.actorId,
          sessionId: input.lease.sessionId,
          capabilityFingerprint: input.lease.capabilityFingerprint,
        },
      });
      const outcome = this.host.commit({
        idempotencyKey: input.idempotencyKey,
        expectedBase: current.pointer,
        batch,
      });
      if (outcome.outcome === "unknown") {
        this.ledger.markUnknown({
          idempotencyKey: input.idempotencyKey,
          requestHash,
          ownerToken: reservation.ownerToken,
        });
        return Object.freeze({ kind: "unknown" as const, replayed: false });
      }
      this.ledger.complete({
        idempotencyKey: input.idempotencyKey,
        requestHash,
        ownerToken: reservation.ownerToken,
        receipt: outcome,
      });
      return Object.freeze({ kind: "completed" as const, replayed: false, receipt: outcome });
    } catch (error) {
      const code = error instanceof Error && /^[a-z0-9_:-]+$/u.test(error.message)
        ? error.message
        : "e3_s1_execution_failed";
      this.ledger.fail({
        idempotencyKey: input.idempotencyKey,
        requestHash,
        ownerToken: reservation.ownerToken,
        errorCode: code,
      });
      throw error;
    }
  }
}
