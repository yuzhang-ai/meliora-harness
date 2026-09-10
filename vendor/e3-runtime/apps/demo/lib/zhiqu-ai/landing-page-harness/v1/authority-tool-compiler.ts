import type {
  AuthorityToolDefinitionV1,
  AuthorityToolEffectV1,
  CompiledAuthorityToolV1,
  CompiledToolCatalogV1,
  PolicyIdentityV1,
  PolicyKindV1,
  PolicyRegistrySnapshotV1,
  ToolDataClassV1,
  TrustedExecutorBindingV1,
  TrustedExecutorFactoryEntryV1,
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
  requiredVersionV1,
  strictRecordShapeV1,
} from "./authority-fabric-codecs";
import {
  DETERMINISTIC_SCHEMA_NORMALIZER_HASH_V1,
  decodeDeterministicJsonSchemaV1,
} from "./authority-fabric-schema";
import { assertRegisteredProjectorClosureV1 } from "./authority-fabric-private-projection";
import { canonicalJsonV1, hashCanonicalJsonV1 } from "./strict-json";

export class AuthorityToolFabricErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthorityToolFabricErrorV1";
  }
}

const POLICY_KINDS = [
  "target",
  "acl",
  "idempotency",
  "retry",
  "reconciliation",
  "receipt",
  "readback",
  "claim",
  "projection",
  "prompt",
] as const satisfies readonly PolicyKindV1[];

const DATA_CLASSES = [
  "opaque_identity",
  "authored_content",
  "canvas_structure",
  "canvas_geometry",
  "private_provenance",
  "authorization_material",
  "external_content",
] as const satisfies readonly ToolDataClassV1[];

const EFFECTS = [
  "private_read",
  "presentation_state",
  "durable_write",
  "external_write",
] as const satisfies readonly AuthorityToolEffectV1[];

const policyKey = (policy: PolicyIdentityV1) =>
  `${policy.policyKind}\u0000${policy.policyId}`;

const decodePolicyIdentity = (value: unknown, path: string): PolicyIdentityV1 => {
  const record = strictRecordShapeV1(
    value,
    ["policyKind", "policyId", "policyVersion", "implementationHash"],
    [],
    path
  );
  return {
    policyKind: requiredEnumV1(record.policyKind, POLICY_KINDS, `${path}.policyKind`),
    policyId: requiredIdV1(record.policyId, `${path}.policyId`),
    policyVersion: requiredVersionV1(record.policyVersion, `${path}.policyVersion`),
    implementationHash: requiredHashV1(record.implementationHash, `${path}.implementationHash`),
  };
};

export const createPolicyRegistrySnapshotV1 = (
  policiesInput: readonly unknown[]
): PolicyRegistrySnapshotV1 => {
  const policies = policiesInput
    .map((entry, index) => decodePolicyIdentity(entry, `policyRegistry.policies[${index}]`))
    .sort((left, right) => compareCodeUnitV1(policyKey(left), policyKey(right)));
  if (new Set(policies.map(policyKey)).size !== policies.length) {
    throw new AuthorityToolFabricErrorV1(
      "policy_identity_conflict",
      "Policy kind and ID must be unique in one snapshot."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.policyRegistrySnapshot,
    policies,
    schemaNormalizerVersion:
      FORMAL_R3_AUTHORITY_FABRIC_V1.schemaNormalizerVersion,
    schemaNormalizerHash: DETERMINISTIC_SCHEMA_NORMALIZER_HASH_V1,
  } as const;
  return { ...material, snapshotHash: hashCanonicalJsonV1(material) };
};

export const decodePolicyRegistrySnapshotV1 = (
  value: unknown
): PolicyRegistrySnapshotV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "policies",
      "schemaNormalizerVersion",
      "schemaNormalizerHash",
      "snapshotHash",
    ],
    [],
    "policyRegistry"
  );
  if (record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.policyRegistrySnapshot) {
    throw new AuthorityToolFabricErrorV1(
      "policy_registry_contract_mismatch",
      "Policy Registry contract version differs."
    );
  }
  if (!Array.isArray(record.policies) || record.policies.length > 256) {
    throw new AuthorityToolFabricErrorV1(
      "policy_registry_budget_exceeded",
      "Policy Registry exceeds its entry budget."
    );
  }
  const decoded = createPolicyRegistrySnapshotV1(record.policies);
  assertCanonicalArrayV1(
    record.policies.map((entry, index) =>
      decodePolicyIdentity(entry, `policyRegistry.policies[${index}]`)
    ),
    policyKey,
    "policyRegistry.policies"
  );
  if (
    record.schemaNormalizerVersion !== decoded.schemaNormalizerVersion ||
    record.schemaNormalizerHash !== decoded.schemaNormalizerHash ||
    record.snapshotHash !== decoded.snapshotHash
  ) {
    throw new AuthorityToolFabricErrorV1(
      "policy_registry_drift",
      "Policy Registry or schema normalizer fingerprint differs."
    );
  }
  return decoded;
};

const decodeAuthority = (value: unknown, path: string) => {
  const record = strictRecordShapeV1(
    value,
    ["grantKind", "revisionPolicy", "targetPolicyId", "aclPolicyId"],
    [],
    path
  );
  return {
    grantKind: requiredEnumV1(
      record.grantKind,
      ["none", "capture_grant", "write_lease"] as const,
      `${path}.grantKind`
    ),
    revisionPolicy: requiredEnumV1(
      record.revisionPolicy,
      ["none", "fresh", "cas"] as const,
      `${path}.revisionPolicy`
    ),
    targetPolicyId: requiredIdV1(record.targetPolicyId, `${path}.targetPolicyId`),
    aclPolicyId: requiredIdV1(record.aclPolicyId, `${path}.aclPolicyId`),
  };
};

const decodeBudgets = (value: unknown, path: string) => {
  const record = strictRecordShapeV1(
    value,
    [
      "maxCallsPerRun",
      "maxInputBytes",
      "maxPrivateResultBytes",
      "maxModelContextBytes",
      "maxPublicEventBytes",
      "maxWallTimeMs",
    ],
    ["maxVisitedNodes"],
    path
  );
  const output = {
    maxCallsPerRun: requiredSafeIntegerV1(record.maxCallsPerRun, `${path}.maxCallsPerRun`, 1, 10_000),
    maxInputBytes: requiredSafeIntegerV1(record.maxInputBytes, `${path}.maxInputBytes`, 1, 10_000_000),
    maxPrivateResultBytes: requiredSafeIntegerV1(record.maxPrivateResultBytes, `${path}.maxPrivateResultBytes`, 1, 50_000_000),
    maxModelContextBytes: requiredSafeIntegerV1(record.maxModelContextBytes, `${path}.maxModelContextBytes`, 1, 10_000_000),
    maxPublicEventBytes: requiredSafeIntegerV1(record.maxPublicEventBytes, `${path}.maxPublicEventBytes`, 1, 1_000_000),
    maxWallTimeMs: requiredSafeIntegerV1(record.maxWallTimeMs, `${path}.maxWallTimeMs`, 1, 3_600_000),
    ...(record.maxVisitedNodes === undefined
      ? {}
      : {
          maxVisitedNodes: requiredSafeIntegerV1(
            record.maxVisitedNodes,
            `${path}.maxVisitedNodes`,
            1,
            1_000_000
          ),
        }),
  };
  if (
    output.maxModelContextBytes > output.maxPrivateResultBytes ||
    output.maxPublicEventBytes > output.maxPrivateResultBytes
  ) {
    throw new AuthorityToolFabricErrorV1(
      "tool_budget_projection_exceeds_private",
      "Model or public projection budget cannot exceed the private result budget."
    );
  }
  return output;
};

export const decodeAuthorityToolDefinitionV1 = (
  value: unknown
): AuthorityToolDefinitionV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "toolId",
      "toolVersion",
      "family",
      "description",
      "inputSchema",
      "privateResultSchema",
      "modelObservationSchema",
      "publicEventSchema",
      "effect",
      "dataClasses",
      "requiredCapabilities",
      "authority",
      "budgets",
      "executionPolicy",
      "evidencePolicy",
      "projectionPolicy",
      "promptPolicy",
    ],
    [],
    "authorityTool"
  );
  if (record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.authorityToolDefinition) {
    throw new AuthorityToolFabricErrorV1(
      "tool_definition_contract_mismatch",
      "Authority Tool contract version differs."
    );
  }
  const authority = decodeAuthority(record.authority, "authorityTool.authority");
  const effect = requiredEnumV1(record.effect, EFFECTS, "authorityTool.effect");
  if (
    (effect === "durable_write" || effect === "external_write") !==
      (authority.grantKind === "write_lease" && authority.revisionPolicy === "cas")
  ) {
    throw new AuthorityToolFabricErrorV1(
      "tool_effect_authority_mismatch",
      "Write effects require write_lease + cas; read effects must not use them."
    );
  }
  const execution = strictRecordShapeV1(
    record.executionPolicy,
    ["requiredExecutorBrand", "idempotencyClass", "retryClass", "reconciliationClass"],
    [],
    "authorityTool.executionPolicy"
  );
  const evidence = strictRecordShapeV1(
    record.evidencePolicy,
    ["receiptType", "readbackPolicy", "supportedClaimEffects"],
    [],
    "authorityTool.evidencePolicy"
  );
  const projection = strictRecordShapeV1(
    record.projectionPolicy,
    [
      "argumentProjectionId",
      "modelProjectionId",
      "publicProjectionId",
      "argumentProjectorImplementationHash",
      "modelProjectorImplementationHash",
      "publicProjectorImplementationHash",
      "projectorBundleHash",
      "publicContractVersion",
    ],
    [],
    "authorityTool.projectionPolicy"
  );
  const prompt = strictRecordShapeV1(
    record.promptPolicy,
    ["usageRuleId", "unavailableRuleId"],
    [],
    "authorityTool.promptPolicy"
  );
  const projectorMaterial = {
    argumentProjectionId: requiredIdV1(
      projection.argumentProjectionId,
      "authorityTool.projectionPolicy.argumentProjectionId"
    ),
    modelProjectionId: requiredIdV1(
      projection.modelProjectionId,
      "authorityTool.projectionPolicy.modelProjectionId"
    ),
    publicProjectionId: requiredIdV1(
      projection.publicProjectionId,
      "authorityTool.projectionPolicy.publicProjectionId"
    ),
    argumentProjectorImplementationHash: requiredHashV1(
      projection.argumentProjectorImplementationHash,
      "authorityTool.projectionPolicy.argumentProjectorImplementationHash"
    ),
    modelProjectorImplementationHash: requiredHashV1(
      projection.modelProjectorImplementationHash,
      "authorityTool.projectionPolicy.modelProjectorImplementationHash"
    ),
    publicProjectorImplementationHash: requiredHashV1(
      projection.publicProjectorImplementationHash,
      "authorityTool.projectionPolicy.publicProjectorImplementationHash"
    ),
  };
  if (
    new Set([
      projectorMaterial.argumentProjectionId,
      projectorMaterial.modelProjectionId,
      projectorMaterial.publicProjectionId,
    ]).size !== 3
  ) {
    throw new AuthorityToolFabricErrorV1(
      "tool_projector_identity_overlap",
      "Argument, model, and public projection identities must be distinct."
    );
  }
  const projectorBundleHash = hashCanonicalJsonV1(projectorMaterial);
  if (projection.projectorBundleHash !== projectorBundleHash) {
    throw new AuthorityToolFabricErrorV1(
      "tool_projector_bundle_drift",
      "Projector bundle hash does not close all three projector implementations."
    );
  }
  const dataClasses = decodeCanonicalStringSetV1(
    record.dataClasses,
    "authorityTool.dataClasses",
    { maxItems: DATA_CLASSES.length, kind: "string" }
  );
  if (dataClasses.some((entry) => !DATA_CLASSES.includes(entry as ToolDataClassV1))) {
    throw new AuthorityToolFabricErrorV1(
      "tool_data_class_invalid",
      "Tool data class is not registered."
    );
  }
  return {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.authorityToolDefinition,
    toolId: requiredIdV1(record.toolId, "authorityTool.toolId"),
    toolVersion: requiredVersionV1(record.toolVersion, "authorityTool.toolVersion"),
    family: requiredIdV1(record.family, "authorityTool.family"),
    description: requiredStringV1(
      record.description,
      "authorityTool.description",
      1_000
    ),
    inputSchema: decodeDeterministicJsonSchemaV1(record.inputSchema, "authorityTool.inputSchema"),
    privateResultSchema: decodeDeterministicJsonSchemaV1(
      record.privateResultSchema,
      "authorityTool.privateResultSchema"
    ),
    modelObservationSchema: decodeDeterministicJsonSchemaV1(
      record.modelObservationSchema,
      "authorityTool.modelObservationSchema"
    ),
    publicEventSchema: decodeDeterministicJsonSchemaV1(
      record.publicEventSchema,
      "authorityTool.publicEventSchema"
    ),
    effect,
    dataClasses: dataClasses as ToolDataClassV1[],
    requiredCapabilities: decodeCanonicalStringSetV1(
      record.requiredCapabilities,
      "authorityTool.requiredCapabilities",
      { allowEmpty: true }
    ),
    authority,
    budgets: decodeBudgets(record.budgets, "authorityTool.budgets"),
    executionPolicy: {
      requiredExecutorBrand: requiredIdV1(
        execution.requiredExecutorBrand,
        "authorityTool.executionPolicy.requiredExecutorBrand"
      ),
      idempotencyClass: requiredIdV1(
        execution.idempotencyClass,
        "authorityTool.executionPolicy.idempotencyClass"
      ),
      retryClass: requiredIdV1(
        execution.retryClass,
        "authorityTool.executionPolicy.retryClass"
      ),
      reconciliationClass: requiredIdV1(
        execution.reconciliationClass,
        "authorityTool.executionPolicy.reconciliationClass"
      ),
    },
    evidencePolicy: {
      receiptType: requiredIdV1(evidence.receiptType, "authorityTool.evidencePolicy.receiptType"),
      readbackPolicy: requiredIdV1(
        evidence.readbackPolicy,
        "authorityTool.evidencePolicy.readbackPolicy"
      ),
      supportedClaimEffects: decodeCanonicalStringSetV1(
        evidence.supportedClaimEffects,
        "authorityTool.evidencePolicy.supportedClaimEffects",
        { allowEmpty: true }
      ),
    },
    projectionPolicy: {
      ...projectorMaterial,
      projectorBundleHash,
      publicContractVersion: requiredVersionV1(
        projection.publicContractVersion,
        "authorityTool.projectionPolicy.publicContractVersion"
      ),
    },
    promptPolicy: {
      usageRuleId: requiredIdV1(prompt.usageRuleId, "authorityTool.promptPolicy.usageRuleId"),
      unavailableRuleId: requiredIdV1(
        prompt.unavailableRuleId,
        "authorityTool.promptPolicy.unavailableRuleId"
      ),
    },
  };
};

export const hashAuthorityToolDefinitionV1 = (value: unknown) =>
  hashCanonicalJsonV1(decodeAuthorityToolDefinitionV1(value));

const resolvePolicy = (
  snapshot: PolicyRegistrySnapshotV1,
  kind: PolicyKindV1,
  policyId: string
) => {
  const matches = snapshot.policies.filter(
    (policy) => policy.policyKind === kind && policy.policyId === policyId
  );
  if (matches.length !== 1) {
    throw new AuthorityToolFabricErrorV1(
      "tool_policy_unresolved",
      `Policy ${kind}:${policyId} is not resolved exactly once.`
    );
  }
  return matches[0]!;
};

const policyRefsFor = (definition: AuthorityToolDefinitionV1) => {
  const refs: Array<readonly [PolicyKindV1, string]> = [
    ["target", definition.authority.targetPolicyId],
    ["acl", definition.authority.aclPolicyId],
    ["idempotency", definition.executionPolicy.idempotencyClass],
    ["retry", definition.executionPolicy.retryClass],
    ["reconciliation", definition.executionPolicy.reconciliationClass],
    ["receipt", definition.evidencePolicy.receiptType],
    ["readback", definition.evidencePolicy.readbackPolicy],
    ["projection", definition.projectionPolicy.argumentProjectionId],
    ["projection", definition.projectionPolicy.modelProjectionId],
    ["projection", definition.projectionPolicy.publicProjectionId],
    ["prompt", definition.promptPolicy.usageRuleId],
    ["prompt", definition.promptPolicy.unavailableRuleId],
    ...definition.evidencePolicy.supportedClaimEffects.map(
      (policyId) => ["claim", policyId] as const
    ),
  ];
  return [
    ...new Map(
      refs.map(([kind, policyId]) => [
        `${kind}\u0000${policyId}`,
        [kind, policyId] as const,
      ])
    ).values(),
  ].sort(([leftKind, leftId], [rightKind, rightId]) =>
    compareCodeUnitV1(
      `${leftKind}\u0000${leftId}`,
      `${rightKind}\u0000${rightId}`
    )
  );
};

const resolvedPoliciesFor = (
  definition: AuthorityToolDefinitionV1,
  snapshot: PolicyRegistrySnapshotV1
) =>
  policyRefsFor(definition)
    .map(([kind, policyId]) => resolvePolicy(snapshot, kind, policyId))
    .sort((left, right) => compareCodeUnitV1(policyKey(left), policyKey(right)));

export const createTrustedExecutorBindingV1 = (input: Readonly<{
  definition: unknown;
  policyRegistry: unknown;
  factoryEntry: TrustedExecutorFactoryEntryV1;
  trustedFactorySnapshotHash: string;
}>): TrustedExecutorBindingV1 => {
  const definition = decodeAuthorityToolDefinitionV1(input.definition);
  const policyRegistry = decodePolicyRegistrySnapshotV1(input.policyRegistry);
  const definitionHash = hashCanonicalJsonV1(definition);
  const factory = input.factoryEntry;
  if (
    factory.toolId !== definition.toolId ||
    factory.toolVersion !== definition.toolVersion ||
    factory.executorBrand !== definition.executionPolicy.requiredExecutorBrand
  ) {
    throw new AuthorityToolFabricErrorV1(
      "trusted_executor_factory_mismatch",
      "Server-owned executor factory entry does not match the Tool Definition."
    );
  }
  const target = resolvePolicy(
    policyRegistry,
    "target",
    definition.authority.targetPolicyId
  );
  const acl = resolvePolicy(policyRegistry, "acl", definition.authority.aclPolicyId);
  const material = {
    toolId: requiredIdV1(factory.toolId, "executorFactory.toolId"),
    toolVersion: requiredVersionV1(factory.toolVersion, "executorFactory.toolVersion"),
    executorBrand: requiredIdV1(factory.executorBrand, "executorFactory.executorBrand"),
    executorBuildRef: requiredStringV1(
      factory.executorBuildRef,
      "executorFactory.executorBuildRef",
      240
    ),
    adapterId: requiredIdV1(factory.adapterId, "executorFactory.adapterId"),
    adapterVersion: requiredVersionV1(factory.adapterVersion, "executorFactory.adapterVersion"),
    executorArtifactHash: requiredHashV1(
      factory.executorArtifactHash,
      "executorFactory.executorArtifactHash"
    ),
    adapterArtifactHash: requiredHashV1(
      factory.adapterArtifactHash,
      "executorFactory.adapterArtifactHash"
    ),
    bridgeContractHash: requiredHashV1(
      factory.bridgeContractHash,
      "executorFactory.bridgeContractHash"
    ),
    targetPolicyImplementationHash: target.implementationHash,
    aclPolicyImplementationHash: acl.implementationHash,
    policyRegistrySnapshotHash: policyRegistry.snapshotHash,
    trustedFactorySnapshotHash: requiredHashV1(
      input.trustedFactorySnapshotHash,
      "executorFactory.snapshotHash"
    ),
    definitionHash,
  };
  return { ...material, bindingHash: hashCanonicalJsonV1(material) };
};

export const decodeTrustedExecutorBindingV1 = (
  value: unknown
): TrustedExecutorBindingV1 => {
  const keys = [
    "toolId",
    "toolVersion",
    "executorBrand",
    "executorBuildRef",
    "adapterId",
    "adapterVersion",
    "executorArtifactHash",
    "adapterArtifactHash",
    "bridgeContractHash",
    "targetPolicyImplementationHash",
    "aclPolicyImplementationHash",
    "policyRegistrySnapshotHash",
    "trustedFactorySnapshotHash",
    "definitionHash",
    "bindingHash",
  ] as const;
  const record = strictRecordShapeV1(value, keys, [], "executorBinding");
  const material = {
    toolId: requiredIdV1(record.toolId, "executorBinding.toolId"),
    toolVersion: requiredVersionV1(record.toolVersion, "executorBinding.toolVersion"),
    executorBrand: requiredIdV1(record.executorBrand, "executorBinding.executorBrand"),
    executorBuildRef: requiredStringV1(
      record.executorBuildRef,
      "executorBinding.executorBuildRef",
      240
    ),
    adapterId: requiredIdV1(record.adapterId, "executorBinding.adapterId"),
    adapterVersion: requiredVersionV1(record.adapterVersion, "executorBinding.adapterVersion"),
    executorArtifactHash: requiredHashV1(
      record.executorArtifactHash,
      "executorBinding.executorArtifactHash"
    ),
    adapterArtifactHash: requiredHashV1(
      record.adapterArtifactHash,
      "executorBinding.adapterArtifactHash"
    ),
    bridgeContractHash: requiredHashV1(
      record.bridgeContractHash,
      "executorBinding.bridgeContractHash"
    ),
    targetPolicyImplementationHash: requiredHashV1(
      record.targetPolicyImplementationHash,
      "executorBinding.targetPolicyImplementationHash"
    ),
    aclPolicyImplementationHash: requiredHashV1(
      record.aclPolicyImplementationHash,
      "executorBinding.aclPolicyImplementationHash"
    ),
    policyRegistrySnapshotHash: requiredHashV1(
      record.policyRegistrySnapshotHash,
      "executorBinding.policyRegistrySnapshotHash"
    ),
    trustedFactorySnapshotHash: requiredHashV1(
      record.trustedFactorySnapshotHash,
      "executorBinding.trustedFactorySnapshotHash"
    ),
    definitionHash: requiredHashV1(record.definitionHash, "executorBinding.definitionHash"),
  };
  if (record.bindingHash !== hashCanonicalJsonV1(material)) {
    throw new AuthorityToolFabricErrorV1(
      "trusted_executor_binding_drift",
      "Executor binding material is not canonical."
    );
  }
  return {
    ...material,
    bindingHash: requiredHashV1(record.bindingHash, "executorBinding.bindingHash"),
  };
};

export const compileAuthorityToolV1 = (input: Readonly<{
  definition: unknown;
  policyRegistry: unknown;
  executorBinding: unknown;
}>): CompiledAuthorityToolV1 => {
  const definition = decodeAuthorityToolDefinitionV1(input.definition);
  assertRegisteredProjectorClosureV1(definition);
  const policyRegistry = decodePolicyRegistrySnapshotV1(input.policyRegistry);
  const executorBinding = decodeTrustedExecutorBindingV1(input.executorBinding);
  const definitionHash = hashCanonicalJsonV1(definition);
  if (
    executorBinding.definitionHash !== definitionHash ||
    executorBinding.toolId !== definition.toolId ||
    executorBinding.toolVersion !== definition.toolVersion ||
    executorBinding.executorBrand !== definition.executionPolicy.requiredExecutorBrand ||
    executorBinding.policyRegistrySnapshotHash !== policyRegistry.snapshotHash
  ) {
    throw new AuthorityToolFabricErrorV1(
      "tool_executor_binding_mismatch",
      "Executor binding is outside the exact Tool/Policy closure."
    );
  }
  const resolvedPolicyIdentities = resolvedPoliciesFor(definition, policyRegistry);
  const projectorPolicies = [
    [
      definition.projectionPolicy.argumentProjectionId,
      definition.projectionPolicy.argumentProjectorImplementationHash,
    ],
    [
      definition.projectionPolicy.modelProjectionId,
      definition.projectionPolicy.modelProjectorImplementationHash,
    ],
    [
      definition.projectionPolicy.publicProjectionId,
      definition.projectionPolicy.publicProjectorImplementationHash,
    ],
  ] as const;
  if (
    projectorPolicies.some(([policyId, implementationHash]) => {
      const matches = resolvedPolicyIdentities.filter(
        (policy) =>
          policy.policyKind === "projection" && policy.policyId === policyId
      );
      return (
        matches.length !== 1 ||
        matches[0]!.implementationHash !== implementationHash
      );
    })
  ) {
    throw new AuthorityToolFabricErrorV1(
      "tool_projector_policy_implementation_mismatch",
      "Projector implementation hashes must match the exact projection Policy Registry entries."
    );
  }
  const common = {
    definitionHash,
    policyRegistrySnapshotHash: policyRegistry.snapshotHash,
    executorBindingHash: executorBinding.bindingHash,
  };
  const modelDescriptor = {
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    family: definition.family,
    description: definition.description,
    effect: definition.effect,
    inputSchema: definition.inputSchema,
    ...common,
  } as const;
  const promptCapability = {
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    family: definition.family,
    effect: definition.effect,
    requiredCapabilities: definition.requiredCapabilities,
    usageRuleId: definition.promptPolicy.usageRuleId,
    unavailableRuleId: definition.promptPolicy.unavailableRuleId,
    ...common,
  } as const;
  const publicProjection = {
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    publicContractVersion: definition.projectionPolicy.publicContractVersion,
    argumentProjectionId: definition.projectionPolicy.argumentProjectionId,
    modelProjectionId: definition.projectionPolicy.modelProjectionId,
    publicProjectionId: definition.projectionPolicy.publicProjectionId,
    argumentProjectorImplementationHash:
      definition.projectionPolicy.argumentProjectorImplementationHash,
    modelProjectorImplementationHash:
      definition.projectionPolicy.modelProjectorImplementationHash,
    publicProjectorImplementationHash:
      definition.projectionPolicy.publicProjectorImplementationHash,
    projectorBundleHash: definition.projectionPolicy.projectorBundleHash,
    ...common,
  } as const;
  const fingerprintMaterialHash = hashCanonicalJsonV1({
    definitionHash,
    policyRegistrySnapshotHash: policyRegistry.snapshotHash,
    resolvedPolicyIdentities,
    executorBindingHash: executorBinding.bindingHash,
    modelDescriptorHash: hashCanonicalJsonV1(modelDescriptor),
    promptCapabilityHash: hashCanonicalJsonV1(promptCapability),
    publicProjectionHash: hashCanonicalJsonV1(publicProjection),
  });
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.compiledTool,
    definition,
    definitionHash,
    policyRegistrySnapshotHash: policyRegistry.snapshotHash,
    resolvedPolicyIdentities,
    executorBinding,
    modelDescriptor,
    promptCapability,
    publicProjection,
    fingerprintMaterialHash,
  } as const;
  return { ...material, compiledHash: hashCanonicalJsonV1(material) };
};

export const compileAuthorityToolCatalogV1 = (
  policyRegistry: unknown,
  entries: readonly Readonly<{
    enabled: boolean;
    definition: unknown;
    executorBinding: unknown;
  }>[]
): CompiledToolCatalogV1 => {
  const registry = decodePolicyRegistrySnapshotV1(policyRegistry);
  const compiled = entries
    .filter((entry) => entry.enabled)
    .map((entry) =>
      compileAuthorityToolV1({
        definition: entry.definition,
        policyRegistry: registry,
        executorBinding: entry.executorBinding,
      })
    )
    .sort((left, right) =>
      compareCodeUnitV1(
        `${left.definition.toolId}\u0000${left.definition.toolVersion}`,
        `${right.definition.toolId}\u0000${right.definition.toolVersion}`
      )
    );
  const identities = compiled.map(
    (tool) => `${tool.definition.toolId}\u0000${tool.definition.toolVersion}`
  );
  if (new Set(identities).size !== identities.length) {
    throw new AuthorityToolFabricErrorV1(
      "tool_catalog_identity_conflict",
      "Compiled Tool Catalog contains duplicate exact identities."
    );
  }
  const modelCallableIds = compiled.map((tool) => tool.definition.toolId);
  if (new Set(modelCallableIds).size !== modelCallableIds.length) {
    throw new AuthorityToolFabricErrorV1(
      "tool_catalog_model_call_identity_conflict",
      "One compiled Tool Catalog may expose only one version of each model-callable toolId."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.compiledCatalog,
    policyRegistrySnapshotHash: registry.snapshotHash,
    tools: compiled,
  } as const;
  return { ...material, catalogHash: hashCanonicalJsonV1(material) };
};

export const decodeCompiledToolCatalogV1 = (
  value: unknown
): CompiledToolCatalogV1 => {
  const record = strictRecordShapeV1(
    value,
    ["contractVersion", "policyRegistrySnapshotHash", "tools", "catalogHash"],
    [],
    "compiledToolCatalog"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.compiledCatalog ||
    !Array.isArray(record.tools)
  ) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_catalog_invalid",
      "Compiled Tool Catalog envelope is invalid."
    );
  }
  const tools = record.tools.map((tool, index) =>
    decodeCompiledAuthorityToolV1(tool, `compiledToolCatalog.tools[${index}]`)
  );
  assertCanonicalArrayV1(
    tools,
    (tool) => `${tool.definition.toolId}\u0000${tool.definition.toolVersion}`,
    "compiledToolCatalog.tools"
  );
  if (
    new Set(tools.map((tool) => tool.definition.toolId)).size !== tools.length
  ) {
    throw new AuthorityToolFabricErrorV1(
      "tool_catalog_model_call_identity_conflict",
      "Persisted compiled Tool Catalog contains ambiguous model-callable toolId versions."
    );
  }
  const policyRegistrySnapshotHash = requiredHashV1(
    record.policyRegistrySnapshotHash,
    "compiledToolCatalog.policyRegistrySnapshotHash"
  );
  if (
    tools.some(
      (tool) => tool.policyRegistrySnapshotHash !== policyRegistrySnapshotHash
    )
  ) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_catalog_policy_drift",
      "Every compiled Tool must bind the catalog Policy Registry Snapshot."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.compiledCatalog,
    policyRegistrySnapshotHash,
    tools,
  } as const;
  const catalogHash = requiredHashV1(record.catalogHash, "compiledToolCatalog.catalogHash");
  if (catalogHash !== hashCanonicalJsonV1(material)) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_catalog_drift",
      "Compiled Tool Catalog hash differs."
    );
  }
  return {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.compiledCatalog,
    policyRegistrySnapshotHash,
    tools,
    catalogHash,
  };
};

export const decodeCompiledAuthorityToolV1 = (
  value: unknown,
  path = "compiledTool"
): CompiledAuthorityToolV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "definition",
      "definitionHash",
      "policyRegistrySnapshotHash",
      "resolvedPolicyIdentities",
      "executorBinding",
      "modelDescriptor",
      "promptCapability",
      "publicProjection",
      "fingerprintMaterialHash",
      "compiledHash",
    ],
    [],
    path
  );
  if (record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.compiledTool) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_contract_mismatch",
      "Compiled Authority Tool contract version differs."
    );
  }
  const definition = decodeAuthorityToolDefinitionV1(record.definition);
  if (canonicalJsonV1(record.definition) !== canonicalJsonV1(definition)) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_definition_not_canonical",
      "Persisted Authority Tool Definition is not canonical."
    );
  }
  const definitionHash = hashCanonicalJsonV1(definition);
  if (record.definitionHash !== definitionHash) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_definition_drift",
      "Compiled Tool definition hash differs."
    );
  }
  const policyRegistrySnapshotHash = requiredHashV1(
    record.policyRegistrySnapshotHash,
    `${path}.policyRegistrySnapshotHash`
  );
  const executorBinding = decodeTrustedExecutorBindingV1(record.executorBinding);
  if (
    executorBinding.definitionHash !== definitionHash ||
    executorBinding.toolId !== definition.toolId ||
    executorBinding.toolVersion !== definition.toolVersion ||
    executorBinding.policyRegistrySnapshotHash !== policyRegistrySnapshotHash
  ) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_executor_binding_drift",
      "Compiled Tool executor binding differs from its definition or policy snapshot."
    );
  }
  if (!Array.isArray(record.resolvedPolicyIdentities)) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_policy_set_invalid",
      "Compiled Tool policy identities must be an array."
    );
  }
  const resolvedPolicyIdentities = record.resolvedPolicyIdentities.map(
    (entry, index) =>
      decodePolicyIdentity(entry, `${path}.resolvedPolicyIdentities[${index}]`)
  );
  assertCanonicalArrayV1(
    resolvedPolicyIdentities,
    policyKey,
    `${path}.resolvedPolicyIdentities`
  );
  const actualPolicyRefs = resolvedPolicyIdentities.map(policyKey);
  const expectedPolicyRefs = policyRefsFor(definition).map(
    ([kind, policyId]) => `${kind}\u0000${policyId}`
  );
  if (canonicalJsonV1(actualPolicyRefs) !== canonicalJsonV1(expectedPolicyRefs)) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_policy_set_drift",
      "Compiled Tool policy identities do not close every referenced policy exactly once."
    );
  }
  const common = {
    definitionHash,
    policyRegistrySnapshotHash,
    executorBindingHash: executorBinding.bindingHash,
  };
  const modelDescriptor = {
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    family: definition.family,
    description: definition.description,
    effect: definition.effect,
    inputSchema: definition.inputSchema,
    ...common,
  } as const;
  const promptCapability = {
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    family: definition.family,
    effect: definition.effect,
    requiredCapabilities: definition.requiredCapabilities,
    usageRuleId: definition.promptPolicy.usageRuleId,
    unavailableRuleId: definition.promptPolicy.unavailableRuleId,
    ...common,
  } as const;
  const publicProjection = {
    toolId: definition.toolId,
    toolVersion: definition.toolVersion,
    publicContractVersion: definition.projectionPolicy.publicContractVersion,
    argumentProjectionId: definition.projectionPolicy.argumentProjectionId,
    modelProjectionId: definition.projectionPolicy.modelProjectionId,
    publicProjectionId: definition.projectionPolicy.publicProjectionId,
    argumentProjectorImplementationHash:
      definition.projectionPolicy.argumentProjectorImplementationHash,
    modelProjectorImplementationHash:
      definition.projectionPolicy.modelProjectorImplementationHash,
    publicProjectorImplementationHash:
      definition.projectionPolicy.publicProjectorImplementationHash,
    projectorBundleHash: definition.projectionPolicy.projectorBundleHash,
    ...common,
  } as const;
  for (const [name, actual, expected] of [
    ["model", record.modelDescriptor, modelDescriptor],
    ["prompt", record.promptCapability, promptCapability],
    ["public", record.publicProjection, publicProjection],
  ] as const) {
    if (canonicalJsonV1(actual) !== canonicalJsonV1(expected)) {
      throw new AuthorityToolFabricErrorV1(
        `compiled_tool_${name}_projection_drift`,
        `Compiled Tool ${name} projection differs from the Authority Tool definition.`
      );
    }
  }
  const fingerprintMaterialHash = hashCanonicalJsonV1({
    definitionHash,
    policyRegistrySnapshotHash,
    resolvedPolicyIdentities,
    executorBindingHash: executorBinding.bindingHash,
    modelDescriptorHash: hashCanonicalJsonV1(modelDescriptor),
    promptCapabilityHash: hashCanonicalJsonV1(promptCapability),
    publicProjectionHash: hashCanonicalJsonV1(publicProjection),
  });
  if (record.fingerprintMaterialHash !== fingerprintMaterialHash) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_fingerprint_drift",
      "Compiled Tool fingerprint material differs."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.compiledTool,
    definition,
    definitionHash,
    policyRegistrySnapshotHash,
    resolvedPolicyIdentities,
    executorBinding,
    modelDescriptor,
    promptCapability,
    publicProjection,
    fingerprintMaterialHash,
  } as const;
  const compiledHash = requiredHashV1(record.compiledHash, `${path}.compiledHash`);
  if (compiledHash !== hashCanonicalJsonV1(material)) {
    throw new AuthorityToolFabricErrorV1(
      "compiled_tool_hash_drift",
      "Compiled Tool hash differs."
    );
  }
  return { ...material, compiledHash };
};
