import type {
  AuthorityToolReceiptBindingV1,
  CompiledToolCatalogV1,
  ResolvedSkillClosureV1,
  SkillActivationReceiptV1,
  SkillActivationRequestV1,
  SkillActivationTransitionReceiptV1,
  SkillEvidenceSetV1,
  PromptCompositionManifestV1,
  SkillResolutionPlanV1,
  SkillToolInvocationRequestV1,
} from "./authority-fabric-contracts";
import { FORMAL_R3_AUTHORITY_FABRIC_V1 } from "./authority-fabric-contracts";
import {
  compareCodeUnitV1,
  requiredCanonicalJsonTextV1,
  requiredEnumV1,
  requiredHashV1,
  requiredIdV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordShapeV1,
} from "./authority-fabric-codecs";
import {
  assertSkillInvocationWithinClosureV1,
  decodeResolvedSkillClosureV1,
  decodeSkillResolutionPlanV1,
} from "./authority-skill-compiler";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
} from "./strict-json";
import { decodePromptCompositionManifestV1 } from "./authority-prompt-composition";
import { decodeCompiledToolCatalogV1 } from "./authority-tool-compiler";
import { projectAuthorityToolArgumentsV1 } from "./authority-fabric-private-projection";

export class AuthoritySkillLifecycleErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthoritySkillLifecycleErrorV1";
  }
}

export type SkillEvidenceContextV1 = Readonly<{
  closure: ResolvedSkillClosureV1;
  promptCompositionManifest: PromptCompositionManifestV1;
}>;

export type SkillEvidenceAuthorityV1 = Readonly<{
  verifyPromptCompositionManifest: (
    manifest: PromptCompositionManifestV1
  ) => boolean;
  resolveToolReceiptBinding: (
    receiptId: string
  ) => AuthorityToolReceiptBindingV1 | null;
  verifyRubricEvaluation: (input: Readonly<{
    evidenceSet: SkillEvidenceSetV1;
    activationReceipt: SkillActivationReceiptV1;
    closure: ResolvedSkillClosureV1;
    promptCompositionManifest: PromptCompositionManifestV1;
    toolReceiptBindings: readonly AuthorityToolReceiptBindingV1[];
  }>) => boolean;
  verifyBudgetConsumption: (input: Readonly<{
    evidenceSet: SkillEvidenceSetV1;
    activationReceipt: SkillActivationReceiptV1;
    closure: ResolvedSkillClosureV1;
    toolReceiptBindings: readonly AuthorityToolReceiptBindingV1[];
  }>) => boolean;
}>;

export const createSkillActivationRequestV1 = (
  input: Omit<SkillActivationRequestV1, "contractVersion" | "skillInputHash">
): SkillActivationRequestV1 => {
  const skillInputJson = requiredCanonicalJsonTextV1(
    input.skillInputJson,
    "skillActivationRequest.skillInputJson"
  );
  return {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationRequest,
    runId: requiredIdV1(input.runId, "skillActivationRequest.runId"),
    requestId: requiredIdV1(input.requestId, "skillActivationRequest.requestId"),
    idempotencyKey: requiredIdV1(
      input.idempotencyKey,
      "skillActivationRequest.idempotencyKey"
    ),
    kernelPrincipalBindingRef: requiredIdV1(
      input.kernelPrincipalBindingRef,
      "skillActivationRequest.kernelPrincipalBindingRef"
    ),
    resolutionPlanHash: requiredHashV1(
      input.resolutionPlanHash,
      "skillActivationRequest.resolutionPlanHash"
    ),
    conflictRegistrySnapshotHash: requiredHashV1(
      input.conflictRegistrySnapshotHash,
      "skillActivationRequest.conflictRegistrySnapshotHash"
    ),
    resolvedClosureHash: requiredHashV1(
      input.resolvedClosureHash,
      "skillActivationRequest.resolvedClosureHash"
    ),
    source: requiredEnumV1(
      input.source,
      ["user_explicit", "actor_selected", "dependency"] as const,
      "skillActivationRequest.source"
    ),
    skillInputJson,
    skillInputHash: hashUtf8V1(skillInputJson),
    budgetReservationHash: requiredHashV1(
      input.budgetReservationHash,
      "skillActivationRequest.budgetReservationHash"
    ),
    parentSkillActivationId:
      input.parentSkillActivationId === null
        ? null
        : requiredIdV1(
            input.parentSkillActivationId,
            "skillActivationRequest.parentSkillActivationId"
          ),
    parentActivationReceiptHash:
      input.parentActivationReceiptHash === null
        ? null
        : requiredHashV1(
            input.parentActivationReceiptHash,
            "skillActivationRequest.parentActivationReceiptHash"
          ),
    requestedAt: requiredTimestampV1(
      input.requestedAt,
      "skillActivationRequest.requestedAt"
    ),
  };
};

export const decodeSkillActivationRequestV1 = (
  value: unknown
): SkillActivationRequestV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "requestId",
      "idempotencyKey",
      "kernelPrincipalBindingRef",
      "resolutionPlanHash",
      "conflictRegistrySnapshotHash",
      "resolvedClosureHash",
      "source",
      "skillInputJson",
      "skillInputHash",
      "budgetReservationHash",
      "parentSkillActivationId",
      "parentActivationReceiptHash",
      "requestedAt",
    ],
    [],
    "skillActivationRequest"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationRequest
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "activation_request_contract_mismatch",
      "Skill Activation Request contract differs."
    );
  }
  const decoded = createSkillActivationRequestV1({
    runId: record.runId as string,
    requestId: record.requestId as string,
    idempotencyKey: record.idempotencyKey as string,
    kernelPrincipalBindingRef: record.kernelPrincipalBindingRef as string,
    resolutionPlanHash: record.resolutionPlanHash as string,
    conflictRegistrySnapshotHash:
      record.conflictRegistrySnapshotHash as string,
    resolvedClosureHash: record.resolvedClosureHash as string,
    source: record.source as SkillActivationRequestV1["source"],
    skillInputJson: record.skillInputJson as string,
    budgetReservationHash: record.budgetReservationHash as string,
    parentSkillActivationId: record.parentSkillActivationId as string | null,
    parentActivationReceiptHash: record.parentActivationReceiptHash as string | null,
    requestedAt: record.requestedAt as string,
  });
  if (record.skillInputHash !== decoded.skillInputHash) {
    throw new AuthoritySkillLifecycleErrorV1(
      "activation_request_input_hash_drift",
      "Skill Activation Request input hash differs."
    );
  }
  return decoded;
};

export const decodeSkillActivationReceiptV1 = (
  value: unknown
): SkillActivationReceiptV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "skillActivationId",
      "runId",
      "requestId",
      "idempotencyKey",
      "resolutionPlanHash",
      "activationRequestHash",
      "conflictRegistrySnapshotHash",
      "source",
      "principalHash",
      "resolvedClosureHash",
      "toolCatalogHash",
      "skillCatalogHash",
      "uxCapabilitySnapshotHash",
      "aclSnapshotHash",
      "skillInputHash",
      "budgetReservationHash",
      "parentSkillActivationId",
      "parentActivationReceiptHash",
      "status",
      "issuedAt",
      "expiresAt",
      "receiptHash",
    ],
    [],
    "skillActivationReceipt"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationReceipt
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "activation_receipt_contract_mismatch",
      "Skill Activation Receipt contract differs."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationReceipt,
    skillActivationId: requiredIdV1(record.skillActivationId, "skillActivationReceipt.skillActivationId"),
    runId: requiredIdV1(record.runId, "skillActivationReceipt.runId"),
    requestId: requiredIdV1(record.requestId, "skillActivationReceipt.requestId"),
    idempotencyKey: requiredIdV1(record.idempotencyKey, "skillActivationReceipt.idempotencyKey"),
    resolutionPlanHash: requiredHashV1(record.resolutionPlanHash, "skillActivationReceipt.resolutionPlanHash"),
    activationRequestHash: requiredHashV1(record.activationRequestHash, "skillActivationReceipt.activationRequestHash"),
    conflictRegistrySnapshotHash: requiredHashV1(
      record.conflictRegistrySnapshotHash,
      "skillActivationReceipt.conflictRegistrySnapshotHash"
    ),
    source: requiredEnumV1(
      record.source,
      ["user_explicit", "actor_selected", "dependency"] as const,
      "skillActivationReceipt.source"
    ),
    principalHash: requiredHashV1(record.principalHash, "skillActivationReceipt.principalHash"),
    resolvedClosureHash: requiredHashV1(record.resolvedClosureHash, "skillActivationReceipt.resolvedClosureHash"),
    toolCatalogHash: requiredHashV1(record.toolCatalogHash, "skillActivationReceipt.toolCatalogHash"),
    skillCatalogHash: requiredHashV1(record.skillCatalogHash, "skillActivationReceipt.skillCatalogHash"),
    uxCapabilitySnapshotHash: requiredHashV1(record.uxCapabilitySnapshotHash, "skillActivationReceipt.uxCapabilitySnapshotHash"),
    aclSnapshotHash: requiredHashV1(record.aclSnapshotHash, "skillActivationReceipt.aclSnapshotHash"),
    skillInputHash: requiredHashV1(record.skillInputHash, "skillActivationReceipt.skillInputHash"),
    budgetReservationHash: requiredHashV1(record.budgetReservationHash, "skillActivationReceipt.budgetReservationHash"),
    parentSkillActivationId:
      record.parentSkillActivationId === null
        ? null
        : requiredIdV1(record.parentSkillActivationId, "skillActivationReceipt.parentSkillActivationId"),
    parentActivationReceiptHash:
      record.parentActivationReceiptHash === null
        ? null
        : requiredHashV1(record.parentActivationReceiptHash, "skillActivationReceipt.parentActivationReceiptHash"),
    status: requiredEnumV1(
      record.status,
      ["active", "unavailable"] as const,
      "skillActivationReceipt.status"
    ),
    issuedAt: requiredTimestampV1(record.issuedAt, "skillActivationReceipt.issuedAt"),
    expiresAt: requiredTimestampV1(record.expiresAt, "skillActivationReceipt.expiresAt"),
  } as const;
  if (
    Date.parse(material.expiresAt) <= Date.parse(material.issuedAt) ||
    (material.parentSkillActivationId === null) !==
      (material.parentActivationReceiptHash === null)
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "activation_receipt_temporal_or_parent_invalid",
      "Skill Activation Receipt expiry or parent binding is invalid."
    );
  }
  const receiptHash = requiredHashV1(record.receiptHash, "skillActivationReceipt.receiptHash");
  if (receiptHash !== hashCanonicalJsonV1(material)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "activation_receipt_hash_drift",
      "Skill Activation Receipt hash differs."
    );
  }
  return { ...material, receiptHash };
};

type ActivationInput = Readonly<{
  request: SkillActivationRequestV1;
  plan: SkillResolutionPlanV1;
  principalHash: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxCapabilitySnapshotHash: string;
  aclSnapshotHash: string;
  conflictRegistrySnapshotHash: string;
  issuedAt: string;
  expiresAt: string;
}>;

const sourceForClosure = (
  plan: SkillResolutionPlanV1,
  closure: ResolvedSkillClosureV1
) => {
  const requested = plan.requestedSkills.filter(
    (entry) =>
      entry.skillId === closure.skillId &&
      entry.exactVersion === closure.skillVersion &&
      entry.packageHash === closure.packageHash
  );
  if (requested.length !== 1) {
    throw new AuthoritySkillLifecycleErrorV1(
      "activation_plan_source_unresolved",
      "Activation source does not resolve exactly once in the Plan."
    );
  }
  return requested[0]!.source;
};

export class CandidateSkillActivationLedgerV1 {
  private readonly receiptsByIdempotency = new Map<
    string,
    Readonly<{ requestHash: string; receipt: SkillActivationReceiptV1 }>
  >();
  private readonly receiptsByActivationId = new Map<string, SkillActivationReceiptV1>();
  private readonly receiptsByBudgetReservation = new Map<
    string,
    Readonly<{ requestHash: string; receipt: SkillActivationReceiptV1 }>
  >();
  private readonly transitionsByIdempotency = new Map<
    string,
    Readonly<{
      materialHash: string;
      receipt: SkillActivationTransitionReceiptV1;
    }>
  >();
  private readonly terminalTransitionByActivationId = new Map<
    string,
    SkillActivationTransitionReceiptV1
  >();
  private readonly toolInvocationsByIdempotency = new Map<
    string,
    Readonly<{ requestHash: string; request: SkillToolInvocationRequestV1 }>
  >();
  private readonly toolInvocationCountByActivation = new Map<string, number>();
  private readonly toolInvocationCountByRunAndTool = new Map<string, number>();

  constructor(
    private readonly evidenceAuthority: SkillEvidenceAuthorityV1 | null = null
  ) {}

  activate(input: ActivationInput): SkillActivationReceiptV1 {
    const request = decodeSkillActivationRequestV1(input.request);
    const plan = decodeSkillResolutionPlanV1(input.plan);
    const requestHash = hashCanonicalJsonV1(request);
    const key = `${request.runId}\u0000${request.idempotencyKey}`;
    if (
      plan.runId !== request.runId ||
      plan.requestId !== request.requestId ||
      plan.planHash !== request.resolutionPlanHash ||
      plan.kernelPrincipalBindingRef !== request.kernelPrincipalBindingRef ||
      plan.toolCatalogHash !== input.toolCatalogHash ||
      plan.skillCatalogHash !== input.skillCatalogHash ||
      plan.uxCapabilitySnapshotHash !== input.uxCapabilitySnapshotHash ||
      plan.aclSnapshotHash !== input.aclSnapshotHash ||
      plan.conflictRegistrySnapshotHash !== input.conflictRegistrySnapshotHash ||
      plan.conflictRegistrySnapshotHash !==
        request.conflictRegistrySnapshotHash
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_plan_binding_mismatch",
        "Activation request is outside the exact persisted Resolution Plan."
      );
    }
    const closure = plan.orderedClosures.find(
      (entry) => entry.closureHash === request.resolvedClosureHash
    );
    const reservation = plan.closureBudgetReservations.find(
      (entry) => entry.resolvedClosureHash === request.resolvedClosureHash
    );
    if (!closure || !reservation || reservation.reservationHash !== request.budgetReservationHash) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_closure_or_budget_unresolved",
        "Activation closure or per-closure budget reservation is unavailable."
      );
    }
    const previous = this.receiptsByIdempotency.get(key);
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new AuthoritySkillLifecycleErrorV1(
          "activation_idempotency_conflict",
          "Same activation idempotency key was reused with different material."
        );
      }
      return structuredClone(previous.receipt);
    }
    const reservationKey = `${request.runId}\u0000${plan.planHash}\u0000${reservation.reservationHash}`;
    const reservationUse = this.receiptsByBudgetReservation.get(reservationKey);
    if (reservationUse) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_budget_reservation_already_consumed",
        "One per-closure budget reservation cannot activate more than once."
      );
    }
    const issuedAt = requiredTimestampV1(input.issuedAt, "skillActivation.issuedAt");
    const expiresAt = requiredTimestampV1(input.expiresAt, "skillActivation.expiresAt");
    if (
      Date.parse(expiresAt) <= Date.parse(issuedAt) ||
      Date.parse(issuedAt) < Date.parse(request.requestedAt)
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_expiry_invalid",
        "Activation expiry must be after issuance."
      );
    }
    if (sourceForClosure(plan, closure) !== request.source) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_source_mismatch",
        "Activation source differs from the Resolution Plan."
      );
    }
    if (request.source === "dependency") {
      if (!request.parentSkillActivationId || !request.parentActivationReceiptHash) {
        throw new AuthoritySkillLifecycleErrorV1(
          "dependency_activation_parent_missing",
          "Dependency activation requires an active parent receipt."
        );
      }
      const parent = this.receiptsByActivationId.get(request.parentSkillActivationId);
      const parentClosure = parent
          ? plan.orderedClosures.find(
            (entry) => entry.closureHash === parent.resolvedClosureHash
          )
        : null;
      if (
        !parent ||
        parent.runId !== request.runId ||
        parent.status !== "active" ||
        this.terminalTransitionByActivationId.has(parent.skillActivationId) ||
        Date.parse(parent.expiresAt) <= Date.parse(issuedAt) ||
        Date.parse(expiresAt) > Date.parse(parent.expiresAt) ||
        parent.receiptHash !== request.parentActivationReceiptHash ||
        !parentClosure?.dependencies.some(
          (dependency) =>
            dependency.dependencyClosureHash === request.resolvedClosureHash
        )
      ) {
        throw new AuthoritySkillLifecycleErrorV1(
          "dependency_activation_parent_mismatch",
          "Dependency activation parent does not prove the exact dependency edge."
        );
      }
    } else if (
      request.parentSkillActivationId !== null ||
      request.parentActivationReceiptHash !== null
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "root_activation_parent_forbidden",
        "Root activation cannot carry a dependency parent."
      );
    }
    const skillActivationId = `skill-activation-${requestHash.slice(0, 24)}`;
    const material = {
      contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationReceipt,
      skillActivationId,
      runId: request.runId,
      requestId: request.requestId,
      idempotencyKey: request.idempotencyKey,
      resolutionPlanHash: request.resolutionPlanHash,
      activationRequestHash: requestHash,
      conflictRegistrySnapshotHash: request.conflictRegistrySnapshotHash,
      source: request.source,
      principalHash: requiredHashV1(input.principalHash, "skillActivation.principalHash"),
      resolvedClosureHash: request.resolvedClosureHash,
      toolCatalogHash: requiredHashV1(
        input.toolCatalogHash,
        "skillActivation.toolCatalogHash"
      ),
      skillCatalogHash: requiredHashV1(
        input.skillCatalogHash,
        "skillActivation.skillCatalogHash"
      ),
      uxCapabilitySnapshotHash: requiredHashV1(
        input.uxCapabilitySnapshotHash,
        "skillActivation.uxCapabilitySnapshotHash"
      ),
      aclSnapshotHash: requiredHashV1(
        input.aclSnapshotHash,
        "skillActivation.aclSnapshotHash"
      ),
      skillInputHash: request.skillInputHash,
      budgetReservationHash: request.budgetReservationHash,
      parentSkillActivationId: request.parentSkillActivationId,
      parentActivationReceiptHash: request.parentActivationReceiptHash,
      status: "active" as const,
      issuedAt,
      expiresAt,
    };
    const receipt = { ...material, receiptHash: hashCanonicalJsonV1(material) };
    this.receiptsByIdempotency.set(key, { requestHash, receipt });
    this.receiptsByBudgetReservation.set(reservationKey, {
      requestHash,
      receipt,
    });
    this.receiptsByActivationId.set(skillActivationId, receipt);
    return structuredClone(receipt);
  }

  authorizeToolInvocation(input: Readonly<{
    request: Omit<
      SkillToolInvocationRequestV1,
      "contractVersion" | "argumentsHash"
    >;
    closure: ResolvedSkillClosureV1;
    plan: SkillResolutionPlanV1;
    toolCatalog: CompiledToolCatalogV1;
    activationReceipt: SkillActivationReceiptV1;
    now: string;
  }>): SkillToolInvocationRequestV1 {
    const plan = decodeSkillResolutionPlanV1(input.plan);
    const closure = decodeResolvedSkillClosureV1(input.closure);
    const activationReceipt = decodeSkillActivationReceiptV1(
      input.activationReceipt
    );
    const toolCatalog = decodeCompiledToolCatalogV1(input.toolCatalog);
    const active = this.receiptsByActivationId.get(
      activationReceipt.skillActivationId
    );
    const now = requiredTimestampV1(input.now, "skillToolInvocation.now");
    const reservation = plan.closureBudgetReservations.find(
      (entry) => entry.resolvedClosureHash === closure.closureHash
    );
    if (
      !active ||
      active.receiptHash !== activationReceipt.receiptHash ||
      this.terminalTransitionByActivationId.has(active.skillActivationId) ||
      Date.parse(now) < Date.parse(active.issuedAt) ||
      Date.parse(now) >= Date.parse(active.expiresAt) ||
      plan.runId !== active.runId ||
      plan.planHash !== active.resolutionPlanHash ||
      toolCatalog.catalogHash !== active.toolCatalogHash ||
      plan.conflictRegistrySnapshotHash !==
        active.conflictRegistrySnapshotHash ||
      !reservation ||
      reservation.reservationHash !== active.budgetReservationHash
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_tool_invocation_not_currently_admitted",
        "Skill Tool invocation requires a current active receipt and exact Plan reservation."
      );
    }
    const request = createSkillToolInvocationRequestV1(
      input.request,
      closure,
      activationReceipt
    );
    const compiledTools = toolCatalog.tools.filter(
      (tool) =>
        tool.definition.toolId === request.toolId &&
        tool.definition.toolVersion === request.toolVersion &&
        tool.definitionHash === request.toolDefinitionHash &&
        tool.executorBinding.bindingHash === request.executorBindingHash
    );
    if (compiledTools.length !== 1) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_tool_invocation_catalog_mismatch",
        "Skill Tool invocation must resolve exactly once in the active Tool Catalog."
      );
    }
    const projectedArguments = projectAuthorityToolArgumentsV1({
      definition: compiledTools[0]!.definition,
      argumentsValue: JSON.parse(request.argumentsJson) as unknown,
    });
    if (canonicalJsonV1(projectedArguments) !== request.argumentsJson) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_tool_invocation_argument_projection_drift",
        "Skill Tool invocation arguments differ from the exact registered Tool argument projection."
      );
    }
    const key = `${request.runId}\u0000${request.skillActivationId}\u0000${request.idempotencyKey}`;
    const requestHash = hashCanonicalJsonV1(request);
    const previous = this.toolInvocationsByIdempotency.get(key);
    if (previous) {
      if (previous.requestHash !== requestHash) {
        throw new AuthoritySkillLifecycleErrorV1(
          "skill_tool_invocation_idempotency_conflict",
          "Skill Tool invocation idempotency key was reused with different material."
        );
      }
      return structuredClone(previous.request);
    }
    const consumed =
      this.toolInvocationCountByActivation.get(active.skillActivationId) ?? 0;
    if (consumed >= reservation.maxToolCalls) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_tool_invocation_budget_exhausted",
        "Skill Tool invocation exceeds the per-closure call reservation."
      );
    }
    const runToolKey = `${request.runId}\u0000${request.toolId}\u0000${request.toolVersion}`;
    const runToolConsumed =
      this.toolInvocationCountByRunAndTool.get(runToolKey) ?? 0;
    if (
      runToolConsumed >=
      compiledTools[0]!.definition.budgets.maxCallsPerRun
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "authority_tool_run_budget_exhausted",
        "Authority Tool invocation exceeds the frozen per-Run Tool budget."
      );
    }
    this.toolInvocationsByIdempotency.set(key, { requestHash, request });
    this.toolInvocationCountByActivation.set(
      active.skillActivationId,
      consumed + 1
    );
    this.toolInvocationCountByRunAndTool.set(
      runToolKey,
      runToolConsumed + 1
    );
    return structuredClone(request);
  }

  transition(input: Readonly<{
    activationReceipt: SkillActivationReceiptV1;
    nextState: "completed" | "cancelled";
    transitionReasonCode: string;
    evidenceSet: SkillEvidenceSetV1 | null;
    evidenceContext: SkillEvidenceContextV1 | null;
    idempotencyKey: string;
    issuedAt: string;
  }>): SkillActivationTransitionReceiptV1 {
    const sourceReceipt = decodeSkillActivationReceiptV1(input.activationReceipt);
    const evidenceSet =
      input.evidenceSet === null
        ? null
        : decodeSkillEvidenceSetV1(input.evidenceSet);
    const active = this.receiptsByActivationId.get(sourceReceipt.skillActivationId);
    if (!active || active.receiptHash !== sourceReceipt.receiptHash) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_transition_source_mismatch",
        "Transition source is not the exact active Activation Receipt."
      );
    }
    if (
      input.nextState === "completed" &&
      (evidenceSet === null || input.evidenceContext === null)
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_completion_evidence_missing",
        "Completed activation requires a Skill Evidence Set and its contextual closure."
      );
    }
    if (
      input.nextState === "cancelled" &&
      (evidenceSet !== null || input.evidenceContext !== null)
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_cancellation_evidence_forbidden",
        "Cancelled activation cannot attach completion Evidence."
      );
    }
    if (
      evidenceSet !== null &&
      (evidenceSet.runId !== active.runId ||
        evidenceSet.skillActivationId !== active.skillActivationId ||
        evidenceSet.activationReceiptHash !== active.receiptHash ||
        evidenceSet.resolvedClosureHash !== active.resolvedClosureHash)
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_completion_evidence_mismatch",
        "Terminal evidence belongs to a different Run, Activation, or closure."
      );
    }
    if (evidenceSet !== null && input.evidenceContext !== null) {
      if (!this.evidenceAuthority) {
        throw new AuthoritySkillLifecycleErrorV1(
          "activation_completion_evidence_authority_missing",
          "Completed activation requires the server-owned Evidence authority port."
        );
      }
      verifySkillEvidenceClosureV1({
        evidenceSet,
        activationReceipt: active,
        context: input.evidenceContext,
        authority: this.evidenceAuthority,
      });
    }
    const transitionIssuedAt = requiredTimestampV1(
      input.issuedAt,
      "skillTransition.issuedAt"
    );
    if (Date.parse(transitionIssuedAt) < Date.parse(active.issuedAt)) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_transition_time_before_source",
        "Terminal transition cannot be issued before its Activation Receipt."
      );
    }
    const transitionBase = {
      contractVersion:
        FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationTransitionReceipt,
      skillActivationId: active.skillActivationId,
      runId: active.runId,
      previousState: "active" as const,
      nextState: input.nextState,
      previousReceiptHash: active.receiptHash,
      transitionReasonCode: requiredIdV1(
        input.transitionReasonCode,
        "skillTransition.transitionReasonCode"
      ),
      evidenceSetHash:
        evidenceSet === null
          ? null
          : requiredHashV1(
              evidenceSet.evidenceSetHash,
              "skillTransition.evidenceSetHash"
            ),
      idempotencyKey: requiredIdV1(
        input.idempotencyKey,
        "skillTransition.idempotencyKey"
      ),
      issuedAt: transitionIssuedAt,
    };
    const identityHash = hashCanonicalJsonV1(transitionBase);
    const transitionReceiptId = `skill-transition-${identityHash.slice(0, 24)}`;
    const finalMaterial = {
      contractVersion: transitionBase.contractVersion,
      transitionReceiptId,
      skillActivationId: transitionBase.skillActivationId,
      runId: transitionBase.runId,
      previousState: transitionBase.previousState,
      nextState: transitionBase.nextState,
      previousReceiptHash: transitionBase.previousReceiptHash,
      transitionReasonCode: transitionBase.transitionReasonCode,
      evidenceSetHash: transitionBase.evidenceSetHash,
      idempotencyKey: transitionBase.idempotencyKey,
      issuedAt: transitionBase.issuedAt,
    };
    const materialHash = hashCanonicalJsonV1(finalMaterial);
    const key = `${active.runId}\u0000${input.idempotencyKey}`;
    const previous = this.transitionsByIdempotency.get(key);
    if (previous) {
      if (previous.materialHash !== materialHash) {
        throw new AuthoritySkillLifecycleErrorV1(
          "activation_transition_idempotency_conflict",
          "Transition idempotency key was reused with different material."
        );
      }
      return structuredClone(previous.receipt);
    }
    const terminal = this.terminalTransitionByActivationId.get(
      active.skillActivationId
    );
    if (terminal) {
      throw new AuthoritySkillLifecycleErrorV1(
        "activation_already_terminal",
        "An Activation Receipt can have only one immutable terminal transition."
      );
    }
    const receipt = {
      ...finalMaterial,
      receiptHash: hashCanonicalJsonV1(finalMaterial),
    };
    this.transitionsByIdempotency.set(key, { materialHash, receipt });
    this.terminalTransitionByActivationId.set(active.skillActivationId, receipt);
    return structuredClone(receipt);
  }
}

export const createSkillToolInvocationRequestV1 = (
  input: Omit<SkillToolInvocationRequestV1, "contractVersion" | "argumentsHash">,
  closure: ResolvedSkillClosureV1,
  activationReceipt: SkillActivationReceiptV1
): SkillToolInvocationRequestV1 => {
  const activeReceipt = decodeSkillActivationReceiptV1(activationReceipt);
  const decodedClosure = decodeResolvedSkillClosureV1(closure);
  const argumentsJson = requiredCanonicalJsonTextV1(
    input.argumentsJson,
    "skillToolInvocation.argumentsJson"
  );
  assertSkillInvocationWithinClosureV1({
    closure: decodedClosure,
    toolId: input.toolId,
    toolVersion: input.toolVersion,
    definitionHash: input.toolDefinitionHash,
    executorBindingHash: input.executorBindingHash,
  });
  if (
    activeReceipt.status !== "active" ||
    activeReceipt.runId !== input.runId ||
    activeReceipt.skillActivationId !== input.skillActivationId ||
    activeReceipt.receiptHash !== input.activationReceiptHash ||
    activeReceipt.resolvedClosureHash !== decodedClosure.closureHash ||
    input.resolvedClosureHash !== decodedClosure.closureHash ||
    activeReceipt.budgetReservationHash !== input.budgetReservationHash
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_tool_invocation_activation_mismatch",
      "Skill Tool invocation is outside the exact active receipt, closure, or budget reservation."
    );
  }
  return {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillToolInvocationRequest,
    runId: requiredIdV1(input.runId, "skillToolInvocation.runId"),
    skillActivationId: requiredIdV1(
      input.skillActivationId,
      "skillToolInvocation.skillActivationId"
    ),
    activationReceiptHash: requiredHashV1(
      input.activationReceiptHash,
      "skillToolInvocation.activationReceiptHash"
    ),
    resolvedClosureHash: requiredHashV1(
      input.resolvedClosureHash,
      "skillToolInvocation.resolvedClosureHash"
    ),
    toolId: requiredIdV1(input.toolId, "skillToolInvocation.toolId"),
    toolVersion: requiredStringV1(
      input.toolVersion,
      "skillToolInvocation.toolVersion",
      80
    ),
    toolDefinitionHash: requiredHashV1(
      input.toolDefinitionHash,
      "skillToolInvocation.toolDefinitionHash"
    ),
    executorBindingHash: requiredHashV1(
      input.executorBindingHash,
      "skillToolInvocation.executorBindingHash"
    ),
    callId: requiredIdV1(input.callId, "skillToolInvocation.callId"),
    requestId: requiredIdV1(input.requestId, "skillToolInvocation.requestId"),
    idempotencyKey: requiredIdV1(
      input.idempotencyKey,
      "skillToolInvocation.idempotencyKey"
    ),
    argumentsJson,
    argumentsHash: hashUtf8V1(argumentsJson),
    budgetReservationHash: requiredHashV1(
      input.budgetReservationHash,
      "skillToolInvocation.budgetReservationHash"
    ),
  };
};

export const decodeSkillToolInvocationRequestV1 = (
  value: unknown
): SkillToolInvocationRequestV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "skillActivationId",
      "activationReceiptHash",
      "resolvedClosureHash",
      "toolId",
      "toolVersion",
      "toolDefinitionHash",
      "executorBindingHash",
      "callId",
      "requestId",
      "idempotencyKey",
      "argumentsJson",
      "argumentsHash",
      "budgetReservationHash",
    ],
    [],
    "skillToolInvocation"
  );
  if (
    record.contractVersion !==
    FORMAL_R3_AUTHORITY_FABRIC_V1.skillToolInvocationRequest
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_tool_invocation_contract_mismatch",
      "Skill Tool Invocation Request contract differs."
    );
  }
  const argumentsJson = requiredCanonicalJsonTextV1(
    record.argumentsJson,
    "skillToolInvocation.argumentsJson"
  );
  const decoded = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillToolInvocationRequest,
    runId: requiredIdV1(record.runId, "skillToolInvocation.runId"),
    skillActivationId: requiredIdV1(
      record.skillActivationId,
      "skillToolInvocation.skillActivationId"
    ),
    activationReceiptHash: requiredHashV1(
      record.activationReceiptHash,
      "skillToolInvocation.activationReceiptHash"
    ),
    resolvedClosureHash: requiredHashV1(
      record.resolvedClosureHash,
      "skillToolInvocation.resolvedClosureHash"
    ),
    toolId: requiredIdV1(record.toolId, "skillToolInvocation.toolId"),
    toolVersion: requiredStringV1(
      record.toolVersion,
      "skillToolInvocation.toolVersion",
      80
    ),
    toolDefinitionHash: requiredHashV1(
      record.toolDefinitionHash,
      "skillToolInvocation.toolDefinitionHash"
    ),
    executorBindingHash: requiredHashV1(
      record.executorBindingHash,
      "skillToolInvocation.executorBindingHash"
    ),
    callId: requiredIdV1(record.callId, "skillToolInvocation.callId"),
    requestId: requiredIdV1(record.requestId, "skillToolInvocation.requestId"),
    idempotencyKey: requiredIdV1(
      record.idempotencyKey,
      "skillToolInvocation.idempotencyKey"
    ),
    argumentsJson,
    argumentsHash: requiredHashV1(
      record.argumentsHash,
      "skillToolInvocation.argumentsHash"
    ),
    budgetReservationHash: requiredHashV1(
      record.budgetReservationHash,
      "skillToolInvocation.budgetReservationHash"
    ),
  } as const;
  if (decoded.argumentsHash !== hashUtf8V1(argumentsJson)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_tool_invocation_arguments_hash_drift",
      "Skill Tool Invocation Request argument hash differs."
    );
  }
  return decoded;
};

export const createAuthorityToolReceiptBindingV1 = (input: Omit<
  AuthorityToolReceiptBindingV1,
  "contractVersion" | "bindingHash"
>): AuthorityToolReceiptBindingV1 => {
  if (
    (input.effect === "durable_write" || input.effect === "external_write") &&
    input.readbackHash === null
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "tool_receipt_write_readback_missing",
      "Write-effect Tool Receipts require a readback hash."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.authorityToolReceiptBinding,
    runId: requiredIdV1(input.runId, "toolReceiptBinding.runId"),
    receiptId: requiredIdV1(input.receiptId, "toolReceiptBinding.receiptId"),
    receiptHash: requiredHashV1(input.receiptHash, "toolReceiptBinding.receiptHash"),
    skillActivationId: requiredIdV1(
      input.skillActivationId,
      "toolReceiptBinding.skillActivationId"
    ),
    activationReceiptHash: requiredHashV1(
      input.activationReceiptHash,
      "toolReceiptBinding.activationReceiptHash"
    ),
    resolvedClosureHash: requiredHashV1(
      input.resolvedClosureHash,
      "toolReceiptBinding.resolvedClosureHash"
    ),
    toolCatalogHash: requiredHashV1(
      input.toolCatalogHash,
      "toolReceiptBinding.toolCatalogHash"
    ),
    toolDefinitionHash: requiredHashV1(
      input.toolDefinitionHash,
      "toolReceiptBinding.toolDefinitionHash"
    ),
    executorBindingHash: requiredHashV1(
      input.executorBindingHash,
      "toolReceiptBinding.executorBindingHash"
    ),
    effect: requiredEnumV1(
      input.effect,
      ["private_read", "presentation_state", "durable_write", "external_write"] as const,
      "toolReceiptBinding.effect"
    ),
    readbackHash:
      input.readbackHash === null
        ? null
        : requiredHashV1(input.readbackHash, "toolReceiptBinding.readbackHash"),
  } as const;
  return { ...material, bindingHash: hashCanonicalJsonV1(material) };
};

export const decodeAuthorityToolReceiptBindingV1 = (
  value: unknown
): AuthorityToolReceiptBindingV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "receiptId",
      "receiptHash",
      "skillActivationId",
      "activationReceiptHash",
      "resolvedClosureHash",
      "toolCatalogHash",
      "toolDefinitionHash",
      "executorBindingHash",
      "effect",
      "readbackHash",
      "bindingHash",
    ],
    [],
    "toolReceiptBinding"
  );
  if (
    record.contractVersion !==
      FORMAL_R3_AUTHORITY_FABRIC_V1.authorityToolReceiptBinding
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "tool_receipt_binding_contract_mismatch",
      "Authority Tool Receipt Binding contract differs."
    );
  }
  const decoded = createAuthorityToolReceiptBindingV1({
    runId: record.runId as string,
    receiptId: record.receiptId as string,
    receiptHash: record.receiptHash as string,
    skillActivationId: record.skillActivationId as string,
    activationReceiptHash: record.activationReceiptHash as string,
    resolvedClosureHash: record.resolvedClosureHash as string,
    toolCatalogHash: record.toolCatalogHash as string,
    toolDefinitionHash: record.toolDefinitionHash as string,
    executorBindingHash: record.executorBindingHash as string,
    effect: record.effect as AuthorityToolReceiptBindingV1["effect"],
    readbackHash: record.readbackHash as string | null,
  });
  if (record.bindingHash !== decoded.bindingHash) {
    throw new AuthoritySkillLifecycleErrorV1(
      "tool_receipt_binding_hash_drift",
      "Authority Tool Receipt Binding hash differs."
    );
  }
  return decoded;
};

export const createSkillEvidenceSetV1 = (input: Readonly<{
  runId: string;
  skillActivationId: string;
  resolvedClosureHash: string;
  actorCallId: string;
  promptCompositionManifest: PromptCompositionManifestV1;
  activationReceiptHash: string;
  toolReceiptBindings: readonly AuthorityToolReceiptBindingV1[];
  rubricHash: string;
  rubricEvaluationHash: string;
  claimPolicyHash: string;
  budgetConsumptionHash: string;
  activationReceipt: SkillActivationReceiptV1;
  closure: ResolvedSkillClosureV1;
}>): SkillEvidenceSetV1 => {
  const activationReceipt = decodeSkillActivationReceiptV1(
    input.activationReceipt
  );
  const closure = decodeResolvedSkillClosureV1(input.closure);
  const promptCompositionManifest = decodePromptCompositionManifestV1(
    input.promptCompositionManifest
  );
  if (
    activationReceipt.runId !== input.runId ||
    activationReceipt.skillActivationId !== input.skillActivationId ||
    activationReceipt.receiptHash !== input.activationReceiptHash ||
    activationReceipt.resolvedClosureHash !== input.resolvedClosureHash ||
    closure.closureHash !== input.resolvedClosureHash
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_activation_or_closure_mismatch",
      "Skill Evidence Set is outside the exact Activation Receipt or closure."
    );
  }
  if (
    promptCompositionManifest.runId !== input.runId ||
    promptCompositionManifest.actorCallId !== input.actorCallId ||
    promptCompositionManifest.resolutionPlanHash !==
      activationReceipt.resolutionPlanHash ||
    !promptCompositionManifest.activeSkillClosureHashes.includes(
      input.resolvedClosureHash
    ) ||
    !promptCompositionManifest.activeSkillActivationReceiptHashes.includes(
      input.activationReceiptHash
    )
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_prompt_binding_mismatch",
      "Skill Evidence prompt does not belong to the exact Plan, Activation, or closure."
    );
  }
  if (
    input.rubricHash !== closure.rubricHash ||
    input.claimPolicyHash !== closure.claimPolicyHash
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_rubric_or_claim_policy_mismatch",
      "Skill Evidence must use the closure-frozen rubric and claim policy."
    );
  }
  const observedClaimEffects = new Set<string>();
  const linkedToolReceipts = [...input.toolReceiptBindings]
    .map((bindingInput) => {
      const binding = decodeAuthorityToolReceiptBindingV1(bindingInput);
      const closureTool = closure.tools.find(
        (tool) =>
          tool.definitionHash === binding.toolDefinitionHash &&
          tool.executorBindingHash === binding.executorBindingHash &&
          tool.requiredEffect === binding.effect
      );
      if (
        binding.runId !== input.runId ||
        binding.skillActivationId !== input.skillActivationId ||
        binding.activationReceiptHash !== input.activationReceiptHash ||
        binding.resolvedClosureHash !== input.resolvedClosureHash ||
        binding.toolCatalogHash !== activationReceipt.toolCatalogHash ||
        !closureTool
      ) {
        throw new AuthoritySkillLifecycleErrorV1(
          "skill_evidence_receipt_binding_mismatch",
          "Tool Receipt belongs to a different Run, Activation, or closure."
        );
      }
      for (const effect of closureTool.supportedClaimEffects) {
        observedClaimEffects.add(effect);
      }
      return {
        receiptId: binding.receiptId,
        receiptHash: binding.receiptHash,
        receiptBindingHash: binding.bindingHash,
        effect: binding.effect,
        readbackHash: binding.readbackHash,
      };
    })
    .sort((left, right) => compareCodeUnitV1(left.receiptId, right.receiptId));
  if (new Set(linkedToolReceipts.map((entry) => entry.receiptId)).size !== linkedToolReceipts.length) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_duplicate_receipt",
      "Skill Evidence Set cannot contain duplicate Tool Receipts."
    );
  }
  const missingReceiptEffects = closure.requiredReceiptEffects.filter(
    (effect) => !observedClaimEffects.has(effect)
  );
  if (missingReceiptEffects.length > 0) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_required_receipt_effect_missing",
      `Skill Evidence is missing required receipt effects: ${missingReceiptEffects.join(",")}.`
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillEvidenceSet,
    runId: requiredIdV1(input.runId, "skillEvidence.runId"),
    skillActivationId: requiredIdV1(
      input.skillActivationId,
      "skillEvidence.skillActivationId"
    ),
    resolvedClosureHash: requiredHashV1(
      input.resolvedClosureHash,
      "skillEvidence.resolvedClosureHash"
    ),
    actorCallId: requiredIdV1(input.actorCallId, "skillEvidence.actorCallId"),
    promptCompositionManifestHash: requiredHashV1(
      promptCompositionManifest.manifestHash,
      "skillEvidence.promptCompositionManifestHash"
    ),
    resolutionPlanHash: activationReceipt.resolutionPlanHash,
    activationReceiptHash: requiredHashV1(
      input.activationReceiptHash,
      "skillEvidence.activationReceiptHash"
    ),
    linkedToolReceipts,
    rubricHash: requiredHashV1(input.rubricHash, "skillEvidence.rubricHash"),
    rubricEvaluationHash: requiredHashV1(
      input.rubricEvaluationHash,
      "skillEvidence.rubricEvaluationHash"
    ),
    claimPolicyHash: requiredHashV1(
      input.claimPolicyHash,
      "skillEvidence.claimPolicyHash"
    ),
    budgetConsumptionHash: requiredHashV1(
      input.budgetConsumptionHash,
      "skillEvidence.budgetConsumptionHash"
    ),
  } as const;
  return { ...material, evidenceSetHash: hashCanonicalJsonV1(material) };
};

export const verifySkillEvidenceClosureV1 = (input: Readonly<{
  evidenceSet: SkillEvidenceSetV1;
  activationReceipt: SkillActivationReceiptV1;
  context: SkillEvidenceContextV1;
  authority: SkillEvidenceAuthorityV1;
}>): SkillEvidenceSetV1 => {
  const evidenceSet = decodeSkillEvidenceSetV1(input.evidenceSet);
  const activationReceipt = decodeSkillActivationReceiptV1(
    input.activationReceipt
  );
  const closure = decodeResolvedSkillClosureV1(input.context.closure);
  const promptCompositionManifest = decodePromptCompositionManifestV1(
    input.context.promptCompositionManifest
  );
  if (!input.authority.verifyPromptCompositionManifest(promptCompositionManifest)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_prompt_contextual_verification_failed",
      "Evidence source Prompt is not admitted by the server-owned contextual verifier."
    );
  }
  const toolReceiptBindings = evidenceSet.linkedToolReceipts.map((linked) => {
    const resolved = input.authority.resolveToolReceiptBinding(linked.receiptId);
    if (!resolved) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_evidence_receipt_store_miss",
        "Evidence Tool Receipt is absent from the trusted Receipt Store."
      );
    }
    const binding = decodeAuthorityToolReceiptBindingV1(resolved);
    if (
      binding.receiptHash !== linked.receiptHash ||
      binding.bindingHash !== linked.receiptBindingHash ||
      binding.effect !== linked.effect ||
      binding.readbackHash !== linked.readbackHash
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_evidence_receipt_store_drift",
        "Evidence Tool Receipt differs from the trusted Receipt Store binding."
      );
    }
    return binding;
  });
  const contextualEvidence = createSkillEvidenceSetV1({
    runId: evidenceSet.runId,
    skillActivationId: evidenceSet.skillActivationId,
    resolvedClosureHash: evidenceSet.resolvedClosureHash,
    actorCallId: evidenceSet.actorCallId,
    promptCompositionManifest,
    activationReceiptHash: evidenceSet.activationReceiptHash,
    toolReceiptBindings,
    rubricHash: evidenceSet.rubricHash,
    rubricEvaluationHash: evidenceSet.rubricEvaluationHash,
    claimPolicyHash: evidenceSet.claimPolicyHash,
    budgetConsumptionHash: evidenceSet.budgetConsumptionHash,
    activationReceipt,
    closure,
  });
  if (contextualEvidence.evidenceSetHash !== evidenceSet.evidenceSetHash) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_contextual_closure_drift",
      "Evidence differs from its actual Prompt, Activation, closure, or stored Tool Receipts."
    );
  }
  const verificationInput = {
    evidenceSet,
    activationReceipt,
    closure,
    promptCompositionManifest,
    toolReceiptBindings,
  } as const;
  if (!input.authority.verifyRubricEvaluation(verificationInput)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_rubric_evaluation_unverified",
      "Evidence rubric evaluation was not verified by the server-owned evaluator."
    );
  }
  if (!input.authority.verifyBudgetConsumption(verificationInput)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_budget_consumption_unverified",
      "Evidence budget consumption was not verified by the server-owned ledger."
    );
  }
  return contextualEvidence;
};

export const decodeSkillEvidenceSetV1 = (
  value: unknown
): SkillEvidenceSetV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "skillActivationId",
      "resolvedClosureHash",
      "actorCallId",
      "promptCompositionManifestHash",
      "resolutionPlanHash",
      "activationReceiptHash",
      "linkedToolReceipts",
      "rubricHash",
      "rubricEvaluationHash",
      "claimPolicyHash",
      "budgetConsumptionHash",
      "evidenceSetHash",
    ],
    [],
    "skillEvidence"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.skillEvidenceSet ||
    !Array.isArray(record.linkedToolReceipts)
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_contract_mismatch",
      "Skill Evidence Set contract differs."
    );
  }
  const linkedToolReceipts = record.linkedToolReceipts.map((entry, index) => {
    const path = `skillEvidence.linkedToolReceipts[${index}]`;
    const item = strictRecordShapeV1(
      entry,
      [
        "receiptId",
        "receiptHash",
        "receiptBindingHash",
        "effect",
        "readbackHash",
      ],
      [],
      path
    );
    const effect = requiredEnumV1(
      item.effect,
      ["private_read", "presentation_state", "durable_write", "external_write"] as const,
      `${path}.effect`
    );
    const readbackHash =
      item.readbackHash === null
        ? null
        : requiredHashV1(item.readbackHash, `${path}.readbackHash`);
    if (
      (effect === "durable_write" || effect === "external_write") &&
      readbackHash === null
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_evidence_write_readback_missing",
        "Write-effect Skill Evidence requires a readback hash."
      );
    }
    return {
      receiptId: requiredIdV1(item.receiptId, `${path}.receiptId`),
      receiptHash: requiredHashV1(item.receiptHash, `${path}.receiptHash`),
      receiptBindingHash: requiredHashV1(
        item.receiptBindingHash,
        `${path}.receiptBindingHash`
      ),
      effect,
      readbackHash,
    };
  });
  for (let index = 1; index < linkedToolReceipts.length; index += 1) {
    if (
      compareCodeUnitV1(
        linkedToolReceipts[index - 1]!.receiptId,
        linkedToolReceipts[index]!.receiptId
      ) >= 0
    ) {
      throw new AuthoritySkillLifecycleErrorV1(
        "skill_evidence_receipt_order_drift",
        "Skill Evidence Tool Receipts must be unique and canonically ordered."
      );
    }
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillEvidenceSet,
    runId: requiredIdV1(record.runId, "skillEvidence.runId"),
    skillActivationId: requiredIdV1(
      record.skillActivationId,
      "skillEvidence.skillActivationId"
    ),
    resolvedClosureHash: requiredHashV1(
      record.resolvedClosureHash,
      "skillEvidence.resolvedClosureHash"
    ),
    actorCallId: requiredIdV1(record.actorCallId, "skillEvidence.actorCallId"),
    promptCompositionManifestHash: requiredHashV1(
      record.promptCompositionManifestHash,
      "skillEvidence.promptCompositionManifestHash"
    ),
    resolutionPlanHash: requiredHashV1(
      record.resolutionPlanHash,
      "skillEvidence.resolutionPlanHash"
    ),
    activationReceiptHash: requiredHashV1(
      record.activationReceiptHash,
      "skillEvidence.activationReceiptHash"
    ),
    linkedToolReceipts,
    rubricHash: requiredHashV1(record.rubricHash, "skillEvidence.rubricHash"),
    rubricEvaluationHash: requiredHashV1(
      record.rubricEvaluationHash,
      "skillEvidence.rubricEvaluationHash"
    ),
    claimPolicyHash: requiredHashV1(
      record.claimPolicyHash,
      "skillEvidence.claimPolicyHash"
    ),
    budgetConsumptionHash: requiredHashV1(
      record.budgetConsumptionHash,
      "skillEvidence.budgetConsumptionHash"
    ),
  } as const;
  const evidenceSetHash = requiredHashV1(
    record.evidenceSetHash,
    "skillEvidence.evidenceSetHash"
  );
  if (evidenceSetHash !== hashCanonicalJsonV1(material)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_evidence_hash_drift",
      "Skill Evidence Set hash differs."
    );
  }
  return { ...material, evidenceSetHash };
};

export const decodeSkillActivationTransitionReceiptV1 = (
  value: unknown
): SkillActivationTransitionReceiptV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "transitionReceiptId",
      "skillActivationId",
      "runId",
      "previousState",
      "nextState",
      "previousReceiptHash",
      "transitionReasonCode",
      "evidenceSetHash",
      "idempotencyKey",
      "issuedAt",
      "receiptHash",
    ],
    [],
    "skillTransition"
  );
  if (
    record.contractVersion !==
    FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationTransitionReceipt
  ) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_transition_contract_mismatch",
      "Skill Activation Transition Receipt contract differs."
    );
  }
  const nextState = requiredEnumV1(
    record.nextState,
    ["completed", "cancelled"] as const,
    "skillTransition.nextState"
  );
  const evidenceSetHash =
    record.evidenceSetHash === null
      ? null
      : requiredHashV1(record.evidenceSetHash, "skillTransition.evidenceSetHash");
  if (nextState === "completed" && evidenceSetHash === null) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_transition_completion_evidence_missing",
      "Completed Skill transition requires an Evidence Set hash."
    );
  }
  const transitionBase = {
    contractVersion:
      FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationTransitionReceipt,
    skillActivationId: requiredIdV1(
      record.skillActivationId,
      "skillTransition.skillActivationId"
    ),
    runId: requiredIdV1(record.runId, "skillTransition.runId"),
    previousState: requiredEnumV1(
      record.previousState,
      ["active"] as const,
      "skillTransition.previousState"
    ),
    nextState,
    previousReceiptHash: requiredHashV1(
      record.previousReceiptHash,
      "skillTransition.previousReceiptHash"
    ),
    transitionReasonCode: requiredIdV1(
      record.transitionReasonCode,
      "skillTransition.transitionReasonCode"
    ),
    evidenceSetHash,
    idempotencyKey: requiredIdV1(
      record.idempotencyKey,
      "skillTransition.idempotencyKey"
    ),
    issuedAt: requiredTimestampV1(record.issuedAt, "skillTransition.issuedAt"),
  } as const;
  const expectedTransitionReceiptId = `skill-transition-${hashCanonicalJsonV1(
    transitionBase
  ).slice(0, 24)}`;
  const transitionReceiptId = requiredIdV1(
    record.transitionReceiptId,
    "skillTransition.transitionReceiptId"
  );
  if (transitionReceiptId !== expectedTransitionReceiptId) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_transition_identity_drift",
      "Skill Activation Transition identity differs from its material."
    );
  }
  const material = {
    contractVersion: transitionBase.contractVersion,
    transitionReceiptId,
    skillActivationId: transitionBase.skillActivationId,
    runId: transitionBase.runId,
    previousState: transitionBase.previousState,
    nextState: transitionBase.nextState,
    previousReceiptHash: transitionBase.previousReceiptHash,
    transitionReasonCode: transitionBase.transitionReasonCode,
    evidenceSetHash: transitionBase.evidenceSetHash,
    idempotencyKey: transitionBase.idempotencyKey,
    issuedAt: transitionBase.issuedAt,
  } as const;
  const receiptHash = requiredHashV1(
    record.receiptHash,
    "skillTransition.receiptHash"
  );
  if (receiptHash !== hashCanonicalJsonV1(material)) {
    throw new AuthoritySkillLifecycleErrorV1(
      "skill_transition_hash_drift",
      "Skill Activation Transition Receipt hash differs."
    );
  }
  return { ...material, receiptHash };
};
