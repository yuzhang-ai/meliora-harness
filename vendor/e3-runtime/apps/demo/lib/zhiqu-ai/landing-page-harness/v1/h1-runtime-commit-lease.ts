import { randomUUID } from "node:crypto";

import type {
  EffectiveFactsCaptureGrantReceiptV1,
  EffectiveFactsDocumentAclPortV1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { EffectiveFactsHostReceiptV1 } from "../../editor-canvas/v1/effective-facts-turn-registry";
import type { ConversationStorePortV1 } from "./conversation-store";
import type {
  H1RuntimeAdmissionActiveV1,
  H1RuntimeAdmissionSeedV1,
  H1RuntimeAuthorityMaterialV1,
} from "./h1-runtime-admission";
import {
  assertH1RuntimeCapabilityAdmissionActiveV1,
  assertH1RuntimeCapabilityBindingMatchesV1,
  type LoadedH1RuntimeCapabilityAdmissionV1,
} from "./h1-runtime-capability-admission";
import type { H1LocalAuthorityCommitIssuerV1 } from "./h1-runtime-request-authority";
import { hashCanonicalJsonV1, requiredHashV1 } from "./strict-json";
import type { RunToolCatalogBindingSeedV1 } from "./run-tool-catalog-binding";

export const H1_RUNTIME_COMMIT_LEASE_V1 = Object.freeze({
  contractVersion: "formal-r3-h1-local-store-commit-lease-v1",
  authorityMode: "restricted_local_deterministic",
  maxTtlMs: 30_000,
  reusePolicy: "single_use",
  consumptionSemantics:
    "spent_before_final_current_authority_assertion_and_not_restored_on_rollback",
} as const);

export type H1StoreMutationOperationV1 =
  | "h1_admission.reserve"
  | "h1_admission.activate"
  | "h1_admission.reject"
  | "h1_read.consume"
  | "h1_actor_binding.append"
  | "run_fingerprint.append"
  | "run.start"
  | "assistant_tool_batch.append"
  | "tool.begin"
  | "tool.settle"
  | "assistant_delta.append"
  | "failure_occurrence.record"
  | "run.complete"
  | "run.fail"
  | "run.stop"
  | "run.resume"
  | "thread.rename";

export type H1CommitLeasePurposeV1 =
  | "admission:reserve"
  | "admission:activate"
  | "admission:reject"
  | "api:run.stop"
  | "api:run.resume"
  | "api:thread.rename"
  | "runtime:execution";

export type H1CommitLeaseTargetV1 =
  | Readonly<{ kind: "request"; requestId: string }>
  | Readonly<{ kind: "run"; runId: string }>
  | Readonly<{ kind: "thread"; threadId: string }>;

export type H1StoreCommitLeaseAuthorityBindingV1 = Readonly<{
  requestId: string;
  runId: string | null;
  seedHash: string;
  aclSnapshotHash: string;
}>;

export type H1StoreCommitLeaseMaterialV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_COMMIT_LEASE_V1.contractVersion;
  authorityMode: typeof H1_RUNTIME_COMMIT_LEASE_V1.authorityMode;
  purpose: H1CommitLeasePurposeV1;
  operation: H1StoreMutationOperationV1;
  target: H1CommitLeaseTargetV1;
  principalHash: string;
  authorityBindings: readonly H1StoreCommitLeaseAuthorityBindingV1[];
  mutationBindingHash: string;
  commitNonce: string;
  authorizedAt: string;
  expiresAt: string;
  localAuthorityInstanceId: string;
  localAuthorityEpoch: number;
  leaseHash: string;
}>;

declare const H1_STORE_COMMIT_LEASE_BRAND_V1: unique symbol;

/**
 * Same-process, single-use authority handle. Public material is evidence, not
 * authenticity: runtime identity and the final assertion live only in the
 * module-private WeakMap. A structural copy or recomputed hash is invalid.
 */
export type H1StoreCommitLeaseV1 = Readonly<{
  readonly material: H1StoreCommitLeaseMaterialV1;
  readonly [H1_STORE_COMMIT_LEASE_BRAND_V1]: true;
}>;

export class H1StoreCommitLeaseErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "H1StoreCommitLeaseErrorV1";
  }
}

type IssuedLeaseStateV1 = {
  readonly authorityStoreIdentity: object;
  readonly assertCurrent: () => void;
  consumed: boolean;
};

const issuedLeasesV1 = new WeakMap<object, IssuedLeaseStateV1>();

const deepFreezeV1 = <T>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) {
      deepFreezeV1(child);
    }
    Object.freeze(value);
  }
  return value;
};

const exactAuthorityExpiryEpochV1 = (
  admission: H1RuntimeAdmissionActiveV1
) =>
  Math.min(
    Date.parse(admission.hostReceipt.expiresAt),
    Date.parse(admission.authority.runToolAdmission.expiresAt),
    Date.parse(admission.authority.executionAdmission.expiresAt)
  );

const authorizationInputForSeedV1 = (
  seed: H1RuntimeAdmissionSeedV1,
  workspaceId: string,
  sessionId: string
): Parameters<EffectiveFactsDocumentAclPortV1["authorize"]>[0] => ({
  principal: seed.principal,
  tenantId: seed.principal.tenantId,
  workspaceId,
  sessionId,
  sessionBindingId: seed.principal.sessionBindingId,
  documentId: seed.grantClaims.documentId,
  routePath: seed.grantClaims.routePath,
  captureProfile: seed.grantClaims.captureProfile,
  mountId: seed.grantClaims.mountId,
});

const authorizationInputForAdmissionV1 = (
  admission: H1RuntimeAdmissionActiveV1
) =>
  authorizationInputForSeedV1(
    admission.seed,
    admission.workspaceId,
    admission.sessionId
  );

const localIssuerV1 = (acl: EffectiveFactsDocumentAclPortV1) => {
  const issuer = acl as EffectiveFactsDocumentAclPortV1 &
    Partial<H1LocalAuthorityCommitIssuerV1>;
  if (typeof issuer.issueLocalAuthorityCommitAssertion !== "function") {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_local_commit_authority_unavailable",
      "This environment does not provide the synchronous local H1 commit authority required by B1."
    );
  }
  return issuer as EffectiveFactsDocumentAclPortV1 &
    H1LocalAuthorityCommitIssuerV1;
};

export const hashH1StoreMutationBindingV1 = (input: Readonly<{
  operation: H1StoreMutationOperationV1;
  target: H1CommitLeaseTargetV1;
  mutation?: unknown;
}>) =>
  hashCanonicalJsonV1({
    contractVersion: H1_RUNTIME_COMMIT_LEASE_V1.contractVersion,
    operation: input.operation,
    target: input.target,
    mutation: input.mutation ?? null,
  });

export const h1AdmissionReserveMutationBindingV1 = (input: Readonly<{
  requestId: string;
  envelopeId?: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId?: string;
  message: string;
  admissionSeed: H1RuntimeAdmissionSeedV1;
  catalogBindingSeed: RunToolCatalogBindingSeedV1;
  durableSubmitEnvelope?: Readonly<{ envelopeHash: string }>;
}>) => ({
  requestId: input.requestId,
  ...(input.envelopeId !== undefined
    ? { envelopeId: input.envelopeId }
    : {}),
  workspaceId: input.workspaceId,
  sessionId: input.sessionId,
  documentId: input.documentId,
  threadId: input.threadId ?? null,
  messageHash: hashCanonicalJsonV1(input.message),
  seedHash: input.admissionSeed.seedHash,
  grantReservationHash: hashCanonicalJsonV1(
    input.admissionSeed.grantReservation
  ),
  catalogBindingSeedHash: hashCanonicalJsonV1(
    input.catalogBindingSeed
  ),
  ...(input.durableSubmitEnvelope
    ? {
        durableSubmitEnvelopeHash: requiredHashV1(
          input.durableSubmitEnvelope.envelopeHash,
          "h1AdmissionReserve.durableSubmitEnvelopeHash"
        ),
      }
    : {}),
});

export const h1AdmissionActivationMutationBindingV1 = (input: Readonly<{
  runId: string;
  grantReceipt: EffectiveFactsCaptureGrantReceiptV1;
  hostReceipt: EffectiveFactsHostReceiptV1;
  authority: H1RuntimeAuthorityMaterialV1;
  activatedAt: string;
}>) => ({
  runId: input.runId,
  grantReceiptHash: hashCanonicalJsonV1(input.grantReceipt),
  hostReceiptHash: hashCanonicalJsonV1(input.hostReceipt),
  authorityMaterialHash: input.authority.materialHash,
  activatedAt: input.activatedAt,
});

export const h1AdmissionRejectMutationBindingV1 = (input: Readonly<{
  runId: string;
  rejectionCode: string;
  rejectedAt: string;
}>) => ({
  runId: input.runId,
  rejectionCode: input.rejectionCode,
  rejectedAt: input.rejectedAt,
});

const issueOpaqueLeaseV1 = (input: Readonly<{
  authorityStoreIdentity: object;
  purpose: H1CommitLeasePurposeV1;
  operation: H1StoreMutationOperationV1;
  target: H1CommitLeaseTargetV1;
  principalHash: string;
  authorityBindings: readonly H1StoreCommitLeaseAuthorityBindingV1[];
  mutation?: unknown;
  nowEpoch: number;
  expiresAtEpoch: number;
  localAuthorityInstanceId: string;
  localAuthorityEpoch: number;
  assertCurrent: () => void;
}>): H1StoreCommitLeaseV1 => {
  if (
    !Number.isFinite(input.expiresAtEpoch) ||
    input.expiresAtEpoch <= input.nowEpoch
  ) {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_local_commit_authority_expired",
      "H1 authority expired before a local Store commit lease could be issued."
    );
  }
  const mutationBindingHash = hashH1StoreMutationBindingV1({
    operation: input.operation,
    target: input.target,
    mutation: input.mutation,
  });
  const materialWithoutHash = {
    contractVersion: H1_RUNTIME_COMMIT_LEASE_V1.contractVersion,
    authorityMode: H1_RUNTIME_COMMIT_LEASE_V1.authorityMode,
    purpose: input.purpose,
    operation: input.operation,
    target: input.target,
    principalHash: input.principalHash,
    authorityBindings: input.authorityBindings,
    mutationBindingHash,
    commitNonce: `h1-commit-${randomUUID()}`,
    authorizedAt: new Date(input.nowEpoch).toISOString(),
    expiresAt: new Date(input.expiresAtEpoch).toISOString(),
    localAuthorityInstanceId: input.localAuthorityInstanceId,
    localAuthorityEpoch: input.localAuthorityEpoch,
  } as const;
  const material = deepFreezeV1(
    structuredClone({
      ...materialWithoutHash,
      leaseHash: hashCanonicalJsonV1(materialWithoutHash),
    })
  );
  const lease = Object.freeze({ material }) as H1StoreCommitLeaseV1;
  issuedLeasesV1.set(lease, {
    authorityStoreIdentity: input.authorityStoreIdentity,
    assertCurrent: input.assertCurrent,
    consumed: false,
  });
  return lease;
};

const issuedStateV1 = (
  lease: H1StoreCommitLeaseV1,
  authorityStoreIdentity: object
) => {
  const state = issuedLeasesV1.get(lease as object);
  if (!state) {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_store_commit_lease_forged",
      "H1 Store commit lease was not minted by the local authority issuer."
    );
  }
  if (state.authorityStoreIdentity !== authorityStoreIdentity) {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_store_commit_lease_store_mismatch",
      "H1 Store commit lease belongs to another authoritative Store instance."
    );
  }
  if (state.consumed) {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_store_commit_lease_reused",
      "H1 Store commit lease is single-use and was already consumed."
    );
  }
  return state;
};

export const assertH1StoreCommitLeaseIssuedForStoreV1 = (
  lease: H1StoreCommitLeaseV1,
  authorityStoreIdentity: object
) => {
  issuedStateV1(lease, authorityStoreIdentity);
};

export const consumeH1StoreCommitLeaseForStoreV1 = (
  lease: H1StoreCommitLeaseV1,
  authorityStoreIdentity: object
) => {
  const state = issuedStateV1(lease, authorityStoreIdentity);
  state.consumed = true;
  state.assertCurrent();
};

export const createH1StoreCommitLeaseV1 = (input: Readonly<{
  store: ConversationStorePortV1;
  acl: EffectiveFactsDocumentAclPortV1;
  capabilityAdmission?: LoadedH1RuntimeCapabilityAdmissionV1;
  admissions: readonly H1RuntimeAdmissionActiveV1[];
  principalHash: string;
  requiresExecutionAuthority: boolean;
  purpose: H1CommitLeasePurposeV1;
  operation: H1StoreMutationOperationV1;
  target: H1CommitLeaseTargetV1;
  mutation?: unknown;
  clock: () => number;
}>): H1StoreCommitLeaseV1 => {
  if (!input.admissions.length) {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_local_commit_binding_invalid",
      "H1 Store commit authority requires at least one active admission."
    );
  }
  const issuer = localIssuerV1(input.acl);
  const nowEpoch = input.clock();
  for (const admission of input.admissions) {
    assertH1RuntimeCapabilityBindingMatchesV1(
      admission.seed.capabilityAdmission,
      input.capabilityAdmission
    );
  }
  if (input.requiresExecutionAuthority) {
    assertH1RuntimeCapabilityAdmissionActiveV1(
      input.capabilityAdmission!,
      {
        nowEpoch,
        modelIdentity: input.capabilityAdmission!.record.modelIdentity,
      }
    );
  }
  const expiresAtEpoch = input.requiresExecutionAuthority
    ? Math.min(
        nowEpoch + H1_RUNTIME_COMMIT_LEASE_V1.maxTtlMs,
        ...input.admissions.map(exactAuthorityExpiryEpochV1),
        Date.parse(input.capabilityAdmission!.record.validity.expiresAt)
      )
    : nowEpoch + H1_RUNTIME_COMMIT_LEASE_V1.maxTtlMs;
  const authorityBindings = input.admissions
    .map((admission) => ({
      requestId: admission.requestId,
      runId: admission.runId,
      seedHash: admission.seed.seedHash,
      aclSnapshotHash: admission.seed.aclSnapshotHash,
    }))
    .sort((left, right) => left.runId.localeCompare(right.runId));
  const local = issuer.issueLocalAuthorityCommitAssertion({
    bindings: input.admissions.map((admission) => ({
      authorizationInput: authorizationInputForAdmissionV1(admission),
      expectedDecisionHash: admission.seed.aclSnapshotHash,
    })),
  });
  return issueOpaqueLeaseV1({
    authorityStoreIdentity: input.store.h1CommitAuthorityIdentity(),
    purpose: input.purpose,
    operation: input.operation,
    target: input.target,
    principalHash: input.principalHash,
    authorityBindings,
    mutation: input.mutation,
    nowEpoch,
    expiresAtEpoch,
    localAuthorityInstanceId: local.localAuthorityInstanceId,
    localAuthorityEpoch: local.localAuthorityEpoch,
    assertCurrent: () => {
      const checkedAt = input.clock();
      if (checkedAt >= expiresAtEpoch) {
        throw new H1StoreCommitLeaseErrorV1(
          "h1_local_commit_authority_expired",
          "H1 authority expired before the local Store commit."
        );
      }
      local.assertLocalAuthorityCurrent();
      for (const binding of authorityBindings) {
        if (
          !binding.runId ||
          input.store.getRunRuntimeAuthorityKind(binding.runId) !==
            "h1-runtime-admission-v1"
        ) {
          throw new H1StoreCommitLeaseErrorV1(
            "h1_local_commit_authority_stale",
            "Run Runtime authority ownership changed before commit."
          );
        }
        const admission = input.store.getH1RuntimeAdmission(binding.runId);
        if (
          !admission ||
          admission.status !== "active" ||
          admission.seed.seedHash !== binding.seedHash ||
          admission.seed.aclSnapshotHash !== binding.aclSnapshotHash ||
          admission.seed.principalHash !== input.principalHash
        ) {
          throw new H1StoreCommitLeaseErrorV1(
            "h1_local_commit_authority_stale",
            "Persisted H1 authority changed before the Store commit."
          );
        }
        assertH1RuntimeCapabilityBindingMatchesV1(
          admission.seed.capabilityAdmission,
          input.capabilityAdmission
        );
        if (input.requiresExecutionAuthority) {
          assertH1RuntimeCapabilityAdmissionActiveV1(
            input.capabilityAdmission!,
            {
              nowEpoch: checkedAt,
              modelIdentity: input.capabilityAdmission!.record.modelIdentity,
            }
          );
          if (
            checkedAt < Date.parse(admission.seed.grantClaims.notBefore) ||
            checkedAt >= exactAuthorityExpiryEpochV1(admission)
          ) {
            throw new H1StoreCommitLeaseErrorV1(
              "h1_runtime_authority_expired",
              "H1 Runtime authority expired before the Store commit."
            );
          }
        }
      }
    },
  });
};

export const createH1AdmissionTransitionCommitLeaseV1 = (input: Readonly<{
  store: ConversationStorePortV1;
  acl: EffectiveFactsDocumentAclPortV1;
  capabilityAdmission?: LoadedH1RuntimeCapabilityAdmissionV1;
  seed: H1RuntimeAdmissionSeedV1;
  workspaceId: string;
  sessionId: string;
  runId: string | null;
  purpose: "admission:reserve" | "admission:activate" | "admission:reject";
  operation:
    | "h1_admission.reserve"
    | "h1_admission.activate"
    | "h1_admission.reject";
  target: H1CommitLeaseTargetV1;
  mutation: unknown;
  expectedFinalStatus: "pending" | "active" | "rejected";
  authorityExpiresAt?: string;
  clock: () => number;
}>): H1StoreCommitLeaseV1 => {
  const expectedPair = {
    "h1_admission.reserve": "admission:reserve",
    "h1_admission.activate": "admission:activate",
    "h1_admission.reject": "admission:reject",
  } as const;
  if (expectedPair[input.operation] !== input.purpose) {
    throw new H1StoreCommitLeaseErrorV1(
      "h1_store_commit_scope_invalid",
      "H1 admission transition operation and purpose differ."
    );
  }
  assertH1RuntimeCapabilityBindingMatchesV1(
    input.seed.capabilityAdmission,
    input.capabilityAdmission
  );
  const nowEpoch = input.clock();
  assertH1RuntimeCapabilityAdmissionActiveV1(input.capabilityAdmission!, {
    nowEpoch,
    modelIdentity: input.capabilityAdmission!.record.modelIdentity,
  });
  const issuer = localIssuerV1(input.acl);
  const local = issuer.issueLocalAuthorityCommitAssertion({
    bindings: [
      {
        authorizationInput: authorizationInputForSeedV1(
          input.seed,
          input.workspaceId,
          input.sessionId
        ),
        expectedDecisionHash: input.seed.aclSnapshotHash,
      },
    ],
  });
  const expiresAtEpoch = Math.min(
    nowEpoch + H1_RUNTIME_COMMIT_LEASE_V1.maxTtlMs,
    Date.parse(input.seed.grantClaims.expiresAt),
    Date.parse(input.capabilityAdmission!.record.validity.expiresAt),
    ...(input.authorityExpiresAt
      ? [Date.parse(input.authorityExpiresAt)]
      : [])
  );
  const authorityBindings = [
    {
      requestId: input.seed.grantReservation.requestId,
      runId: input.runId,
      seedHash: input.seed.seedHash,
      aclSnapshotHash: input.seed.aclSnapshotHash,
    },
  ];
  return issueOpaqueLeaseV1({
    authorityStoreIdentity: input.store.h1CommitAuthorityIdentity(),
    purpose: input.purpose,
    operation: input.operation,
    target: input.target,
    principalHash: input.seed.principalHash,
    authorityBindings,
    mutation: input.mutation,
    nowEpoch,
    expiresAtEpoch,
    localAuthorityInstanceId: local.localAuthorityInstanceId,
    localAuthorityEpoch: local.localAuthorityEpoch,
    assertCurrent: () => {
      const checkedAt = input.clock();
      if (
        checkedAt < Date.parse(input.seed.grantClaims.notBefore) ||
        checkedAt >= expiresAtEpoch
      ) {
        throw new H1StoreCommitLeaseErrorV1(
          "h1_local_commit_authority_expired",
          "H1 admission authority expired before the Store transition."
        );
      }
      local.assertLocalAuthorityCurrent();
      assertH1RuntimeCapabilityBindingMatchesV1(
        input.seed.capabilityAdmission,
        input.capabilityAdmission
      );
      assertH1RuntimeCapabilityAdmissionActiveV1(
        input.capabilityAdmission!,
        {
          nowEpoch: checkedAt,
          modelIdentity: input.capabilityAdmission!.record.modelIdentity,
        }
      );
      const admission = input.runId
        ? input.store.getH1RuntimeAdmission(input.runId)
        : input.store.getH1RuntimeAdmissionByRequestId(
            input.seed.grantReservation.requestId
          );
      if (
        !admission ||
        admission.status !== input.expectedFinalStatus ||
        admission.seed.seedHash !== input.seed.seedHash ||
        admission.seed.principalHash !== input.seed.principalHash
      ) {
        throw new H1StoreCommitLeaseErrorV1(
          "h1_local_commit_authority_stale",
          "Persisted H1 admission transition differs from the issued commit authority."
        );
      }
    },
  });
};
