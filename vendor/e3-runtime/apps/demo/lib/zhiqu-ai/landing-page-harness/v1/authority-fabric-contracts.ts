export const FORMAL_R3_AUTHORITY_FABRIC_V1 = Object.freeze({
  authorityToolDefinition: "authority-tool-definition-v1",
  policyRegistrySnapshot: "formal-r3-policy-registry-snapshot-v1",
  runContextManifest: "formal-r3-run-context-manifest-v1",
  skillDefinition: "formal-r3-skill-definition-v1",
  resolvedSkillClosure: "formal-r3-resolved-skill-closure-v1",
  skillResolutionRequest: "formal-r3-skill-resolution-request-v1",
  skillResolutionPlan: "formal-r3-skill-resolution-plan-v1",
  skillActivationRequest: "formal-r3-skill-activation-request-v1",
  skillActivationReceipt: "formal-r3-skill-activation-receipt-v1",
  skillToolInvocationRequest: "formal-r3-skill-tool-invocation-request-v1",
  skillEvidenceSet: "formal-r3-skill-evidence-set-v1",
  promptCompositionManifest: "formal-r3-prompt-composition-manifest-v1",
  executionAdmission: "formal-r3-execution-admission-v1",
  kernelSealedBridgeRequest: "formal-r3-kernel-sealed-bridge-request-v1",
  compiledTool: "formal-r3-compiled-authority-tool-v1",
  compiledCatalog: "formal-r3-compiled-tool-catalog-v1",
  skillCatalog: "formal-r3-skill-catalog-v1",
  opaquePublicLifecycleEvent: "formal-r3-opaque-public-lifecycle-event-v1",
  skillConflictRegistrySnapshot: "formal-r3-skill-conflict-registry-snapshot-v1",
  skillActivationTransitionReceipt: "formal-r3-skill-activation-transition-receipt-v1",
  authorityToolReceiptBinding: "formal-r3-authority-tool-receipt-binding-v1",
  capabilityUnavailable: "formal-r3-capability-unavailable-v1",
  schemaNormalizerVersion: "formal-r3-deterministic-json-schema-v1",
  conflictPolicy: "reject_conflicting_set",
} as const);

export type JsonPrimitiveV1 = string | number | boolean | null;

export type DeterministicJsonSchemaV1 = Readonly<{
  $ref?: string;
  $defs?: Readonly<Record<string, DeterministicJsonSchemaV1>>;
  oneOf?: readonly DeterministicJsonSchemaV1[];
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  const?: JsonPrimitiveV1;
  enum?: readonly JsonPrimitiveV1[];
  properties?: Readonly<Record<string, DeterministicJsonSchemaV1>>;
  required?: readonly string[];
  additionalProperties?: boolean;
  items?: DeterministicJsonSchemaV1;
  minItems?: number;
  maxItems?: number;
  uniqueItems?: boolean;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
}>;

export type ToolDataClassV1 =
  | "opaque_identity"
  | "authored_content"
  | "canvas_structure"
  | "canvas_geometry"
  | "private_provenance"
  | "authorization_material"
  | "external_content";

export type AuthorityToolEffectV1 =
  | "private_read"
  | "presentation_state"
  | "durable_write"
  | "external_write";

export type AuthorityToolDefinitionV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.authorityToolDefinition;
  toolId: string;
  toolVersion: string;
  family: string;
  description: string;
  inputSchema: DeterministicJsonSchemaV1;
  privateResultSchema: DeterministicJsonSchemaV1;
  modelObservationSchema: DeterministicJsonSchemaV1;
  publicEventSchema: DeterministicJsonSchemaV1;
  effect: AuthorityToolEffectV1;
  dataClasses: readonly ToolDataClassV1[];
  requiredCapabilities: readonly string[];
  authority: Readonly<{
    grantKind: "none" | "capture_grant" | "write_lease";
    revisionPolicy: "none" | "fresh" | "cas";
    targetPolicyId: string;
    aclPolicyId: string;
  }>;
  budgets: Readonly<{
    maxCallsPerRun: number;
    maxInputBytes: number;
    maxPrivateResultBytes: number;
    maxModelContextBytes: number;
    maxPublicEventBytes: number;
    maxWallTimeMs: number;
    maxVisitedNodes?: number;
  }>;
  executionPolicy: Readonly<{
    requiredExecutorBrand: string;
    idempotencyClass: string;
    retryClass: string;
    reconciliationClass: string;
  }>;
  evidencePolicy: Readonly<{
    receiptType: string;
    readbackPolicy: string;
    supportedClaimEffects: readonly string[];
  }>;
  projectionPolicy: Readonly<{
    argumentProjectionId: string;
    modelProjectionId: string;
    publicProjectionId: string;
    argumentProjectorImplementationHash: string;
    modelProjectorImplementationHash: string;
    publicProjectorImplementationHash: string;
    projectorBundleHash: string;
    publicContractVersion: string;
  }>;
  promptPolicy: Readonly<{
    usageRuleId: string;
    unavailableRuleId: string;
  }>;
}>;

export type PolicyKindV1 =
  | "target"
  | "acl"
  | "idempotency"
  | "retry"
  | "reconciliation"
  | "receipt"
  | "readback"
  | "claim"
  | "projection"
  | "prompt";

export type PolicyIdentityV1 = Readonly<{
  policyKind: PolicyKindV1;
  policyId: string;
  policyVersion: string;
  implementationHash: string;
}>;

export type PolicyRegistrySnapshotV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.policyRegistrySnapshot;
  policies: readonly PolicyIdentityV1[];
  schemaNormalizerVersion: string;
  schemaNormalizerHash: string;
  snapshotHash: string;
}>;

export type TrustedExecutorFactoryEntryV1 = Readonly<{
  toolId: string;
  toolVersion: string;
  executorBrand: string;
  executorBuildRef: string;
  executorArtifactHash: string;
  adapterId: string;
  adapterVersion: string;
  adapterArtifactHash: string;
  bridgeContractHash: string;
}>;

export type TrustedExecutorBindingV1 = Readonly<{
  toolId: string;
  toolVersion: string;
  executorBrand: string;
  executorBuildRef: string;
  adapterId: string;
  adapterVersion: string;
  executorArtifactHash: string;
  adapterArtifactHash: string;
  bridgeContractHash: string;
  targetPolicyImplementationHash: string;
  aclPolicyImplementationHash: string;
  policyRegistrySnapshotHash: string;
  trustedFactorySnapshotHash: string;
  definitionHash: string;
  bindingHash: string;
}>;

export type RunContextManifestV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.runContextManifest;
  runId: string;
  turnId: string;
  uxCapabilityFingerprint: string;
  revisionBinding: string | null;
  entries: readonly Readonly<{
    contextId: string;
    sourceKind: "user_goal" | "ux_fact" | "resource_fact" | "receipt_evidence";
    sourceRef: string;
    contentHash: string;
    evidenceLevel: string;
    freshness: string;
    maxBytes: number;
  }>[];
  manifestHash: string;
}>;

export type SkillDefinitionV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillDefinition;
  skillId: string;
  skillVersion: string;
  title: string;
  purpose: string;
  mode: "prompt_recipe" | "typed_workflow";
  inputSchema: DeterministicJsonSchemaV1;
  outputSchema: DeterministicJsonSchemaV1;
  requiredTools: readonly Readonly<{
    toolId: string;
    versionRange: string;
    requiredEffect: AuthorityToolEffectV1;
  }>[];
  optionalTools: readonly Readonly<{
    toolId: string;
    versionRange: string;
  }>[];
  requiredUxContracts: readonly Readonly<{
    contractId: string;
    versionRange: string;
  }>[];
  requiredCapabilities: readonly string[];
  promptFragments: readonly Readonly<{
    resourceId: string;
    contentHash: string;
  }>[];
  workflowDefinitionRef: string | null;
  dependencies: readonly Readonly<{
    skillId: string;
    exactVersion: string;
  }>[];
  budgets: Readonly<{
    maxToolCalls: number;
    maxNestedSkillDepth: number;
    maxContextBytes: number;
    maxWallTimeMs: number;
  }>;
  evidencePolicy: Readonly<{
    requiredReceiptEffects: readonly string[];
    completionRubricRef: string;
    claimPolicyId: string;
  }>;
  unavailablePolicyId: string;
}>;

export type ResolvedSkillClosureV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.resolvedSkillClosure;
  packageId: string;
  packageVersion: string;
  packageHash: string;
  skillId: string;
  skillVersion: string;
  skillDefinitionHash: string;
  dependencies: readonly Readonly<{
    packageId: string;
    packageVersion: string;
    packageHash: string;
    skillId: string;
    skillVersion: string;
    skillDefinitionHash: string;
    dependencyClosureHash: string;
  }>[];
  tools: readonly Readonly<{
    toolId: string;
    toolVersion: string;
    definitionHash: string;
    executorBindingHash: string;
    admission: "required" | "optional_admitted";
    declaredBySkillRef: string;
    requiredEffect: AuthorityToolEffectV1;
    supportedClaimEffects: readonly string[];
    optionalAdmissionHash: string | null;
  }>[];
  uxContracts: readonly Readonly<{
    contractId: string;
    contractVersion: string;
    contractHash: string;
  }>[];
  promptResourceHashes: readonly string[];
  requiredReceiptEffects: readonly string[];
  rubricHash: string;
  claimPolicyHash: string;
  closureHash: string;
}>;

export type CapabilityUnavailableV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.capabilityUnavailable;
  kind: "capability_unavailable" | "skill_unavailable";
  runId: string;
  turnId: string;
  actorCallId: string | null;
  attemptId: string;
  requestedId: string;
  requestedVersion: string;
  requestedPackageHash: string | null;
  requestedEffect: string;
  reasonCode: string;
  retryable: boolean;
  missingCapabilities: readonly string[];
  dependencyPath: readonly string[];
  blockingScope: "single_skill" | "conflicting_set" | "entire_run";
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxCapabilitySnapshotHash: string;
  aclSnapshotHash: string;
  catalogFingerprint: string;
  canonicalDeliveryTemplateId: string;
  canonicalDeliveryTemplateVersion: string;
  canonicalDeliveryTemplateHash: string;
  userAction: "wait_for_upgrade" | "contact_owner" | "grant_permission";
  evidenceRefs: readonly string[];
  createdAt: string;
  factHash: string;
}>;

export type SkillConflictRegistrySnapshotV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillConflictRegistrySnapshot;
  conflicts: readonly Readonly<{
    leftSkillRef: string;
    rightSkillRef: string;
    reasonCode: string;
    policyImplementationHash: string;
  }>[];
  snapshotHash: string;
}>;

export type SkillResolutionRequestV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionRequest;
  runId: string;
  requestId: string;
  kernelPrincipalBindingRef: string;
  requestedSkills: readonly Readonly<{
    source: "user_explicit" | "actor_selected";
    skillId: string;
    exactVersion: string;
    packageHash: string;
  }>[];
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxContractFingerprint: string;
  capabilitySnapshotHash: string;
  aclSnapshotHash: string;
  conflictRegistrySnapshotHash: string;
  requestedAt: string;
}>;

export type SkillResolutionPlanV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionPlan;
  runId: string;
  requestId: string;
  resolutionRequestHash: string;
  kernelPrincipalBindingRef: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxCapabilitySnapshotHash: string;
  aclSnapshotHash: string;
  conflictRegistrySnapshotHash: string;
  requestedSkills: readonly Readonly<{
    source: "user_explicit" | "actor_selected" | "dependency";
    skillId: string;
    exactVersion: string;
    packageHash: string;
  }>[];
  orderedClosures: readonly ResolvedSkillClosureV1[];
  unavailable: readonly CapabilityUnavailableV1[];
  conflictPolicy: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.conflictPolicy;
  budgetReservationHash: string;
  closureBudgetReservations: readonly Readonly<{
    resolvedClosureHash: string;
    reservationHash: string;
    maxToolCalls: number;
    maxContextBytes: number;
    maxWallTimeMs: number;
  }>[];
  planHash: string;
}>;

export type SkillActivationRequestV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationRequest;
  runId: string;
  requestId: string;
  idempotencyKey: string;
  kernelPrincipalBindingRef: string;
  resolutionPlanHash: string;
  conflictRegistrySnapshotHash: string;
  resolvedClosureHash: string;
  source: "user_explicit" | "actor_selected" | "dependency";
  skillInputJson: string;
  skillInputHash: string;
  budgetReservationHash: string;
  parentSkillActivationId: string | null;
  parentActivationReceiptHash: string | null;
  requestedAt: string;
}>;

export type SkillActivationReceiptV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationReceipt;
  skillActivationId: string;
  runId: string;
  requestId: string;
  idempotencyKey: string;
  resolutionPlanHash: string;
  activationRequestHash: string;
  conflictRegistrySnapshotHash: string;
  source: "user_explicit" | "actor_selected" | "dependency";
  principalHash: string;
  resolvedClosureHash: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxCapabilitySnapshotHash: string;
  aclSnapshotHash: string;
  skillInputHash: string;
  budgetReservationHash: string;
  parentSkillActivationId: string | null;
  parentActivationReceiptHash: string | null;
  status: "active" | "unavailable";
  issuedAt: string;
  expiresAt: string;
  receiptHash: string;
}>;

export type SkillActivationTransitionReceiptV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillActivationTransitionReceipt;
  transitionReceiptId: string;
  skillActivationId: string;
  runId: string;
  previousState: "active";
  nextState: "completed" | "cancelled";
  previousReceiptHash: string;
  transitionReasonCode: string;
  evidenceSetHash: string | null;
  idempotencyKey: string;
  issuedAt: string;
  receiptHash: string;
}>;

export type SkillToolInvocationRequestV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillToolInvocationRequest;
  runId: string;
  skillActivationId: string;
  activationReceiptHash: string;
  resolvedClosureHash: string;
  toolId: string;
  toolVersion: string;
  toolDefinitionHash: string;
  executorBindingHash: string;
  callId: string;
  requestId: string;
  idempotencyKey: string;
  argumentsJson: string;
  argumentsHash: string;
  budgetReservationHash: string;
}>;

export type SkillEvidenceSetV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillEvidenceSet;
  runId: string;
  skillActivationId: string;
  resolvedClosureHash: string;
  actorCallId: string;
  promptCompositionManifestHash: string;
  resolutionPlanHash: string;
  activationReceiptHash: string;
  linkedToolReceipts: readonly Readonly<{
    receiptId: string;
    receiptHash: string;
    receiptBindingHash: string;
    effect: AuthorityToolEffectV1;
    readbackHash: string | null;
  }>[];
  rubricHash: string;
  rubricEvaluationHash: string;
  claimPolicyHash: string;
  budgetConsumptionHash: string;
  evidenceSetHash: string;
}>;

export type PromptFragmentBindingV1 = Readonly<{
  fragmentId: string;
  sourceKind:
    | "base"
    | "policy"
    | "tool_sheet"
    | "skill"
    | "context"
    | "evidence"
    | "unavailable";
  sourceHash: string;
  trustClass:
    | "trusted_system"
    | "trusted_contract"
    | "untrusted_instructional_content"
    | "untrusted_fact";
  wrapperPolicyId: string;
  wrapperImplementationHash: string;
  renderedFragmentHash: string;
  placement: number;
  maxBytes: number;
  maxTokens: number;
  truncationDecisionHash: string;
}>;

export type PromptCompositionManifestV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.promptCompositionManifest;
  runId: string;
  actorCallId: string;
  composedAt: string;
  basePromptHash: string;
  policyFragmentHashes: readonly string[];
  contextManifestHash: string;
  resolutionPlanHash: string;
  executionAdmissionHash: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  activeSkillClosureHashes: readonly string[];
  activeSkillActivationReceiptHashes: readonly string[];
  orderedFragments: readonly PromptFragmentBindingV1[];
  unavailableFactHashes: readonly string[];
  truncationDecisionHash: string;
  composedPromptHash: string;
  manifestHash: string;
}>;

export type ExecutionAdmissionV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.executionAdmission;
  runId: string;
  actorCallId: string;
  principalHash: string;
  resolutionPlanHash: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxCapabilitySnapshotHash: string;
  aclSnapshotHash: string;
  conflictRegistrySnapshotHash: string;
  activeSkillClosureHashes: readonly string[];
  activeSkillActivationReceiptHashes: readonly string[];
  admittedEffects: readonly AuthorityToolEffectV1[];
  issuedAt: string;
  expiresAt: string;
  admissionHash: string;
}>;

export type ExecutionFingerprintMaterialV1 = Readonly<{
  runId: string;
  actorCallId: string;
  resolutionPlanHash: string;
  contextManifestHash: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  activeSkillClosureHashes: readonly string[];
  activeSkillActivationReceiptHashes: readonly string[];
  promptCompositionManifestHash: string;
  modelIdentityHash: string;
  fingerprintHash: string;
}>;

export type KernelSealedBridgeRequestV1<TPayload> = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.kernelSealedBridgeRequest;
  kernelIssuerId: string;
  kernelFactoryIdentity: string;
  principalBindingHash: string;
  storeBindingRef: string;
  runId: string;
  turnId: string;
  documentId: string;
  aclRevision: string;
  grantOrLeaseRef: string;
  expectedMountId: string;
  expectedRevision: string;
  expectedProfile: string;
  uxCapabilityFingerprint: string;
  policyRegistrySnapshotHash: string;
  bridgeContractId: string;
  operation: "prepare_capture" | "read_capabilities" | "validate" | "simulate" | "commit" | "readback" | "undo";
  toolDefinitionHash: string;
  executorBindingHash: string;
  payloadHash: string;
  issuedAt: string;
  expiresAt: string;
  nonce: string;
  macAlgorithm: "hmac-sha256";
  macKeyId: string;
  sealedIdentityMac: string;
  payload: TPayload;
}>;

export type CompiledAuthorityToolV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.compiledTool;
  definition: AuthorityToolDefinitionV1;
  definitionHash: string;
  policyRegistrySnapshotHash: string;
  resolvedPolicyIdentities: readonly PolicyIdentityV1[];
  executorBinding: TrustedExecutorBindingV1;
  modelDescriptor: CompiledModelToolDescriptorV1;
  promptCapability: CompiledPromptCapabilityEntryV1;
  publicProjection: CompiledPublicProjectionV1;
  fingerprintMaterialHash: string;
  compiledHash: string;
}>;

export type CompiledModelToolDescriptorV1 = Readonly<{
  toolId: string;
  toolVersion: string;
  family: string;
  description: string;
  effect: AuthorityToolEffectV1;
  inputSchema: DeterministicJsonSchemaV1;
  definitionHash: string;
  policyRegistrySnapshotHash: string;
  executorBindingHash: string;
}>;

export type CompiledPromptCapabilityEntryV1 = Readonly<{
  toolId: string;
  toolVersion: string;
  family: string;
  effect: AuthorityToolEffectV1;
  requiredCapabilities: readonly string[];
  usageRuleId: string;
  unavailableRuleId: string;
  definitionHash: string;
  policyRegistrySnapshotHash: string;
  executorBindingHash: string;
}>;

export type CompiledPublicProjectionV1 = Readonly<{
  toolId: string;
  toolVersion: string;
  publicContractVersion: string;
  argumentProjectionId: string;
  modelProjectionId: string;
  publicProjectionId: string;
  argumentProjectorImplementationHash: string;
  modelProjectorImplementationHash: string;
  publicProjectorImplementationHash: string;
  projectorBundleHash: string;
  definitionHash: string;
  policyRegistrySnapshotHash: string;
  executorBindingHash: string;
}>;

export type CompiledToolCatalogV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.compiledCatalog;
  policyRegistrySnapshotHash: string;
  tools: readonly CompiledAuthorityToolV1[];
  catalogHash: string;
}>;

export type SkillPackageDefinitionV1 = Readonly<{
  packageId: string;
  packageVersion: string;
  packageHash: string;
  definition: SkillDefinitionV1;
  definitionHash: string;
  promptResourceHashes: readonly string[];
  rubricHash: string;
}>;

export type SkillCatalogV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.skillCatalog;
  packages: readonly SkillPackageDefinitionV1[];
  catalogHash: string;
}>;

export type OptionalToolAdmissionV1 = Readonly<{
  skillRef: string;
  toolId: string;
  toolVersion: string;
  admissionHash: string;
}>;

export type ResolvedUxContractV1 = Readonly<{
  contractId: string;
  contractVersion: string;
  contractHash: string;
}>;

export type AuthorityToolReceiptBindingV1 = Readonly<{
  contractVersion: typeof FORMAL_R3_AUTHORITY_FABRIC_V1.authorityToolReceiptBinding;
  runId: string;
  receiptId: string;
  receiptHash: string;
  skillActivationId: string;
  activationReceiptHash: string;
  resolvedClosureHash: string;
  toolCatalogHash: string;
  toolDefinitionHash: string;
  executorBindingHash: string;
  effect: AuthorityToolEffectV1;
  readbackHash: string | null;
  bindingHash: string;
}>;
