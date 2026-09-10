import type {
  AuthorityToolEffectV1,
  CompiledToolCatalogV1,
  ExecutionAdmissionV1,
  ExecutionFingerprintMaterialV1,
  PromptCompositionManifestV1,
  PromptFragmentBindingV1,
  RunContextManifestV1,
  SkillActivationReceiptV1,
  SkillActivationTransitionReceiptV1,
  SkillCatalogV1,
  SkillEvidenceSetV1,
  SkillResolutionPlanV1,
} from "./authority-fabric-contracts";
import { FORMAL_R3_AUTHORITY_FABRIC_V1 } from "./authority-fabric-contracts";
import {
  assertCanonicalArrayV1,
  compareCodeUnitV1,
  decodeCanonicalStringSetV1,
  requiredEnumV1,
  requiredHashV1,
  requiredIdV1,
  requiredSafeIntegerV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordShapeV1,
} from "./authority-fabric-codecs";
import { decodeCompiledToolCatalogV1 } from "./authority-tool-compiler";
import {
  decodeSkillCatalogV1,
  decodeSkillResolutionPlanV1,
} from "./authority-skill-compiler";
import {
  decodeSkillActivationReceiptV1,
  decodeSkillActivationTransitionReceiptV1,
  type SkillEvidenceAuthorityV1,
  type SkillEvidenceContextV1,
  verifySkillEvidenceClosureV1,
} from "./authority-skill-lifecycle";
import {
  hashCanonicalJsonV1,
  hashUtf8V1,
} from "./strict-json";

export class AuthorityPromptCompositionErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthorityPromptCompositionErrorV1";
  }
}

const SOURCE_ORDER = Object.freeze({
  base: 0,
  policy: 1,
  tool_sheet: 2,
  skill: 3,
  context: 4,
  evidence: 5,
  unavailable: 6,
} as const);

const TRUST_BY_SOURCE = Object.freeze({
  base: "trusted_system",
  policy: "trusted_contract",
  tool_sheet: "trusted_contract",
  skill: "untrusted_instructional_content",
  context: "untrusted_fact",
  evidence: "trusted_contract",
  unavailable: "trusted_contract",
} as const);

type FragmentSource = keyof typeof SOURCE_ORDER;

export const PROMPT_WRAPPER_REGISTRY_V1 = Object.freeze(
  Object.fromEntries(
    (Object.keys(SOURCE_ORDER) as FragmentSource[]).map((sourceKind) => {
      const material = {
        registryVersion: "formal-r3-prompt-wrapper-registry-v1",
        sourceKind,
        trustClass: TRUST_BY_SOURCE[sourceKind],
        wrapperSemantics:
          sourceKind === "skill" || sourceKind === "context"
            ? "untrusted_content_delimited_no_authority_v1"
            : "trusted_contract_delimited_v1",
      } as const;
      return [
        sourceKind,
        Object.freeze({
          wrapperPolicyId: `formal-r3-${sourceKind}-wrapper-v1`,
          wrapperImplementationHash: hashCanonicalJsonV1(material),
          wrapperSemantics: material.wrapperSemantics,
        }),
      ];
    })
  ) as Readonly<
    Record<
      FragmentSource,
      Readonly<{
        wrapperPolicyId: string;
        wrapperImplementationHash: string;
        wrapperSemantics:
          | "untrusted_content_delimited_no_authority_v1"
          | "trusted_contract_delimited_v1";
      }>
    >
  >
);

const contextEntryKey = (entry: RunContextManifestV1["entries"][number]) =>
  entry.contextId;

export const createRunContextManifestV1 = (input: Omit<
  RunContextManifestV1,
  "contractVersion" | "manifestHash"
>): RunContextManifestV1 => {
  const entries = input.entries
    .map((entry, index) => {
      const path = `runContext.entries[${index}]`;
      return {
        contextId: requiredIdV1(entry.contextId, `${path}.contextId`),
        sourceKind: requiredEnumV1(
          entry.sourceKind,
          ["user_goal", "ux_fact", "resource_fact", "receipt_evidence"] as const,
          `${path}.sourceKind`
        ),
        sourceRef: requiredIdV1(entry.sourceRef, `${path}.sourceRef`),
        contentHash: requiredHashV1(entry.contentHash, `${path}.contentHash`),
        evidenceLevel: requiredIdV1(entry.evidenceLevel, `${path}.evidenceLevel`),
        freshness: requiredIdV1(entry.freshness, `${path}.freshness`),
        maxBytes: requiredSafeIntegerV1(entry.maxBytes, `${path}.maxBytes`, 1, 1_000_000),
      };
    })
    .sort((left, right) => compareCodeUnitV1(left.contextId, right.contextId));
  if (new Set(entries.map(contextEntryKey)).size !== entries.length || entries.length > 128) {
    throw new AuthorityPromptCompositionErrorV1(
      "context_entry_identity_conflict",
      "Context entries must be unique and within budget."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.runContextManifest,
    runId: requiredIdV1(input.runId, "runContext.runId"),
    turnId: requiredIdV1(input.turnId, "runContext.turnId"),
    uxCapabilityFingerprint: requiredHashV1(
      input.uxCapabilityFingerprint,
      "runContext.uxCapabilityFingerprint"
    ),
    revisionBinding:
      input.revisionBinding === null
        ? null
        : requiredHashV1(input.revisionBinding, "runContext.revisionBinding"),
    entries,
  } as const;
  return { ...material, manifestHash: hashCanonicalJsonV1(material) };
};

export const decodeRunContextManifestV1 = (
  value: unknown
): RunContextManifestV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "turnId",
      "uxCapabilityFingerprint",
      "revisionBinding",
      "entries",
      "manifestHash",
    ],
    [],
    "runContext"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.runContextManifest ||
    !Array.isArray(record.entries)
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "context_manifest_contract_mismatch",
      "Run Context Manifest contract differs."
    );
  }
  const decoded = createRunContextManifestV1({
    runId: record.runId as string,
    turnId: record.turnId as string,
    uxCapabilityFingerprint: record.uxCapabilityFingerprint as string,
    revisionBinding: record.revisionBinding as string | null,
    entries: record.entries as RunContextManifestV1["entries"],
  });
  assertCanonicalArrayV1(
    record.entries as RunContextManifestV1["entries"],
    contextEntryKey,
    "runContext.entries"
  );
  if (record.manifestHash !== decoded.manifestHash) {
    throw new AuthorityPromptCompositionErrorV1(
      "context_manifest_hash_drift",
      "Run Context Manifest hash differs."
    );
  }
  return decoded;
};

export type PromptFragmentMaterialV1 = Readonly<{
  fragmentId: string;
  sourceKind: FragmentSource;
  sourceText: string;
  placement: number;
  maxBytes: number;
  maxTokens: number;
}>;

export const renderPromptFragmentMaterialV1 = (
  input: PromptFragmentMaterialV1
): Readonly<{
  binding: PromptFragmentBindingV1;
  renderedText: string;
}> => {
  const sourceKind = requiredEnumV1(
    input.sourceKind,
    Object.keys(SOURCE_ORDER) as FragmentSource[],
    "promptFragment.sourceKind"
  );
  const trustClass = TRUST_BY_SOURCE[sourceKind];
  const registeredWrapper = PROMPT_WRAPPER_REGISTRY_V1[sourceKind];
  const maxBytes = requiredSafeIntegerV1(input.maxBytes, "promptFragment.maxBytes", 1, 1_000_000);
  const maxTokens = requiredSafeIntegerV1(input.maxTokens, "promptFragment.maxTokens", 1, 250_000);
  const sourceText = requiredStringV1(
    input.sourceText,
    "promptFragment.sourceText",
    1_000_000
  );
  const sourceHash = hashUtf8V1(sourceText);
  const renderedText = [
    "<<<FORMAL_R3_PROMPT_FRAGMENT_V1>>>",
    JSON.stringify({
      authority:
        registeredWrapper.wrapperSemantics ===
        "untrusted_content_delimited_no_authority_v1"
          ? "none"
          : "trusted_contract",
      content: sourceText,
      sourceHash,
      sourceKind,
      trustClass,
      wrapperPolicyId: registeredWrapper.wrapperPolicyId,
    }),
    "<<<END_FORMAL_R3_PROMPT_FRAGMENT_V1>>>",
  ].join("\n");
  const renderedBytes = new TextEncoder().encode(renderedText).byteLength;
  if (renderedBytes > maxBytes || Math.ceil(renderedBytes / 3) > maxTokens) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_fragment_byte_budget_exceeded",
      "Server-rendered prompt fragment exceeds its byte or conservative token budget."
    );
  }
  const truncationDecisionHash = hashCanonicalJsonV1({
    strategy: "no_truncation_reject_over_budget_v1",
    sourceHash,
    renderedBytes,
    maxBytes,
    maxTokens,
  });
  const binding = {
    fragmentId: requiredIdV1(input.fragmentId, "promptFragment.fragmentId"),
    sourceKind,
    sourceHash,
    trustClass,
    wrapperPolicyId: registeredWrapper.wrapperPolicyId,
    wrapperImplementationHash: registeredWrapper.wrapperImplementationHash,
    renderedFragmentHash: hashUtf8V1(renderedText),
    placement: requiredSafeIntegerV1(input.placement, "promptFragment.placement", 0, 10_000),
    maxBytes,
    maxTokens,
    truncationDecisionHash,
  } as const;
  return { binding, renderedText };
};

export const createPromptFragmentBindingV1 = (
  input: PromptFragmentMaterialV1
): PromptFragmentBindingV1 => renderPromptFragmentMaterialV1(input).binding;

const EFFECTS = [
  "private_read",
  "presentation_state",
  "durable_write",
  "external_write",
] as const;

export const createExecutionAdmissionV1 = (input: Readonly<{
  actorCallId: string;
  principalHash: string;
  resolutionPlan: SkillResolutionPlanV1;
  toolCatalog: CompiledToolCatalogV1;
  skillCatalog: SkillCatalogV1;
  activationReceipts: readonly SkillActivationReceiptV1[];
  terminalTransitionReceipts: readonly SkillActivationTransitionReceiptV1[];
  admittedEffects: readonly AuthorityToolEffectV1[];
  issuedAt: string;
  expiresAt: string;
}>): ExecutionAdmissionV1 => {
  const plan = decodeSkillResolutionPlanV1(input.resolutionPlan);
  const toolCatalog = decodeCompiledToolCatalogV1(input.toolCatalog);
  const skillCatalog = decodeSkillCatalogV1(input.skillCatalog);
  const activationReceipts = input.activationReceipts
    .map(decodeSkillActivationReceiptV1)
    .sort((left, right) => compareCodeUnitV1(left.receiptHash, right.receiptHash));
  const terminalTransitionReceipts = input.terminalTransitionReceipts
    .map(decodeSkillActivationTransitionReceiptV1)
    .sort((left, right) => compareCodeUnitV1(left.receiptHash, right.receiptHash));
  if (
    new Set(
      terminalTransitionReceipts.map((receipt) => receipt.skillActivationId)
    ).size !== terminalTransitionReceipts.length
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_terminal_transition_duplicate",
      "Execution Admission contextual facts require at most one terminal transition per Activation."
    );
  }
  if (
    new Set(activationReceipts.map((receipt) => receipt.skillActivationId)).size !==
    activationReceipts.length
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_activation_duplicate",
      "Execution Admission requires unique Skill Activations."
    );
  }
  const principalHash = requiredHashV1(
    input.principalHash,
    "executionAdmission.principalHash"
  );
  if (
    plan.toolCatalogHash !== toolCatalog.catalogHash ||
    plan.skillCatalogHash !== skillCatalog.catalogHash ||
    activationReceipts.some(
      (receipt) =>
        receipt.runId !== plan.runId ||
        receipt.resolutionPlanHash !== plan.planHash ||
        receipt.principalHash !== principalHash ||
        receipt.toolCatalogHash !== toolCatalog.catalogHash ||
        receipt.skillCatalogHash !== skillCatalog.catalogHash ||
        receipt.uxCapabilitySnapshotHash !== plan.uxCapabilitySnapshotHash ||
        receipt.aclSnapshotHash !== plan.aclSnapshotHash ||
        receipt.conflictRegistrySnapshotHash !==
          plan.conflictRegistrySnapshotHash ||
        receipt.status !== "active" ||
        !plan.orderedClosures.some(
          (closure) => closure.closureHash === receipt.resolvedClosureHash
        )
    )
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_binding_mismatch",
      "Execution Admission differs from its Plan, catalogs, principal, or active receipts."
    );
  }
  const activeSkillClosureHashes = decodeCanonicalStringSetV1(
    activationReceipts.map((receipt) => receipt.resolvedClosureHash),
    "executionAdmission.activeSkillClosureHashes",
    { allowEmpty: true, kind: "hash" }
  );
  const activeSkillActivationReceiptHashes = decodeCanonicalStringSetV1(
    activationReceipts.map((receipt) => receipt.receiptHash),
    "executionAdmission.activeSkillActivationReceiptHashes",
    { allowEmpty: true, kind: "hash" }
  );
  if (
    activeSkillClosureHashes.length !==
    activeSkillActivationReceiptHashes.length
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_activation_binding_count_mismatch",
      "Execution Admission requires one Activation Receipt per active closure."
    );
  }
  const activationById = new Map(
    activationReceipts.map((receipt) => [receipt.skillActivationId, receipt])
  );
  for (const receipt of activationReceipts) {
    const terminalTransition = terminalTransitionReceipts.find(
      (transition) =>
        transition.skillActivationId === receipt.skillActivationId
    );
    if (
      terminalTransition &&
      (terminalTransition.runId !== receipt.runId ||
        terminalTransition.previousReceiptHash !== receipt.receiptHash)
    ) {
      throw new AuthorityPromptCompositionErrorV1(
        "execution_admission_terminal_transition_binding_mismatch",
        "Terminal transition differs from the exact active Activation Receipt."
      );
    }
    if (terminalTransition) {
      throw new AuthorityPromptCompositionErrorV1(
        "execution_admission_activation_terminal",
        "A terminal Activation cannot enter a new Execution Admission."
      );
    }
    if (
      receipt.source !== "dependency" &&
      (receipt.parentSkillActivationId !== null ||
        receipt.parentActivationReceiptHash !== null)
    ) {
      throw new AuthorityPromptCompositionErrorV1(
        "execution_admission_root_parent_forbidden",
        "A root Activation cannot carry dependency-parent material."
      );
    }
    if (receipt.source !== "dependency") continue;
    const parent = receipt.parentSkillActivationId
      ? activationById.get(receipt.parentSkillActivationId)
      : undefined;
    const parentClosure = parent
      ? plan.orderedClosures.find(
          (closure) => closure.closureHash === parent.resolvedClosureHash
        )
      : undefined;
    if (
      !parent ||
      parent.receiptHash !== receipt.parentActivationReceiptHash ||
      Date.parse(parent.issuedAt) > Date.parse(receipt.issuedAt) ||
      Date.parse(parent.expiresAt) < Date.parse(receipt.expiresAt) ||
      !parentClosure?.dependencies.some(
        (dependency) =>
          dependency.dependencyClosureHash === receipt.resolvedClosureHash
      )
    ) {
      throw new AuthorityPromptCompositionErrorV1(
        "execution_admission_dependency_parent_mismatch",
        "Dependency Activation requires its exact active parent and dependency edge in the same Admission closure."
      );
    }
  }
  const admittedEffects = decodeCanonicalStringSetV1(
    input.admittedEffects,
    "executionAdmission.admittedEffects",
    { allowEmpty: true }
  ).map((effect) =>
    requiredEnumV1(
      effect,
      EFFECTS,
      "executionAdmission.admittedEffects[]"
    )
  );
  const activeEffects = new Set(
    plan.orderedClosures
      .filter((closure) => activeSkillClosureHashes.includes(closure.closureHash))
      .flatMap((closure) => closure.tools.map((tool) => tool.requiredEffect))
  );
  if (admittedEffects.some((effect) => !activeEffects.has(effect))) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_effect_outside_closure",
      "Execution Admission cannot admit an effect outside active Skill closures."
    );
  }
  const issuedAt = requiredTimestampV1(
    input.issuedAt,
    "executionAdmission.issuedAt"
  );
  const expiresAt = requiredTimestampV1(
    input.expiresAt,
    "executionAdmission.expiresAt"
  );
  if (
    Date.parse(expiresAt) <= Date.parse(issuedAt) ||
    activationReceipts.some(
      (receipt) =>
        Date.parse(receipt.issuedAt) > Date.parse(issuedAt) ||
        Date.parse(receipt.expiresAt) < Date.parse(expiresAt)
    )
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_temporal_mismatch",
      "Execution Admission must be inside every active Skill Receipt lifetime."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.executionAdmission,
    runId: plan.runId,
    actorCallId: requiredIdV1(
      input.actorCallId,
      "executionAdmission.actorCallId"
    ),
    principalHash,
    resolutionPlanHash: plan.planHash,
    toolCatalogHash: toolCatalog.catalogHash,
    skillCatalogHash: skillCatalog.catalogHash,
    uxCapabilitySnapshotHash: plan.uxCapabilitySnapshotHash,
    aclSnapshotHash: plan.aclSnapshotHash,
    conflictRegistrySnapshotHash: plan.conflictRegistrySnapshotHash,
    activeSkillClosureHashes,
    activeSkillActivationReceiptHashes,
    admittedEffects,
    issuedAt,
    expiresAt,
  } as const;
  if (
    material.activeSkillClosureHashes.length !==
    material.activeSkillActivationReceiptHashes.length
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_activation_binding_count_mismatch",
      "Persisted Execution Admission requires one receipt per active closure."
    );
  }
  return { ...material, admissionHash: hashCanonicalJsonV1(material) };
};

export const decodeExecutionAdmissionV1 = (
  value: unknown
): ExecutionAdmissionV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "actorCallId",
      "principalHash",
      "resolutionPlanHash",
      "toolCatalogHash",
      "skillCatalogHash",
      "uxCapabilitySnapshotHash",
      "aclSnapshotHash",
      "conflictRegistrySnapshotHash",
      "activeSkillClosureHashes",
      "activeSkillActivationReceiptHashes",
      "admittedEffects",
      "issuedAt",
      "expiresAt",
      "admissionHash",
    ],
    [],
    "executionAdmission"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.executionAdmission ||
    !Array.isArray(record.activeSkillClosureHashes) ||
    !Array.isArray(record.activeSkillActivationReceiptHashes) ||
    !Array.isArray(record.admittedEffects)
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_contract_mismatch",
      "Execution Admission contract differs."
    );
  }
  const admittedEffects = decodeCanonicalStringSetV1(
    record.admittedEffects,
    "executionAdmission.admittedEffects",
    { allowEmpty: true, requireCanonical: true }
  ).map((effect) =>
    requiredEnumV1(
      effect,
      EFFECTS,
      "executionAdmission.admittedEffects[]"
    )
  );
  const issuedAt = requiredTimestampV1(
    record.issuedAt,
    "executionAdmission.issuedAt"
  );
  const expiresAt = requiredTimestampV1(
    record.expiresAt,
    "executionAdmission.expiresAt"
  );
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_expiry_invalid",
      "Execution Admission expiry must be after issuance."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.executionAdmission,
    runId: requiredIdV1(record.runId, "executionAdmission.runId"),
    actorCallId: requiredIdV1(
      record.actorCallId,
      "executionAdmission.actorCallId"
    ),
    principalHash: requiredHashV1(
      record.principalHash,
      "executionAdmission.principalHash"
    ),
    resolutionPlanHash: requiredHashV1(
      record.resolutionPlanHash,
      "executionAdmission.resolutionPlanHash"
    ),
    toolCatalogHash: requiredHashV1(
      record.toolCatalogHash,
      "executionAdmission.toolCatalogHash"
    ),
    skillCatalogHash: requiredHashV1(
      record.skillCatalogHash,
      "executionAdmission.skillCatalogHash"
    ),
    uxCapabilitySnapshotHash: requiredHashV1(
      record.uxCapabilitySnapshotHash,
      "executionAdmission.uxCapabilitySnapshotHash"
    ),
    aclSnapshotHash: requiredHashV1(
      record.aclSnapshotHash,
      "executionAdmission.aclSnapshotHash"
    ),
    conflictRegistrySnapshotHash: requiredHashV1(
      record.conflictRegistrySnapshotHash,
      "executionAdmission.conflictRegistrySnapshotHash"
    ),
    activeSkillClosureHashes: decodeCanonicalStringSetV1(
      record.activeSkillClosureHashes,
      "executionAdmission.activeSkillClosureHashes",
      { allowEmpty: true, kind: "hash", requireCanonical: true }
    ),
    activeSkillActivationReceiptHashes: decodeCanonicalStringSetV1(
      record.activeSkillActivationReceiptHashes,
      "executionAdmission.activeSkillActivationReceiptHashes",
      { allowEmpty: true, kind: "hash", requireCanonical: true }
    ),
    admittedEffects,
    issuedAt,
    expiresAt,
  } as const;
  const admissionHash = requiredHashV1(
    record.admissionHash,
    "executionAdmission.admissionHash"
  );
  if (
    material.activeSkillClosureHashes.length !==
    material.activeSkillActivationReceiptHashes.length
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_activation_binding_count_mismatch",
      "Persisted Execution Admission requires one receipt per active closure."
    );
  }
  if (admissionHash !== hashCanonicalJsonV1(material)) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_hash_drift",
      "Execution Admission hash differs."
    );
  }
  return { ...material, admissionHash };
};

export const verifyExecutionAdmissionClosureV1 = (input: Readonly<{
  admission: ExecutionAdmissionV1;
  principalHash: string;
  resolutionPlan: SkillResolutionPlanV1;
  toolCatalog: CompiledToolCatalogV1;
  skillCatalog: SkillCatalogV1;
  activationReceipts: readonly SkillActivationReceiptV1[];
  terminalTransitionReceipts: readonly SkillActivationTransitionReceiptV1[];
}>): ExecutionAdmissionV1 => {
  const admission = decodeExecutionAdmissionV1(input.admission);
  const recomputed = createExecutionAdmissionV1({
    actorCallId: admission.actorCallId,
    principalHash: input.principalHash,
    resolutionPlan: input.resolutionPlan,
    toolCatalog: input.toolCatalog,
    skillCatalog: input.skillCatalog,
    activationReceipts: input.activationReceipts,
    terminalTransitionReceipts: input.terminalTransitionReceipts,
    admittedEffects: admission.admittedEffects,
    issuedAt: admission.issuedAt,
    expiresAt: admission.expiresAt,
  });
  if (recomputed.admissionHash !== admission.admissionHash) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_admission_contextual_closure_drift",
      "Persisted Execution Admission differs from its actual Plan, catalogs, principal, effects, lifetime, or parent-complete Activation set."
    );
  }
  return admission;
};

export const createPromptCompositionManifestV1 = (input: Readonly<{
  composedAt: string;
  contextManifest: RunContextManifestV1;
  principalHash: string;
  resolutionPlan: SkillResolutionPlanV1;
  executionAdmission: ExecutionAdmissionV1;
  toolCatalog: CompiledToolCatalogV1;
  skillCatalog: SkillCatalogV1;
  activationReceipts: readonly SkillActivationReceiptV1[];
  terminalTransitionReceipts: readonly SkillActivationTransitionReceiptV1[];
  evidenceContexts: readonly Readonly<{
    evidenceSet: SkillEvidenceSetV1;
    activationReceipt: SkillActivationReceiptV1;
    context: SkillEvidenceContextV1;
  }>[];
  evidenceAuthority: SkillEvidenceAuthorityV1 | null;
  fragments: readonly PromptFragmentMaterialV1[];
}>): PromptCompositionManifestV1 => {
  const contextManifest = decodeRunContextManifestV1(input.contextManifest);
  const resolutionPlan = decodeSkillResolutionPlanV1(input.resolutionPlan);
  const toolCatalog = decodeCompiledToolCatalogV1(input.toolCatalog);
  const skillCatalog = decodeSkillCatalogV1(input.skillCatalog);
  const activationReceipts = input.activationReceipts
    .map(decodeSkillActivationReceiptV1)
    .sort((left, right) => compareCodeUnitV1(left.receiptHash, right.receiptHash));
  const executionAdmission = verifyExecutionAdmissionClosureV1({
    admission: input.executionAdmission,
    principalHash: input.principalHash,
    resolutionPlan,
    toolCatalog,
    skillCatalog,
    activationReceipts,
    terminalTransitionReceipts: input.terminalTransitionReceipts,
  });
  if (input.evidenceContexts.length > 0 && input.evidenceAuthority === null) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_evidence_authority_missing",
      "Prompt Evidence requires the server-owned Evidence authority port."
    );
  }
  const evidenceSets = input.evidenceContexts
    .map((entry) =>
      verifySkillEvidenceClosureV1({
        ...entry,
        authority: input.evidenceAuthority!,
      })
    )
    .sort((left, right) => compareCodeUnitV1(left.evidenceSetHash, right.evidenceSetHash));
  const composedAt = requiredTimestampV1(input.composedAt, "promptManifest.composedAt");
  const activeSkillClosureHashes = decodeCanonicalStringSetV1(
    activationReceipts.map((receipt) => receipt.resolvedClosureHash),
    "promptManifest.activeSkillClosureHashes",
    { allowEmpty: true, kind: "hash" }
  );
  const activeSkillActivationReceiptHashes = decodeCanonicalStringSetV1(
    activationReceipts.map((receipt) => receipt.receiptHash),
    "promptManifest.activeSkillActivationReceiptHashes",
    { allowEmpty: true, kind: "hash" }
  );
  if (
    contextManifest.runId !== resolutionPlan.runId ||
    executionAdmission.runId !== resolutionPlan.runId ||
    executionAdmission.resolutionPlanHash !== resolutionPlan.planHash ||
    executionAdmission.toolCatalogHash !== toolCatalog.catalogHash ||
    executionAdmission.skillCatalogHash !== skillCatalog.catalogHash ||
    resolutionPlan.toolCatalogHash !== toolCatalog.catalogHash ||
    resolutionPlan.skillCatalogHash !== skillCatalog.catalogHash ||
    executionAdmission.uxCapabilitySnapshotHash !==
      resolutionPlan.uxCapabilitySnapshotHash ||
    executionAdmission.aclSnapshotHash !== resolutionPlan.aclSnapshotHash ||
    executionAdmission.conflictRegistrySnapshotHash !==
      resolutionPlan.conflictRegistrySnapshotHash ||
    hashCanonicalJsonV1(activeSkillClosureHashes) !==
      hashCanonicalJsonV1(executionAdmission.activeSkillClosureHashes) ||
    hashCanonicalJsonV1(activeSkillActivationReceiptHashes) !==
      hashCanonicalJsonV1(
        executionAdmission.activeSkillActivationReceiptHashes
      ) ||
    Date.parse(composedAt) < Date.parse(executionAdmission.issuedAt) ||
    Date.parse(composedAt) >= Date.parse(executionAdmission.expiresAt) ||
    activationReceipts.some(
      (receipt) =>
        receipt.runId !== resolutionPlan.runId ||
        receipt.resolutionPlanHash !== resolutionPlan.planHash ||
        receipt.toolCatalogHash !== toolCatalog.catalogHash ||
        receipt.skillCatalogHash !== skillCatalog.catalogHash ||
        receipt.conflictRegistrySnapshotHash !==
          resolutionPlan.conflictRegistrySnapshotHash ||
        Date.parse(composedAt) >= Date.parse(receipt.expiresAt)
    ) ||
    evidenceSets.some(
      (evidence) =>
        evidence.runId !== resolutionPlan.runId ||
        !activeSkillClosureHashes.includes(evidence.resolvedClosureHash) ||
        !activeSkillActivationReceiptHashes.includes(
          evidence.activationReceiptHash
        )
    )
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_binding_mismatch",
      "Prompt Manifest differs from its Context, Plan, Admission, catalogs, Activation, or Evidence closure."
    );
  }
  const materials = [...input.fragments].sort((left, right) => left.placement - right.placement);
  if (materials.length === 0 || materials.length > 128) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_fragment_count_invalid",
      "Prompt composition requires a bounded fragment list."
    );
  }
  for (let index = 0; index < materials.length; index += 1) {
    const current = materials[index]!;
    if (current.placement !== index) {
      throw new AuthorityPromptCompositionErrorV1(
        "prompt_fragment_placement_gap",
        "Prompt fragment placement must be unique and contiguous from zero."
      );
    }
    if (
      index > 0 &&
      SOURCE_ORDER[materials[index - 1]!.sourceKind] > SOURCE_ORDER[current.sourceKind]
    ) {
      throw new AuthorityPromptCompositionErrorV1(
        "prompt_fragment_source_order_invalid",
        "Prompt fragments violate the frozen source-group order."
      );
    }
  }
  if (materials[0]!.sourceKind !== "base" || materials.filter((item) => item.sourceKind === "base").length !== 1) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_base_fragment_invalid",
      "Prompt composition requires exactly one leading base fragment."
    );
  }
  const renderedMaterials = materials.map(renderPromptFragmentMaterialV1);
  const orderedFragments = renderedMaterials.map((entry) => entry.binding);
  if (new Set(orderedFragments.map((item) => item.fragmentId)).size !== orderedFragments.length) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_fragment_identity_conflict",
      "Prompt fragment identities must be unique."
    );
  }
  const policyFragmentHashes = orderedFragments
    .filter((fragment) => fragment.sourceKind === "policy")
    .map((fragment) => fragment.sourceHash);
  if (policyFragmentHashes.length === 0) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_policy_fragment_missing",
      "Prompt composition requires at least one frozen policy fragment."
    );
  }
  const activeClosures = resolutionPlan.orderedClosures.filter((closure) =>
    activeSkillClosureHashes.includes(closure.closureHash)
  );
  const activeToolIdentities = [
    ...new Set(
      activeClosures.flatMap((closure) =>
        closure.tools
          .filter((tool) =>
            executionAdmission.admittedEffects.includes(tool.requiredEffect)
          )
          .map((tool) => `${tool.toolId}\u0000${tool.toolVersion}`)
      )
    ),
  ].sort(compareCodeUnitV1);
  const expectedToolSheetHashes = activeToolIdentities.map((identity) => {
    const [toolId, toolVersion] = identity.split("\u0000");
    const matches = toolCatalog.tools.filter(
      (tool) =>
        tool.definition.toolId === toolId &&
        tool.definition.toolVersion === toolVersion
    );
    if (matches.length !== 1) {
      throw new AuthorityPromptCompositionErrorV1(
        "prompt_tool_sheet_unresolved",
        "Prompt Tool sheet does not resolve exactly once in the compiled catalog."
      );
    }
    return hashCanonicalJsonV1(matches[0]!.promptCapability);
  });
  const expectedSkillHashes: string[] = [];
  const seenSkillHashes = new Set<string>();
  for (const closure of activeClosures) {
    for (const resourceHash of closure.promptResourceHashes) {
      if (!seenSkillHashes.has(resourceHash)) {
        seenSkillHashes.add(resourceHash);
        expectedSkillHashes.push(resourceHash);
      }
    }
  }
  const expectedBySource: Readonly<Record<
    "tool_sheet" | "skill" | "context" | "evidence" | "unavailable",
    readonly string[]
  >> = {
    tool_sheet: expectedToolSheetHashes,
    skill: expectedSkillHashes,
    context: contextManifest.entries.map((entry) => entry.contentHash),
    evidence: evidenceSets.map((entry) => entry.evidenceSetHash),
    unavailable: resolutionPlan.unavailable.map((entry) => entry.factHash),
  };
  for (const sourceKind of Object.keys(expectedBySource) as Array<
    keyof typeof expectedBySource
  >) {
    const actual = orderedFragments
      .filter((fragment) => fragment.sourceKind === sourceKind)
      .map((fragment) => fragment.sourceHash);
    if (
      hashCanonicalJsonV1(actual) !==
      hashCanonicalJsonV1(expectedBySource[sourceKind])
    ) {
      throw new AuthorityPromptCompositionErrorV1(
        "prompt_fragment_source_binding_mismatch",
        `Prompt ${sourceKind} fragments differ from the exact frozen source closure.`
      );
    }
  }
  const truncationDecisionHash = hashCanonicalJsonV1(
    orderedFragments.map((fragment) => ({
      fragmentId: fragment.fragmentId,
      placement: fragment.placement,
      truncationDecisionHash: fragment.truncationDecisionHash,
    }))
  );
  const composedPromptHash = hashUtf8V1(
    renderedMaterials.map((item) => item.renderedText).join("\n\n")
  );
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.promptCompositionManifest,
    runId: resolutionPlan.runId,
    actorCallId: executionAdmission.actorCallId,
    composedAt,
    basePromptHash: orderedFragments[0]!.sourceHash,
    policyFragmentHashes,
    contextManifestHash: requiredHashV1(
      contextManifest.manifestHash,
      "promptManifest.contextManifestHash"
    ),
    resolutionPlanHash: requiredHashV1(
      resolutionPlan.planHash,
      "promptManifest.resolutionPlanHash"
    ),
    executionAdmissionHash: requiredHashV1(
      executionAdmission.admissionHash,
      "promptManifest.executionAdmissionHash"
    ),
    toolCatalogHash: toolCatalog.catalogHash,
    skillCatalogHash: skillCatalog.catalogHash,
    activeSkillClosureHashes,
    activeSkillActivationReceiptHashes,
    orderedFragments,
    unavailableFactHashes: resolutionPlan.unavailable.map(
      (entry) => entry.factHash
    ),
    truncationDecisionHash,
    composedPromptHash,
  } as const;
  return { ...material, manifestHash: hashCanonicalJsonV1(material) };
};

const decodePromptFragmentBindingV1 = (
  value: unknown,
  path: string
): PromptFragmentBindingV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "fragmentId",
      "sourceKind",
      "sourceHash",
      "trustClass",
      "wrapperPolicyId",
      "wrapperImplementationHash",
      "renderedFragmentHash",
      "placement",
      "maxBytes",
      "maxTokens",
      "truncationDecisionHash",
    ],
    [],
    path
  );
  const sourceKind = requiredEnumV1(
    record.sourceKind,
    Object.keys(SOURCE_ORDER) as FragmentSource[],
    `${path}.sourceKind`
  );
  const trustClass = requiredEnumV1(
    record.trustClass,
    [
      "trusted_system",
      "trusted_contract",
      "untrusted_instructional_content",
      "untrusted_fact",
    ] as const,
    `${path}.trustClass`
  );
  if (TRUST_BY_SOURCE[sourceKind] !== trustClass) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_fragment_trust_mismatch",
      "Persisted prompt fragment trust class differs from its source."
    );
  }
  const registeredWrapper = PROMPT_WRAPPER_REGISTRY_V1[sourceKind];
  if (
    record.wrapperPolicyId !== registeredWrapper.wrapperPolicyId ||
    record.wrapperImplementationHash !==
      registeredWrapper.wrapperImplementationHash
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_fragment_wrapper_drift",
      "Persisted prompt fragment wrapper is outside the server-owned wrapper registry."
    );
  }
  return {
    fragmentId: requiredIdV1(record.fragmentId, `${path}.fragmentId`),
    sourceKind,
    sourceHash: requiredHashV1(record.sourceHash, `${path}.sourceHash`),
    trustClass,
    wrapperPolicyId: requiredIdV1(
      record.wrapperPolicyId,
      `${path}.wrapperPolicyId`
    ),
    wrapperImplementationHash: requiredHashV1(
      record.wrapperImplementationHash,
      `${path}.wrapperImplementationHash`
    ),
    renderedFragmentHash: requiredHashV1(
      record.renderedFragmentHash,
      `${path}.renderedFragmentHash`
    ),
    placement: requiredSafeIntegerV1(record.placement, `${path}.placement`, 0, 10_000),
    maxBytes: requiredSafeIntegerV1(record.maxBytes, `${path}.maxBytes`, 1, 1_000_000),
    maxTokens: requiredSafeIntegerV1(record.maxTokens, `${path}.maxTokens`, 1, 250_000),
    truncationDecisionHash: requiredHashV1(
      record.truncationDecisionHash,
      `${path}.truncationDecisionHash`
    ),
  };
};

export const decodePromptCompositionManifestV1 = (
  value: unknown
): PromptCompositionManifestV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "actorCallId",
      "composedAt",
      "basePromptHash",
      "policyFragmentHashes",
      "contextManifestHash",
      "resolutionPlanHash",
      "executionAdmissionHash",
      "toolCatalogHash",
      "skillCatalogHash",
      "activeSkillClosureHashes",
      "activeSkillActivationReceiptHashes",
      "orderedFragments",
      "unavailableFactHashes",
      "truncationDecisionHash",
      "composedPromptHash",
      "manifestHash",
    ],
    [],
    "promptManifest"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.promptCompositionManifest ||
    !Array.isArray(record.policyFragmentHashes) ||
    !Array.isArray(record.activeSkillClosureHashes) ||
    !Array.isArray(record.activeSkillActivationReceiptHashes) ||
    !Array.isArray(record.orderedFragments) ||
    !Array.isArray(record.unavailableFactHashes)
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_contract_mismatch",
      "Prompt Composition Manifest contract differs."
    );
  }
  const orderedFragments = record.orderedFragments.map((entry, index) =>
    decodePromptFragmentBindingV1(entry, `promptManifest.orderedFragments[${index}]`)
  );
  if (orderedFragments.length === 0 || orderedFragments.length > 128) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_fragment_count_invalid",
      "Persisted Prompt Composition Manifest fragment count is invalid."
    );
  }
  for (let index = 0; index < orderedFragments.length; index += 1) {
    const fragment = orderedFragments[index]!;
    if (
      fragment.placement !== index ||
      (index > 0 &&
        SOURCE_ORDER[orderedFragments[index - 1]!.sourceKind] >
          SOURCE_ORDER[fragment.sourceKind])
    ) {
      throw new AuthorityPromptCompositionErrorV1(
        "prompt_manifest_fragment_order_drift",
        "Persisted prompt fragments are not contiguous and source ordered."
      );
    }
  }
  if (
    orderedFragments[0]!.sourceKind !== "base" ||
    orderedFragments.filter((entry) => entry.sourceKind === "base").length !== 1 ||
    new Set(orderedFragments.map((entry) => entry.fragmentId)).size !==
      orderedFragments.length
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_base_or_identity_invalid",
      "Prompt Composition Manifest requires one base and unique fragments."
    );
  }
  const policyFragmentHashes = record.policyFragmentHashes.map((entry, index) =>
    requiredHashV1(entry, `promptManifest.policyFragmentHashes[${index}]`)
  );
  const expectedPolicyFragmentHashes = orderedFragments
    .filter((entry) => entry.sourceKind === "policy")
    .map((entry) => entry.sourceHash);
  if (
    hashCanonicalJsonV1(policyFragmentHashes) !==
    hashCanonicalJsonV1(expectedPolicyFragmentHashes)
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_policy_fragment_drift",
      "Prompt policy fragment hashes differ from ordered fragments."
    );
  }
  const truncationDecisionHash = hashCanonicalJsonV1(
    orderedFragments.map((fragment) => ({
      fragmentId: fragment.fragmentId,
      placement: fragment.placement,
      truncationDecisionHash: fragment.truncationDecisionHash,
    }))
  );
  if (record.truncationDecisionHash !== truncationDecisionHash) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_truncation_drift",
      "Prompt truncation decision aggregate differs."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.promptCompositionManifest,
    runId: requiredIdV1(record.runId, "promptManifest.runId"),
    actorCallId: requiredIdV1(record.actorCallId, "promptManifest.actorCallId"),
    composedAt: requiredTimestampV1(
      record.composedAt,
      "promptManifest.composedAt"
    ),
    basePromptHash: requiredHashV1(record.basePromptHash, "promptManifest.basePromptHash"),
    policyFragmentHashes,
    contextManifestHash: requiredHashV1(record.contextManifestHash, "promptManifest.contextManifestHash"),
    resolutionPlanHash: requiredHashV1(record.resolutionPlanHash, "promptManifest.resolutionPlanHash"),
    executionAdmissionHash: requiredHashV1(record.executionAdmissionHash, "promptManifest.executionAdmissionHash"),
    toolCatalogHash: requiredHashV1(record.toolCatalogHash, "promptManifest.toolCatalogHash"),
    skillCatalogHash: requiredHashV1(record.skillCatalogHash, "promptManifest.skillCatalogHash"),
    activeSkillClosureHashes: decodeCanonicalStringSetV1(
      record.activeSkillClosureHashes,
      "promptManifest.activeSkillClosureHashes",
      { allowEmpty: true, kind: "hash", requireCanonical: true }
    ),
    activeSkillActivationReceiptHashes: decodeCanonicalStringSetV1(
      record.activeSkillActivationReceiptHashes,
      "promptManifest.activeSkillActivationReceiptHashes",
      { allowEmpty: true, kind: "hash", requireCanonical: true }
    ),
    orderedFragments,
    unavailableFactHashes: decodeCanonicalStringSetV1(
      record.unavailableFactHashes,
      "promptManifest.unavailableFactHashes",
      { allowEmpty: true, kind: "hash", requireCanonical: true }
    ),
    truncationDecisionHash,
    composedPromptHash: requiredHashV1(record.composedPromptHash, "promptManifest.composedPromptHash"),
  } as const;
  if (material.basePromptHash !== orderedFragments[0]!.sourceHash) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_base_hash_drift",
      "Base prompt hash differs from the leading base fragment."
    );
  }
  const manifestHash = requiredHashV1(record.manifestHash, "promptManifest.manifestHash");
  if (manifestHash !== hashCanonicalJsonV1(material)) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_hash_drift",
      "Prompt Composition Manifest hash differs."
    );
  }
  return { ...material, manifestHash };
};

export const verifyPromptCompositionManifestV1 = (
  manifest: PromptCompositionManifestV1,
  fragmentSources: readonly PromptFragmentMaterialV1[]
) => {
  const decoded = decodePromptCompositionManifestV1(manifest);
  if (fragmentSources.length !== decoded.orderedFragments.length) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_rendered_fragment_count_mismatch",
      "Prompt source fragment count differs from the manifest."
    );
  }
  const rendered = [...fragmentSources]
    .sort((left, right) => left.placement - right.placement)
    .map(renderPromptFragmentMaterialV1);
  if (
    rendered.some(
      (entry, index) =>
        hashCanonicalJsonV1(entry.binding) !==
        hashCanonicalJsonV1(decoded.orderedFragments[index]!)
    ) ||
    hashUtf8V1(rendered.map((entry) => entry.renderedText).join("\n\n")) !==
      decoded.composedPromptHash
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_drift",
      "Prompt composition cannot be recomputed from rendered fragments."
    );
  }
  return true;
};

export const verifyPromptCompositionClosureV1 = (input: Readonly<{
  manifest: PromptCompositionManifestV1;
  fragmentSources: readonly PromptFragmentMaterialV1[];
  contextManifest: RunContextManifestV1;
  principalHash: string;
  resolutionPlan: SkillResolutionPlanV1;
  executionAdmission: ExecutionAdmissionV1;
  toolCatalog: CompiledToolCatalogV1;
  skillCatalog: SkillCatalogV1;
  activationReceipts: readonly SkillActivationReceiptV1[];
  terminalTransitionReceipts: readonly SkillActivationTransitionReceiptV1[];
  evidenceContexts: readonly Readonly<{
    evidenceSet: SkillEvidenceSetV1;
    activationReceipt: SkillActivationReceiptV1;
    context: SkillEvidenceContextV1;
  }>[];
  evidenceAuthority: SkillEvidenceAuthorityV1 | null;
}>) => {
  const decoded = decodePromptCompositionManifestV1(input.manifest);
  verifyPromptCompositionManifestV1(decoded, input.fragmentSources);
  const recomputed = createPromptCompositionManifestV1({
    composedAt: decoded.composedAt,
    contextManifest: input.contextManifest,
    principalHash: input.principalHash,
    resolutionPlan: input.resolutionPlan,
    executionAdmission: input.executionAdmission,
    toolCatalog: input.toolCatalog,
    skillCatalog: input.skillCatalog,
    activationReceipts: input.activationReceipts,
    terminalTransitionReceipts: input.terminalTransitionReceipts,
    evidenceContexts: input.evidenceContexts,
    evidenceAuthority: input.evidenceAuthority,
    fragments: input.fragmentSources,
  });
  if (recomputed.manifestHash !== decoded.manifestHash) {
    throw new AuthorityPromptCompositionErrorV1(
      "prompt_manifest_contextual_closure_drift",
      "Prompt composition differs from its persisted Context, Plan, Admission, catalogs, Activation, or Evidence closure."
    );
  }
  return true;
};

const normalizeExecutionFingerprintMaterialV1 = (
  input: Omit<ExecutionFingerprintMaterialV1, "fingerprintHash">,
  options: Readonly<{ requireCanonical?: boolean }> = {}
): ExecutionFingerprintMaterialV1 => {
  const material = {
    runId: requiredIdV1(input.runId, "executionFingerprint.runId"),
    actorCallId: requiredIdV1(input.actorCallId, "executionFingerprint.actorCallId"),
    resolutionPlanHash: requiredHashV1(
      input.resolutionPlanHash,
      "executionFingerprint.resolutionPlanHash"
    ),
    contextManifestHash: requiredHashV1(
      input.contextManifestHash,
      "executionFingerprint.contextManifestHash"
    ),
    toolCatalogHash: requiredHashV1(
      input.toolCatalogHash,
      "executionFingerprint.toolCatalogHash"
    ),
    skillCatalogHash: requiredHashV1(
      input.skillCatalogHash,
      "executionFingerprint.skillCatalogHash"
    ),
    activeSkillClosureHashes: decodeCanonicalStringSetV1(
      input.activeSkillClosureHashes,
      "executionFingerprint.activeSkillClosureHashes",
      {
        allowEmpty: true,
        kind: "hash",
        requireCanonical: options.requireCanonical,
      }
    ),
    activeSkillActivationReceiptHashes: decodeCanonicalStringSetV1(
      input.activeSkillActivationReceiptHashes,
      "executionFingerprint.activeSkillActivationReceiptHashes",
      {
        allowEmpty: true,
        kind: "hash",
        requireCanonical: options.requireCanonical,
      }
    ),
    promptCompositionManifestHash: requiredHashV1(
      input.promptCompositionManifestHash,
      "executionFingerprint.promptCompositionManifestHash"
    ),
    modelIdentityHash: requiredHashV1(
      input.modelIdentityHash,
      "executionFingerprint.modelIdentityHash"
    ),
  } as const;
  return { ...material, fingerprintHash: hashCanonicalJsonV1(material) };
};

export const createExecutionFingerprintMaterialV1 = (
  input: Readonly<{
    contextManifest: RunContextManifestV1;
    principalHash: string;
    resolutionPlan: SkillResolutionPlanV1;
    toolCatalog: CompiledToolCatalogV1;
    skillCatalog: SkillCatalogV1;
    activationReceipts: readonly SkillActivationReceiptV1[];
    terminalTransitionReceipts: readonly SkillActivationTransitionReceiptV1[];
    executionAdmission: ExecutionAdmissionV1;
    evidenceContexts: readonly Readonly<{
      evidenceSet: SkillEvidenceSetV1;
      activationReceipt: SkillActivationReceiptV1;
      context: SkillEvidenceContextV1;
    }>[];
    evidenceAuthority: SkillEvidenceAuthorityV1 | null;
    promptCompositionManifest: PromptCompositionManifestV1;
    fragmentSources: readonly PromptFragmentMaterialV1[];
    modelIdentityHash: string;
  }>
): ExecutionFingerprintMaterialV1 => {
  const contextManifest = decodeRunContextManifestV1(input.contextManifest);
  const resolutionPlan = decodeSkillResolutionPlanV1(input.resolutionPlan);
  const toolCatalog = decodeCompiledToolCatalogV1(input.toolCatalog);
  const skillCatalog = decodeSkillCatalogV1(input.skillCatalog);
  const activationReceipts = input.activationReceipts
    .map(decodeSkillActivationReceiptV1)
    .sort((left, right) => compareCodeUnitV1(left.receiptHash, right.receiptHash));
  const promptCompositionManifest = decodePromptCompositionManifestV1(
    input.promptCompositionManifest
  );
  verifyPromptCompositionClosureV1({
    manifest: promptCompositionManifest,
    fragmentSources: input.fragmentSources,
    contextManifest,
    principalHash: input.principalHash,
    resolutionPlan,
    executionAdmission: input.executionAdmission,
    toolCatalog,
    skillCatalog,
    activationReceipts,
    terminalTransitionReceipts: input.terminalTransitionReceipts,
    evidenceContexts: input.evidenceContexts,
    evidenceAuthority: input.evidenceAuthority,
  });
  const activeSkillClosureHashes = decodeCanonicalStringSetV1(
    activationReceipts.map((receipt) => receipt.resolvedClosureHash),
    "executionFingerprint.activeSkillClosureHashes",
    { allowEmpty: true, kind: "hash" }
  );
  const activeSkillActivationReceiptHashes = decodeCanonicalStringSetV1(
    activationReceipts.map((receipt) => receipt.receiptHash),
    "executionFingerprint.activeSkillActivationReceiptHashes",
    { allowEmpty: true, kind: "hash" }
  );
  if (
    contextManifest.runId !== resolutionPlan.runId ||
    promptCompositionManifest.runId !== resolutionPlan.runId ||
    resolutionPlan.toolCatalogHash !== toolCatalog.catalogHash ||
    resolutionPlan.skillCatalogHash !== skillCatalog.catalogHash ||
    promptCompositionManifest.contextManifestHash !== contextManifest.manifestHash ||
    promptCompositionManifest.resolutionPlanHash !== resolutionPlan.planHash ||
    promptCompositionManifest.toolCatalogHash !== toolCatalog.catalogHash ||
    promptCompositionManifest.skillCatalogHash !== skillCatalog.catalogHash ||
    hashCanonicalJsonV1(promptCompositionManifest.activeSkillClosureHashes) !==
      hashCanonicalJsonV1(activeSkillClosureHashes) ||
    hashCanonicalJsonV1(
      promptCompositionManifest.activeSkillActivationReceiptHashes
    ) !== hashCanonicalJsonV1(activeSkillActivationReceiptHashes) ||
    activationReceipts.some(
      (receipt) =>
        receipt.runId !== resolutionPlan.runId ||
        receipt.resolutionPlanHash !== resolutionPlan.planHash ||
        receipt.toolCatalogHash !== toolCatalog.catalogHash ||
        receipt.skillCatalogHash !== skillCatalog.catalogHash ||
        !activeSkillClosureHashes.includes(receipt.resolvedClosureHash)
    )
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_fingerprint_contextual_closure_drift",
      "Execution Fingerprint inputs differ from the exact Context, Plan, catalogs, Activation, or Prompt closure."
    );
  }
  return normalizeExecutionFingerprintMaterialV1({
    runId: resolutionPlan.runId,
    actorCallId: promptCompositionManifest.actorCallId,
    resolutionPlanHash: resolutionPlan.planHash,
    contextManifestHash: contextManifest.manifestHash,
    toolCatalogHash: toolCatalog.catalogHash,
    skillCatalogHash: skillCatalog.catalogHash,
    activeSkillClosureHashes,
    activeSkillActivationReceiptHashes,
    promptCompositionManifestHash: promptCompositionManifest.manifestHash,
    modelIdentityHash: input.modelIdentityHash,
  });
};

export const decodeExecutionFingerprintMaterialV1 = (
  value: unknown
): ExecutionFingerprintMaterialV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "runId",
      "actorCallId",
      "resolutionPlanHash",
      "contextManifestHash",
      "toolCatalogHash",
      "skillCatalogHash",
      "activeSkillClosureHashes",
      "activeSkillActivationReceiptHashes",
      "promptCompositionManifestHash",
      "modelIdentityHash",
      "fingerprintHash",
    ],
    [],
    "executionFingerprint"
  );
  if (
    !Array.isArray(record.activeSkillClosureHashes) ||
    !Array.isArray(record.activeSkillActivationReceiptHashes)
  ) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_fingerprint_contract_mismatch",
      "Execution Fingerprint contract differs."
    );
  }
  const decoded = normalizeExecutionFingerprintMaterialV1({
    runId: record.runId as string,
    actorCallId: record.actorCallId as string,
    resolutionPlanHash: record.resolutionPlanHash as string,
    contextManifestHash: record.contextManifestHash as string,
    toolCatalogHash: record.toolCatalogHash as string,
    skillCatalogHash: record.skillCatalogHash as string,
    activeSkillClosureHashes: record.activeSkillClosureHashes as string[],
    activeSkillActivationReceiptHashes:
      record.activeSkillActivationReceiptHashes as string[],
    promptCompositionManifestHash: record.promptCompositionManifestHash as string,
    modelIdentityHash: record.modelIdentityHash as string,
  }, { requireCanonical: true });
  if (record.fingerprintHash !== decoded.fingerprintHash) {
    throw new AuthorityPromptCompositionErrorV1(
      "execution_fingerprint_hash_drift",
      "Execution Fingerprint hash differs."
    );
  }
  return decoded;
};

export const PROMPT_COMPOSITION_IMPLEMENTATION_HASH_V1 = hashCanonicalJsonV1({
  sourceOrder: SOURCE_ORDER,
  trustBySource: TRUST_BY_SOURCE,
  renderedJoin: "server_owned_json_delimited_utf8_double_newline_v1",
  placement: "contiguous-from-zero",
  manifest: FORMAL_R3_AUTHORITY_FABRIC_V1.promptCompositionManifest,
  executionAdmission: FORMAL_R3_AUTHORITY_FABRIC_V1.executionAdmission,
  resumeVerification:
    "actual_context_plan_admission_catalog_activation_evidence_rendered_bytes_v1",
  executionFingerprint:
    "actual_context_plan_catalog_activation_prompt_closure_v1",
  wrapperRegistry: PROMPT_WRAPPER_REGISTRY_V1,
  sourceClosure:
    "actual_source_bytes_hash_server_render_no_truncation_reject_over_budget_v1",
});
