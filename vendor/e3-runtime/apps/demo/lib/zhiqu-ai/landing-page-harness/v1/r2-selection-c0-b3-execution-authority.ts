import type { EffectiveFactsAuthenticatedPrincipalV1 } from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { AgentRunV1, ToolCallV1, ToolInvocationReceiptV1 } from "./contracts";
import type {
  R2SelectionC0AclDecisionV1,
  R2SelectionC0AclInputV1,
  R2SelectionC0AclPortV1,
} from "./r2-selection-c0-host-authority";
import type {
  R2SelectionC0InvocationV1,
  R2SelectionC0MainStorePortV1,
} from "./r2-selection-c0-b3-store-contract";
import type { R2SelectionC0ModelSelectionExecutionPermitV1 } from "./r2-selection-c0-b3-model-selection";
import { hashCanonicalJsonV1, requiredIdV1 } from "./strict-json";

declare const R2_EXECUTION_AUTHORIZATION_BRAND_V1: unique symbol;
declare const R2_EXECUTION_LEASE_BRAND_V1: unique symbol;
declare const R2_SETTLEMENT_LEASE_BRAND_V1: unique symbol;

export type R2SelectionC0ExecutionAuthorizationV1 = Readonly<{
  material: Readonly<{
    runId: string;
    principalHash: string;
    scopeHash: string;
    aclDecisionHash: string;
    policyRevision: string;
  }>;
  readonly [R2_EXECUTION_AUTHORIZATION_BRAND_V1]: true;
}>;

export type R2SelectionC0ExecutionLeaseV1 = Readonly<{
  invocation: R2SelectionC0InvocationV1;
  readonly [R2_EXECUTION_LEASE_BRAND_V1]: true;
}>;

export type R2SelectionC0SettlementLeaseV1 = Readonly<{
  runId: string;
  tupleHash: string;
  receiptId: string;
  readonly [R2_SETTLEMENT_LEASE_BRAND_V1]: true;
}>;

export class R2SelectionC0B3ExecutionAuthorityErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "R2SelectionC0B3ExecutionAuthorityErrorV1";
  }
}

type LocalExecutionAssertionV1 = Readonly<{
  assertCurrent: () => void;
}>;

type LocalExecutionAuthorityV1 = Readonly<{
  issueR2SelectionC0LocalExecutionAssertionV1(input: Readonly<{
    scope: R2SelectionC0AclInputV1;
    decision: Extract<R2SelectionC0AclDecisionV1, Readonly<{ allowed: true }>>;
  }>): LocalExecutionAssertionV1;
}>;

const issuedAuthorizationsV1 = new WeakMap<object, Readonly<{
  authorityStoreIdentity: object;
  assertCurrent: () => void;
  consumed: boolean;
}>>();

const localExecutionAuthorityV1 = (acl: R2SelectionC0AclPortV1) => {
  const candidate = acl as R2SelectionC0AclPortV1 & Partial<LocalExecutionAuthorityV1>;
  if (typeof candidate.issueR2SelectionC0LocalExecutionAssertionV1 !== "function") {
    throw new R2SelectionC0B3ExecutionAuthorityErrorV1(
      "r2_execution_authority_unavailable",
      "R2 B3 execution requires a synchronous local current-authority assertion."
    );
  }
  return candidate as R2SelectionC0AclPortV1 & LocalExecutionAuthorityV1;
};

const issueExecutionAuthorizationV1 = async (input: Readonly<{
  store: R2SelectionC0MainStorePortV1;
  acl: R2SelectionC0AclPortV1;
  runId: string;
  principal: EffectiveFactsAuthenticatedPrincipalV1;
}>): Promise<R2SelectionC0ExecutionAuthorizationV1> => {
  const reservation = input.store.getR2SelectionC0AdmissionByRunIdV1(input.runId);
  if (!reservation) {
    throw new R2SelectionC0B3ExecutionAuthorityErrorV1(
      "r2_execution_admission_missing",
      "R2 B3 execution requires an exact main Store admission."
    );
  }
  const scope: R2SelectionC0AclInputV1 = {
    principal: input.principal,
    workspaceId: reservation.admission.workspaceId,
    sessionId: reservation.admission.sessionId,
    documentId: reservation.admission.documentId,
    mountId: reservation.admission.hostReceipt.mountId,
    routePath: reservation.admission.hostReceipt.routePath,
  };
  const decision = await input.acl.authorize(scope);
  if (!decision.allowed) {
    throw new R2SelectionC0B3ExecutionAuthorityErrorV1(
      decision.reasonCode,
      "R2 B3 current ACL denied execution."
    );
  }
  const principalHash = hashCanonicalJsonV1(input.principal);
  if (
    principalHash !== reservation.admission.principalHash ||
    decision.decisionHash !== reservation.admission.aclDecisionHash
  ) {
    throw new R2SelectionC0B3ExecutionAuthorityErrorV1(
      "r2_execution_acl_changed",
      "R2 B3 execution ACL identity or revision changed after admission."
    );
  }
  const assertion = localExecutionAuthorityV1(input.acl)
    .issueR2SelectionC0LocalExecutionAssertionV1({ scope, decision });
  const authorization = Object.freeze({
    material: Object.freeze({
      runId: reservation.run.runId,
      principalHash,
      scopeHash: hashCanonicalJsonV1(scope),
      aclDecisionHash: decision.decisionHash,
      policyRevision: decision.policyRevision,
    }),
  }) as R2SelectionC0ExecutionAuthorizationV1;
  issuedAuthorizationsV1.set(authorization, {
    authorityStoreIdentity: input.store.r2ExecutionAuthorityIdentityV1(),
    assertCurrent: assertion.assertCurrent,
    consumed: false,
  });
  return authorization;
};

export const consumeR2SelectionC0ExecutionAuthorizationForStoreV1 = (
  authorization: R2SelectionC0ExecutionAuthorizationV1,
  storeIdentity: object,
  runId: string
) => {
  const state = issuedAuthorizationsV1.get(authorization);
  if (
    !state ||
    state.consumed ||
    state.authorityStoreIdentity !== storeIdentity ||
    authorization.material.runId !== runId
  ) {
    throw new R2SelectionC0B3ExecutionAuthorityErrorV1(
      "r2_execution_authorization_invalid",
      "R2 B3 execution authorization is forged, spent, or bound elsewhere."
    );
  }
  state.assertCurrent();
  issuedAuthorizationsV1.set(authorization, { ...state, consumed: true });
  return Object.freeze({
    material: authorization.material,
    assertCurrent: state.assertCurrent,
  });
};

export class R2SelectionC0B3ExecutionServiceV1 {
  constructor(
    private readonly store: R2SelectionC0MainStorePortV1,
    private readonly acl: R2SelectionC0AclPortV1
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new R2SelectionC0B3ExecutionAuthorityErrorV1(
        "r2_acceptance_execution_forbidden_in_production",
        "R2 B3-B1 execution is acceptance-only and cannot be constructed in production."
      );
    }
  }

  async executePersisted(input: Readonly<{
    runId: string;
    ownerId: string;
    call: ToolCallV1;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
  }>): Promise<Readonly<{
    disposition: "completed" | "outcome_unknown";
    receipt: ToolInvocationReceiptV1 | null;
    source: "executed" | "terminal_replay" | "outcome_unknown";
  }>> {
    const authorization = await issueExecutionAuthorizationV1({
      store: this.store,
      acl: this.acl,
      runId: requiredIdV1(input.runId, "r2Execution.runId"),
      principal: input.principal,
    });
    const acquired = this.store.acquireR2SelectionC0ExecutionV1({
      authorization,
      runId: input.runId,
      ownerId: requiredIdV1(input.ownerId, "r2Execution.ownerId"),
      call: input.call,
    });
    if (acquired.disposition === "terminal_replay") {
      return {
        disposition: "completed",
        receipt: acquired.receipt,
        source: "terminal_replay",
      };
    }
    if (acquired.disposition === "outcome_unknown") {
      return {
        disposition: "outcome_unknown",
        receipt: null,
        source: "outcome_unknown",
      };
    }
    return {
      disposition: "completed",
      receipt: this.store.persistR2SelectionC0CompletedReceiptV1({
        lease: acquired.lease,
      }),
      source: "executed",
    };
  }

  async executeModelSelectedPersisted(input: Readonly<{
    runId: string;
    ownerId: string;
    permit: R2SelectionC0ModelSelectionExecutionPermitV1;
    principal: EffectiveFactsAuthenticatedPrincipalV1;
  }>): Promise<Readonly<{
    disposition: "completed" | "outcome_unknown";
    receipt: ToolInvocationReceiptV1 | null;
    source: "executed" | "terminal_replay" | "outcome_unknown";
  }>> {
    const authorization = await issueExecutionAuthorizationV1({
      store: this.store,
      acl: this.acl,
      runId: requiredIdV1(input.runId, "r2ModelSelectedExecution.runId"),
      principal: input.principal,
    });
    const acquired = this.store.acquireR2SelectionC0ModelSelectedExecutionV1({
      permit: input.permit,
      authorization,
      ownerId: requiredIdV1(input.ownerId, "r2ModelSelectedExecution.ownerId"),
    });
    if (acquired.disposition === "terminal_replay") {
      return {
        disposition: "completed",
        receipt: acquired.receipt,
        source: "terminal_replay",
      };
    }
    if (acquired.disposition === "outcome_unknown") {
      return {
        disposition: "outcome_unknown",
        receipt: null,
        source: "outcome_unknown",
      };
    }
    return {
      disposition: "completed",
      receipt: this.store.persistR2SelectionC0CompletedReceiptV1({
        lease: acquired.lease,
      }),
      source: "executed",
    };
  }

  reconcileAndSettle(input: Readonly<{ runId: string; call: ToolCallV1 }>): AgentRunV1 | null {
    const recovery = this.store.reconcileR2SelectionC0CompletedReceiptV1(input);
    return recovery
      ? this.store.settleR2SelectionC0CompletedReceiptV1({ recovery })
      : null;
  }
}
