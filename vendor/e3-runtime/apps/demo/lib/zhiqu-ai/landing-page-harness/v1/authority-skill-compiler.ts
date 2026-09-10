import type {
  AuthorityToolEffectV1,
  CapabilityUnavailableV1,
  CompiledAuthorityToolV1,
  CompiledToolCatalogV1,
  OptionalToolAdmissionV1,
  ResolvedSkillClosureV1,
  ResolvedUxContractV1,
  SkillCatalogV1,
  SkillConflictRegistrySnapshotV1,
  SkillDefinitionV1,
  SkillPackageDefinitionV1,
  SkillResolutionPlanV1,
  SkillResolutionRequestV1,
} from "./authority-fabric-contracts";
import { FORMAL_R3_AUTHORITY_FABRIC_V1 } from "./authority-fabric-contracts";
import {
  assertCanonicalArrayV1,
  compareCodeUnitV1,
  decodeCanonicalStringSetV1,
  requiredBooleanV1,
  requiredEnumV1,
  requiredHashV1,
  requiredIdV1,
  requiredSafeIntegerV1,
  requiredStringV1,
  requiredTimestampV1,
  requiredVersionV1,
  strictRecordShapeV1,
} from "./authority-fabric-codecs";
import { decodeDeterministicJsonSchemaV1 } from "./authority-fabric-schema";
import {
  decodeCompiledToolCatalogV1,
} from "./authority-tool-compiler";
import { StrictJsonErrorV1, hashCanonicalJsonV1 } from "./strict-json";

export class AuthoritySkillFabricErrorV1 extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly details: Readonly<{
      missingCapabilities?: readonly string[];
      dependencyPath?: readonly string[];
    }> = {}
  ) {
    super(message);
    this.name = "AuthoritySkillFabricErrorV1";
  }
}

const skillRef = (input: Readonly<{
  skillId: string;
  skillVersion: string;
  packageHash: string;
}>) => `${input.skillId}@${input.skillVersion}#${input.packageHash}`;

const exactSkillIdentity = (input: Readonly<{
  skillId: string;
  skillVersion: string;
}>) => `${input.skillId}\u0000${input.skillVersion}`;

const compareBy = <T>(key: (entry: T) => string) => (left: T, right: T) =>
  compareCodeUnitV1(key(left), key(right));

const decodeVersionRange = (value: unknown, path: string) => {
  const range = requiredStringV1(value, path, 80);
  if (!/^[A-Za-z0-9.*+^~<>=| _-]{1,80}$/u.test(range)) {
    throw new StrictJsonErrorV1("invalid_version_range", path, "Version range is invalid.");
  }
  return range;
};

const exactRangeMatches = (range: string, version: string) =>
  range === version || range === `=${version}`;

const decodeRequiredTool = (value: unknown, path: string) => {
  const record = strictRecordShapeV1(
    value,
    ["toolId", "versionRange", "requiredEffect"],
    [],
    path
  );
  return {
    toolId: requiredIdV1(record.toolId, `${path}.toolId`),
    versionRange: decodeVersionRange(record.versionRange, `${path}.versionRange`),
    requiredEffect: requiredEnumV1(
      record.requiredEffect,
      ["private_read", "presentation_state", "durable_write", "external_write"] as const,
      `${path}.requiredEffect`
    ),
  };
};

const decodeOptionalTool = (value: unknown, path: string) => {
  const record = strictRecordShapeV1(value, ["toolId", "versionRange"], [], path);
  return {
    toolId: requiredIdV1(record.toolId, `${path}.toolId`),
    versionRange: decodeVersionRange(record.versionRange, `${path}.versionRange`),
  };
};

const decodeUxRequirement = (value: unknown, path: string) => {
  const record = strictRecordShapeV1(value, ["contractId", "versionRange"], [], path);
  return {
    contractId: requiredIdV1(record.contractId, `${path}.contractId`),
    versionRange: decodeVersionRange(record.versionRange, `${path}.versionRange`),
  };
};

const uniqueSortedObjects = <T>(
  value: unknown,
  path: string,
  decoder: (entry: unknown, entryPath: string) => T,
  key: (entry: T) => string,
  max = 64
) => {
  if (!Array.isArray(value) || value.length > max) {
    throw new StrictJsonErrorV1("invalid_array", path, "Expected a bounded array.");
  }
  const output = value
    .map((entry, index) => decoder(entry, `${path}[${index}]`))
    .sort(compareBy(key));
  if (new Set(output.map(key)).size !== output.length) {
    throw new StrictJsonErrorV1("duplicate_array_entry", path, "Entries must be unique.");
  }
  return output;
};

export const decodeSkillDefinitionV1 = (value: unknown): SkillDefinitionV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "skillId",
      "skillVersion",
      "title",
      "purpose",
      "mode",
      "inputSchema",
      "outputSchema",
      "requiredTools",
      "optionalTools",
      "requiredUxContracts",
      "requiredCapabilities",
      "promptFragments",
      "workflowDefinitionRef",
      "dependencies",
      "budgets",
      "evidencePolicy",
      "unavailablePolicyId",
    ],
    [],
    "skillDefinition"
  );
  if (record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.skillDefinition) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_definition_contract_mismatch",
      "Skill Definition contract differs."
    );
  }
  const requiredTools = uniqueSortedObjects(
    record.requiredTools,
    "skillDefinition.requiredTools",
    decodeRequiredTool,
    (entry) => entry.toolId
  );
  const optionalTools = uniqueSortedObjects(
    record.optionalTools,
    "skillDefinition.optionalTools",
    decodeOptionalTool,
    (entry) => entry.toolId
  );
  if (
    requiredTools.some((required) =>
      optionalTools.some((optional) => optional.toolId === required.toolId)
    )
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_tool_admission_overlap",
      "A Tool cannot be both required and optional in one Skill."
    );
  }
  const requiredUxContracts = uniqueSortedObjects(
    record.requiredUxContracts,
    "skillDefinition.requiredUxContracts",
    decodeUxRequirement,
    (entry) => entry.contractId
  );
  const promptFragments = uniqueSortedObjects(
    record.promptFragments,
    "skillDefinition.promptFragments",
    (entry, path) => {
      const fragment = strictRecordShapeV1(entry, ["resourceId", "contentHash"], [], path);
      return {
        resourceId: requiredIdV1(fragment.resourceId, `${path}.resourceId`),
        contentHash: requiredHashV1(fragment.contentHash, `${path}.contentHash`),
      };
    },
    (entry) => entry.resourceId
  );
  const dependencies = uniqueSortedObjects(
    record.dependencies,
    "skillDefinition.dependencies",
    (entry, path) => {
      const dependency = strictRecordShapeV1(entry, ["skillId", "exactVersion"], [], path);
      return {
        skillId: requiredIdV1(dependency.skillId, `${path}.skillId`),
        exactVersion: requiredVersionV1(dependency.exactVersion, `${path}.exactVersion`),
      };
    },
    (entry) => `${entry.skillId}\u0000${entry.exactVersion}`
  );
  const budgets = strictRecordShapeV1(
    record.budgets,
    ["maxToolCalls", "maxNestedSkillDepth", "maxContextBytes", "maxWallTimeMs"],
    [],
    "skillDefinition.budgets"
  );
  const evidence = strictRecordShapeV1(
    record.evidencePolicy,
    ["requiredReceiptEffects", "completionRubricRef", "claimPolicyId"],
    [],
    "skillDefinition.evidencePolicy"
  );
  const mode = requiredEnumV1(
    record.mode,
    ["prompt_recipe", "typed_workflow"] as const,
    "skillDefinition.mode"
  );
  const workflowDefinitionRef =
    record.workflowDefinitionRef === null
      ? null
      : requiredIdV1(
          record.workflowDefinitionRef,
          "skillDefinition.workflowDefinitionRef"
        );
  if (
    (mode === "prompt_recipe" && workflowDefinitionRef !== null) ||
    (mode === "typed_workflow" && workflowDefinitionRef === null)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_mode_workflow_ref_mismatch",
      "Skill mode and workflow definition reference differ."
    );
  }
  return {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillDefinition,
    skillId: requiredIdV1(record.skillId, "skillDefinition.skillId"),
    skillVersion: requiredVersionV1(record.skillVersion, "skillDefinition.skillVersion"),
    title: requiredStringV1(record.title, "skillDefinition.title", 160),
    purpose: requiredStringV1(record.purpose, "skillDefinition.purpose", 1_000),
    mode,
    inputSchema: decodeDeterministicJsonSchemaV1(
      record.inputSchema,
      "skillDefinition.inputSchema"
    ),
    outputSchema: decodeDeterministicJsonSchemaV1(
      record.outputSchema,
      "skillDefinition.outputSchema"
    ),
    requiredTools,
    optionalTools,
    requiredUxContracts,
    requiredCapabilities: decodeCanonicalStringSetV1(
      record.requiredCapabilities,
      "skillDefinition.requiredCapabilities",
      { allowEmpty: true }
    ),
    promptFragments,
    workflowDefinitionRef,
    dependencies,
    budgets: {
      maxToolCalls: requiredSafeIntegerV1(
        budgets.maxToolCalls,
        "skillDefinition.budgets.maxToolCalls",
        1,
        1_000
      ),
      maxNestedSkillDepth: requiredSafeIntegerV1(
        budgets.maxNestedSkillDepth,
        "skillDefinition.budgets.maxNestedSkillDepth",
        0,
        2
      ),
      maxContextBytes: requiredSafeIntegerV1(
        budgets.maxContextBytes,
        "skillDefinition.budgets.maxContextBytes",
        1,
        10_000_000
      ),
      maxWallTimeMs: requiredSafeIntegerV1(
        budgets.maxWallTimeMs,
        "skillDefinition.budgets.maxWallTimeMs",
        1,
        3_600_000
      ),
    },
    evidencePolicy: {
      requiredReceiptEffects: decodeCanonicalStringSetV1(
        evidence.requiredReceiptEffects,
        "skillDefinition.evidencePolicy.requiredReceiptEffects",
        { allowEmpty: true, requireCanonical: true }
      ),
      completionRubricRef: requiredIdV1(
        evidence.completionRubricRef,
        "skillDefinition.evidencePolicy.completionRubricRef"
      ),
      claimPolicyId: requiredIdV1(
        evidence.claimPolicyId,
        "skillDefinition.evidencePolicy.claimPolicyId"
      ),
    },
    unavailablePolicyId: requiredIdV1(
      record.unavailablePolicyId,
      "skillDefinition.unavailablePolicyId"
    ),
  };
};

export const hashSkillDefinitionV1 = (value: unknown) =>
  hashCanonicalJsonV1(decodeSkillDefinitionV1(value));

export const createSkillPackageDefinitionV1 = (input: Readonly<{
  packageId: string;
  packageVersion: string;
  definition: unknown;
  promptResourceHashes: readonly string[];
  rubricHash: string;
}>): SkillPackageDefinitionV1 => {
  const definition = decodeSkillDefinitionV1(input.definition);
  const definitionHash = hashCanonicalJsonV1(definition);
  const material = {
    packageId: requiredIdV1(input.packageId, "skillPackage.packageId"),
    packageVersion: requiredVersionV1(
      input.packageVersion,
      "skillPackage.packageVersion"
    ),
    definition,
    definitionHash,
    promptResourceHashes: decodeCanonicalStringSetV1(
      input.promptResourceHashes,
      "skillPackage.promptResourceHashes",
      { allowEmpty: true, kind: "hash" }
    ),
    rubricHash: requiredHashV1(input.rubricHash, "skillPackage.rubricHash"),
  } as const;
  const packageHash = hashCanonicalJsonV1(material);
  return {
    packageId: material.packageId,
    packageVersion: material.packageVersion,
    packageHash,
    definition,
    definitionHash,
    promptResourceHashes: material.promptResourceHashes,
    rubricHash: material.rubricHash,
  };
};

export const decodeSkillPackageDefinitionV1 = (
  value: unknown,
  path = "skillPackage"
): SkillPackageDefinitionV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "packageId",
      "packageVersion",
      "packageHash",
      "definition",
      "definitionHash",
      "promptResourceHashes",
      "rubricHash",
    ],
    [],
    path
  );
  if (!Array.isArray(record.promptResourceHashes)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_package_prompt_resources_invalid",
      "Skill package prompt resources must be an array."
    );
  }
  const decoded = createSkillPackageDefinitionV1({
    packageId: record.packageId as string,
    packageVersion: record.packageVersion as string,
    definition: record.definition,
    promptResourceHashes: record.promptResourceHashes as string[],
    rubricHash: record.rubricHash as string,
  });
  if (hashCanonicalJsonV1(record.definition) !== hashCanonicalJsonV1(decoded.definition)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_package_definition_not_canonical",
      "Persisted Skill Definition is not canonical."
    );
  }
  assertCanonicalArrayV1(
    record.promptResourceHashes as string[],
    (entry) => entry,
    `${path}.promptResourceHashes`
  );
  if (
    record.definitionHash !== decoded.definitionHash ||
    record.packageHash !== decoded.packageHash
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_package_hash_drift",
      "Skill package or definition hash differs."
    );
  }
  return decoded;
};

export const createSkillCatalogV1 = (
  packagesInput: readonly SkillPackageDefinitionV1[]
): SkillCatalogV1 => {
  const packages = packagesInput
    .map((entry, index) =>
      decodeSkillPackageDefinitionV1(entry, `skillCatalog.packages[${index}]`)
    )
    .sort(compareBy((entry) => skillRef({
    skillId: entry.definition.skillId,
    skillVersion: entry.definition.skillVersion,
    packageHash: entry.packageHash,
  })));
  const exactIdentities = packages.map((entry) => exactSkillIdentity({
    skillId: entry.definition.skillId,
    skillVersion: entry.definition.skillVersion,
  }));
  if (new Set(exactIdentities).size !== exactIdentities.length) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_catalog_identity_conflict",
      "The same skillId@version cannot resolve to multiple package or definition hashes."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillCatalog,
    packages,
  } as const;
  return { ...material, catalogHash: hashCanonicalJsonV1(material) };
};

export const decodeSkillCatalogV1 = (value: unknown): SkillCatalogV1 => {
  const record = strictRecordShapeV1(
    value,
    ["contractVersion", "packages", "catalogHash"],
    [],
    "skillCatalog"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.skillCatalog ||
    !Array.isArray(record.packages)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_catalog_contract_mismatch",
      "Skill Catalog contract differs."
    );
  }
  const packages = record.packages.map((entry, index) =>
    decodeSkillPackageDefinitionV1(entry, `skillCatalog.packages[${index}]`)
  );
  assertCanonicalArrayV1(
    packages,
    (entry) =>
      skillRef({
        skillId: entry.definition.skillId,
        skillVersion: entry.definition.skillVersion,
        packageHash: entry.packageHash,
      }),
    "skillCatalog.packages"
  );
  const decoded = createSkillCatalogV1(packages);
  if (record.catalogHash !== decoded.catalogHash) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_catalog_hash_drift",
      "Skill Catalog hash differs."
    );
  }
  return decoded;
};

const conflictPair = (left: string, right: string) =>
  compareCodeUnitV1(left, right) < 0 ? `${left}\u0000${right}` : `${right}\u0000${left}`;

export const createSkillConflictRegistrySnapshotV1 = (
  conflictsInput: SkillConflictRegistrySnapshotV1["conflicts"]
): SkillConflictRegistrySnapshotV1 => {
  const conflicts = [...conflictsInput]
    .map((entry, index) => {
      const path = `skillConflictRegistry.conflicts[${index}]`;
      const record = strictRecordShapeV1(
        entry,
        ["leftSkillRef", "rightSkillRef", "reasonCode", "policyImplementationHash"],
        [],
        path
      );
      const leftSkillRef = requiredStringV1(record.leftSkillRef, `${path}.leftSkillRef`, 320);
      const rightSkillRef = requiredStringV1(record.rightSkillRef, `${path}.rightSkillRef`, 320);
      if (leftSkillRef === rightSkillRef) {
        throw new AuthoritySkillFabricErrorV1(
          "skill_conflict_self_reference",
          "A Skill cannot conflict with itself."
        );
      }
      const [left, right] = conflictPair(leftSkillRef, rightSkillRef).split("\u0000");
      return {
        leftSkillRef: left!,
        rightSkillRef: right!,
        reasonCode: requiredIdV1(record.reasonCode, `${path}.reasonCode`),
        policyImplementationHash: requiredHashV1(
          record.policyImplementationHash,
          `${path}.policyImplementationHash`
        ),
      };
    })
    .sort(compareBy((entry) => `${entry.leftSkillRef}\u0000${entry.rightSkillRef}`));
  if (
    new Set(conflicts.map((entry) => `${entry.leftSkillRef}\u0000${entry.rightSkillRef}`))
      .size !== conflicts.length
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_conflict_registry_duplicate",
      "Skill conflict pairs must be unique."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillConflictRegistrySnapshot,
    conflicts,
  } as const;
  return { ...material, snapshotHash: hashCanonicalJsonV1(material) };
};

export const decodeSkillConflictRegistrySnapshotV1 = (
  value: unknown
): SkillConflictRegistrySnapshotV1 => {
  const record = strictRecordShapeV1(
    value,
    ["contractVersion", "conflicts", "snapshotHash"],
    [],
    "skillConflictRegistry"
  );
  if (
    record.contractVersion !==
      FORMAL_R3_AUTHORITY_FABRIC_V1.skillConflictRegistrySnapshot ||
    !Array.isArray(record.conflicts)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_conflict_registry_contract_mismatch",
      "Skill Conflict Registry contract differs."
    );
  }
  const decoded = createSkillConflictRegistrySnapshotV1(
    record.conflicts as SkillConflictRegistrySnapshotV1["conflicts"]
  );
  if (hashCanonicalJsonV1(record.conflicts) !== hashCanonicalJsonV1(decoded.conflicts)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_conflict_registry_not_canonical",
      "Persisted Skill Conflict Registry is not canonical."
    );
  }
  assertCanonicalArrayV1(
    record.conflicts as SkillConflictRegistrySnapshotV1["conflicts"],
    (entry) => `${entry.leftSkillRef}\u0000${entry.rightSkillRef}`,
    "skillConflictRegistry.conflicts"
  );
  if (record.snapshotHash !== decoded.snapshotHash) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_conflict_registry_hash_drift",
      "Skill Conflict Registry hash differs."
    );
  }
  return decoded;
};

export const createSkillResolutionRequestV1 = (
  input: Omit<SkillResolutionRequestV1, "contractVersion" | "requestedSkills">
    & Pick<SkillResolutionRequestV1, "requestedSkills">
): SkillResolutionRequestV1 => {
  const sourceRank = { user_explicit: 0, actor_selected: 1 } as const;
  const requested = input.requestedSkills
    .map((entry, index) => ({
      source: requiredEnumV1(
        entry.source,
        ["user_explicit", "actor_selected"] as const,
        `skillResolutionRequest.requestedSkills[${index}].source`
      ),
      skillId: requiredIdV1(
        entry.skillId,
        `skillResolutionRequest.requestedSkills[${index}].skillId`
      ),
      exactVersion: requiredVersionV1(
        entry.exactVersion,
        `skillResolutionRequest.requestedSkills[${index}].exactVersion`
      ),
      packageHash: requiredHashV1(
        entry.packageHash,
        `skillResolutionRequest.requestedSkills[${index}].packageHash`
      ),
    }))
    .sort((left, right) => {
      const rank = sourceRank[left.source] - sourceRank[right.source];
      return rank || compareCodeUnitV1(
        `${left.skillId}\u0000${left.exactVersion}\u0000${left.packageHash}`,
        `${right.skillId}\u0000${right.exactVersion}\u0000${right.packageHash}`
      );
    });
  const byIdentity = new Map<string, (typeof requested)[number]>();
  for (const entry of requested) {
    const key = `${entry.skillId}\u0000${entry.exactVersion}`;
    const current = byIdentity.get(key);
    if (current && current.packageHash !== entry.packageHash) {
      throw new AuthoritySkillFabricErrorV1(
        "skill_resolution_request_package_conflict",
        "One exact Skill identity cannot request multiple package hashes."
      );
    }
    if (!current || (current.source === "actor_selected" && entry.source === "user_explicit")) {
      byIdentity.set(key, entry);
    }
  }
  return {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionRequest,
    runId: requiredIdV1(input.runId, "skillResolutionRequest.runId"),
    requestId: requiredIdV1(input.requestId, "skillResolutionRequest.requestId"),
    kernelPrincipalBindingRef: requiredIdV1(
      input.kernelPrincipalBindingRef,
      "skillResolutionRequest.kernelPrincipalBindingRef"
    ),
    requestedSkills: [...byIdentity.values()],
    toolCatalogHash: requiredHashV1(
      input.toolCatalogHash,
      "skillResolutionRequest.toolCatalogHash"
    ),
    skillCatalogHash: requiredHashV1(
      input.skillCatalogHash,
      "skillResolutionRequest.skillCatalogHash"
    ),
    uxContractFingerprint: requiredHashV1(
      input.uxContractFingerprint,
      "skillResolutionRequest.uxContractFingerprint"
    ),
    capabilitySnapshotHash: requiredHashV1(
      input.capabilitySnapshotHash,
      "skillResolutionRequest.capabilitySnapshotHash"
    ),
    aclSnapshotHash: requiredHashV1(
      input.aclSnapshotHash,
      "skillResolutionRequest.aclSnapshotHash"
    ),
    conflictRegistrySnapshotHash: requiredHashV1(
      input.conflictRegistrySnapshotHash,
      "skillResolutionRequest.conflictRegistrySnapshotHash"
    ),
    requestedAt: requiredTimestampV1(
      input.requestedAt,
      "skillResolutionRequest.requestedAt"
    ),
  };
};

export const decodeSkillResolutionRequestV1 = (
  value: unknown
): SkillResolutionRequestV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "requestId",
      "kernelPrincipalBindingRef",
      "requestedSkills",
      "toolCatalogHash",
      "skillCatalogHash",
      "uxContractFingerprint",
      "capabilitySnapshotHash",
      "aclSnapshotHash",
      "conflictRegistrySnapshotHash",
      "requestedAt",
    ],
    [],
    "skillResolutionRequest"
  );
  if (
    record.contractVersion !==
      FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionRequest ||
    !Array.isArray(record.requestedSkills)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_request_contract_mismatch",
      "Skill Resolution Request contract differs."
    );
  }
  const decoded = createSkillResolutionRequestV1({
    runId: record.runId as string,
    requestId: record.requestId as string,
    kernelPrincipalBindingRef: record.kernelPrincipalBindingRef as string,
    requestedSkills: record.requestedSkills as SkillResolutionRequestV1["requestedSkills"],
    toolCatalogHash: record.toolCatalogHash as string,
    skillCatalogHash: record.skillCatalogHash as string,
    uxContractFingerprint: record.uxContractFingerprint as string,
    capabilitySnapshotHash: record.capabilitySnapshotHash as string,
    aclSnapshotHash: record.aclSnapshotHash as string,
    conflictRegistrySnapshotHash:
      record.conflictRegistrySnapshotHash as string,
    requestedAt: record.requestedAt as string,
  });
  if (hashCanonicalJsonV1(record.requestedSkills) !== hashCanonicalJsonV1(decoded.requestedSkills)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_request_order_drift",
      "Persisted requested Skills are not canonical."
    );
  }
  return decoded;
};

type ResolveEnvironment = Readonly<{
  request: SkillResolutionRequestV1;
  skillCatalog: SkillCatalogV1;
  toolCatalog: CompiledToolCatalogV1;
  uxContracts: readonly ResolvedUxContractV1[];
  availableCapabilities: ReadonlySet<string>;
  optionalToolAdmissions: readonly OptionalToolAdmissionV1[];
}>;

type ClosureBuild = Readonly<{
  closure: ResolvedSkillClosureV1;
  all: ReadonlyMap<string, ResolvedSkillClosureV1>;
}>;

const resolvePackage = (
  catalog: SkillCatalogV1,
  skillId: string,
  skillVersion: string,
  packageHash?: string
) => {
  const matches = catalog.packages.filter(
    (entry) =>
      entry.definition.skillId === skillId &&
      entry.definition.skillVersion === skillVersion &&
      (packageHash === undefined || entry.packageHash === packageHash)
  );
  if (matches.length !== 1) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_package_unresolved",
      `Skill ${skillId}@${skillVersion} does not resolve exactly once.`
    );
  }
  return matches[0]!;
};

const resolveTool = (
  catalog: CompiledToolCatalogV1,
  toolId: string,
  versionRange: string
) => {
  const matches = catalog.tools.filter(
    (entry) =>
      entry.definition.toolId === toolId &&
      exactRangeMatches(versionRange, entry.definition.toolVersion)
  );
  if (matches.length !== 1) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_tool_unresolved",
      `Tool ${toolId}@${versionRange} does not resolve exactly once.`
    );
  }
  return matches[0]!;
};

const resolveUx = (
  contracts: readonly ResolvedUxContractV1[],
  contractId: string,
  versionRange: string
) => {
  const matches = contracts.filter(
    (entry) =>
      entry.contractId === contractId &&
      exactRangeMatches(versionRange, entry.contractVersion)
  );
  if (matches.length !== 1) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_ux_contract_unresolved",
      `UX contract ${contractId}@${versionRange} does not resolve exactly once.`
    );
  }
  return matches[0]!;
};

const buildClosure = (
  pkg: SkillPackageDefinitionV1,
  env: ResolveEnvironment,
  stack: readonly string[],
  depth: number,
  rootMaxDepth: number
): ClosureBuild => {
  const ref = skillRef({
    skillId: pkg.definition.skillId,
    skillVersion: pkg.definition.skillVersion,
    packageHash: pkg.packageHash,
  });
  if (stack.includes(ref)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_dependency_cycle",
      `Skill dependency cycle detected at ${ref}.`
    );
  }
  if (depth > rootMaxDepth) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_dependency_depth_exceeded",
      `Skill dependency depth exceeded at ${ref}.`
    );
  }
  if (pkg.definition.mode !== "prompt_recipe") {
    throw new AuthoritySkillFabricErrorV1(
      "typed_workflow_not_admitted_b0",
      "B0 does not admit typed workflow Skills."
    );
  }
  const missingCapabilities = pkg.definition.requiredCapabilities.filter(
    (capability) => !env.availableCapabilities.has(capability)
  );
  if (missingCapabilities.length) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_capability_unavailable",
      `Missing capabilities: ${missingCapabilities.join(",")}.`,
      { missingCapabilities, dependencyPath: [...stack, ref] }
    );
  }
  const dependencyBuilds = pkg.definition.dependencies.map((dependency) =>
    buildClosure(
      resolvePackage(
        env.skillCatalog,
        dependency.skillId,
        dependency.exactVersion
      ),
      env,
      [...stack, ref],
      depth + 1,
      rootMaxDepth
    )
  );
  const all = new Map<string, ResolvedSkillClosureV1>();
  for (const build of dependencyBuilds) {
    for (const [hash, closure] of build.all) all.set(hash, closure);
    all.set(build.closure.closureHash, build.closure);
  }
  const dependencies = dependencyBuilds
    .map(({ closure }) => ({
      packageId: closure.packageId,
      packageVersion: closure.packageVersion,
      packageHash: closure.packageHash,
      skillId: closure.skillId,
      skillVersion: closure.skillVersion,
      skillDefinitionHash: closure.skillDefinitionHash,
      dependencyClosureHash: closure.closureHash,
    }))
    .sort(compareBy((entry) => `${entry.skillId}\u0000${entry.skillVersion}\u0000${entry.packageHash}`));

  const ownRequired = pkg.definition.requiredTools.map((requirement) => {
    const tool = resolveTool(env.toolCatalog, requirement.toolId, requirement.versionRange);
    if (tool.definition.effect !== requirement.requiredEffect) {
      throw new AuthoritySkillFabricErrorV1(
        "skill_tool_effect_mismatch",
        `Tool ${requirement.toolId} effect differs from the Skill requirement.`
      );
    }
    return {
      toolId: tool.definition.toolId,
      toolVersion: tool.definition.toolVersion,
      definitionHash: tool.definitionHash,
      executorBindingHash: tool.executorBinding.bindingHash,
      admission: "required" as const,
      declaredBySkillRef: ref,
      requiredEffect: requirement.requiredEffect,
      supportedClaimEffects: tool.definition.evidencePolicy.supportedClaimEffects,
      optionalAdmissionHash: null,
    };
  });
  const ownOptional = pkg.definition.optionalTools.flatMap((requirement) => {
    const matches = env.optionalToolAdmissions.filter(
      (admission) =>
        admission.skillRef === ref &&
        admission.toolId === requirement.toolId &&
        exactRangeMatches(requirement.versionRange, admission.toolVersion)
    );
    if (matches.length === 0) return [];
    if (matches.length !== 1) {
      throw new AuthoritySkillFabricErrorV1(
        "skill_optional_tool_admission_conflict",
        `Optional Tool ${requirement.toolId} has conflicting admissions.`
      );
    }
    const admitted = matches[0]!;
    const expectedAdmissionHash = hashCanonicalJsonV1({
      skillRef: admitted.skillRef,
      toolId: admitted.toolId,
      toolVersion: admitted.toolVersion,
    });
    if (admitted.admissionHash !== expectedAdmissionHash) {
      throw new AuthoritySkillFabricErrorV1(
        "skill_optional_tool_admission_drift",
        `Optional Tool ${requirement.toolId} admission hash differs.`
      );
    }
    const tool = resolveTool(env.toolCatalog, admitted.toolId, admitted.toolVersion);
    return [{
      toolId: tool.definition.toolId,
      toolVersion: tool.definition.toolVersion,
      definitionHash: tool.definitionHash,
      executorBindingHash: tool.executorBinding.bindingHash,
      admission: "optional_admitted" as const,
      declaredBySkillRef: ref,
      requiredEffect: tool.definition.effect,
      supportedClaimEffects: tool.definition.evidencePolicy.supportedClaimEffects,
      optionalAdmissionHash: requiredHashV1(
        admitted.admissionHash,
        "optionalToolAdmission.admissionHash"
      ),
    }];
  });
  const dependencyTools = dependencyBuilds.flatMap(({ closure }) => closure.tools);
  const tools = [...dependencyTools, ...ownRequired, ...ownOptional].sort(
    compareBy((entry) => `${entry.toolId}\u0000${entry.toolVersion}\u0000${entry.declaredBySkillRef}`)
  );
  const toolIdentityById = new Map<string, string>();
  for (const tool of tools) {
    const identity = `${tool.toolVersion}\u0000${tool.definitionHash}\u0000${tool.executorBindingHash}\u0000${tool.requiredEffect}`;
    const current = toolIdentityById.get(tool.toolId);
    if (current && current !== identity) {
      throw new AuthoritySkillFabricErrorV1(
        "skill_closure_tool_conflict",
        `Tool ${tool.toolId} resolves to conflicting exact identities.`
      );
    }
    toolIdentityById.set(tool.toolId, identity);
  }
  const toolByExactBinding = new Map<string, (typeof tools)[number]>();
  for (const tool of tools) {
    const key = `${tool.toolId}\u0000${tool.toolVersion}\u0000${tool.definitionHash}\u0000${tool.executorBindingHash}\u0000${tool.requiredEffect}`;
    const current = toolByExactBinding.get(key);
    if (
      !current ||
      (current.admission === "optional_admitted" && tool.admission === "required") ||
      (current.admission === tool.admission &&
        compareCodeUnitV1(tool.declaredBySkillRef, current.declaredBySkillRef) < 0)
    ) {
      toolByExactBinding.set(key, tool);
    }
  }
  const dedupedTools = [...toolByExactBinding.values()].sort(
    compareBy(
      (entry) =>
        `${entry.toolId}\u0000${entry.toolVersion}\u0000${entry.declaredBySkillRef}`
    )
  );
  const ownUx = pkg.definition.requiredUxContracts.map((requirement) =>
    resolveUx(env.uxContracts, requirement.contractId, requirement.versionRange)
  );
  const uxContracts = [...dependencyBuilds.flatMap(({ closure }) => closure.uxContracts), ...ownUx]
    .sort(compareBy((entry) => `${entry.contractId}\u0000${entry.contractVersion}`));
  const uxById = new Map<string, string>();
  for (const contract of uxContracts) {
    const identity = `${contract.contractVersion}\u0000${contract.contractHash}`;
    const current = uxById.get(contract.contractId);
    if (current && current !== identity) {
      throw new AuthoritySkillFabricErrorV1(
        "skill_closure_ux_conflict",
        `UX contract ${contract.contractId} resolves to conflicting identities.`
      );
    }
    uxById.set(contract.contractId, identity);
  }
  const dedupedUx = [...new Map(uxContracts.map((contract) => [
    `${contract.contractId}\u0000${contract.contractVersion}\u0000${contract.contractHash}`,
    contract,
  ])).values()];
  const promptResourceHashes = decodeCanonicalStringSetV1(
    [...new Set([
      ...dependencyBuilds.flatMap(({ closure }) => closure.promptResourceHashes),
      ...pkg.promptResourceHashes,
    ])],
    "resolvedSkillClosure.promptResourceHashes",
    { allowEmpty: true, kind: "hash" }
  );
  const claimPolicyIdentities = [
    ...new Map(
      env.toolCatalog.tools
        .flatMap((tool) => tool.resolvedPolicyIdentities)
        .filter(
          (policy) =>
            policy.policyKind === "claim" &&
            policy.policyId === pkg.definition.evidencePolicy.claimPolicyId
        )
        .map((policy) => [
          `${policy.policyId}\u0000${policy.policyVersion}\u0000${policy.implementationHash}`,
          policy,
        ])
    ).values(),
  ];
  if (claimPolicyIdentities.length !== 1) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_claim_policy_unresolved",
      "Skill claim policy must resolve to exactly one frozen Policy identity."
    );
  }
  const claimPolicyHash = hashCanonicalJsonV1(claimPolicyIdentities[0]);
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.resolvedSkillClosure,
    packageId: pkg.packageId,
    packageVersion: pkg.packageVersion,
    packageHash: pkg.packageHash,
    skillId: pkg.definition.skillId,
    skillVersion: pkg.definition.skillVersion,
    skillDefinitionHash: pkg.definitionHash,
    dependencies,
    tools: dedupedTools,
    uxContracts: dedupedUx,
    promptResourceHashes,
    requiredReceiptEffects: pkg.definition.evidencePolicy.requiredReceiptEffects,
    rubricHash: pkg.rubricHash,
    claimPolicyHash,
  } as const;
  const closure = { ...material, closureHash: hashCanonicalJsonV1(material) };
  all.set(closure.closureHash, closure);
  return { closure, all };
};

const createUnavailable = (input: Readonly<{
  env: ResolveEnvironment;
  turnId: string;
  attemptId: string;
  requested: SkillResolutionRequestV1["requestedSkills"][number];
  reasonCode: string;
  missingCapabilities?: readonly string[];
  dependencyPath?: readonly string[];
  blockingScope: CapabilityUnavailableV1["blockingScope"];
  createdAt: string;
}>): CapabilityUnavailableV1 => {
  const template = {
    id: "skill-capability-unavailable",
    version: "1.0.0",
    text: "当前 Skill 或页面能力尚不可用，请等待升级、联系技术负责人或授予所需权限。",
  } as const;
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.capabilityUnavailable,
    kind: "skill_unavailable" as const,
    runId: input.env.request.runId,
    turnId: requiredIdV1(input.turnId, "unavailable.turnId"),
    actorCallId: null,
    attemptId: requiredIdV1(input.attemptId, "unavailable.attemptId"),
    requestedId: input.requested.skillId,
    requestedVersion: input.requested.exactVersion,
    requestedPackageHash: input.requested.packageHash,
    requestedEffect: "skill_activation",
    reasonCode: requiredIdV1(input.reasonCode, "unavailable.reasonCode"),
    retryable: false,
    missingCapabilities: decodeCanonicalStringSetV1(
      input.missingCapabilities ?? [],
      "unavailable.missingCapabilities",
      { allowEmpty: true }
    ),
    dependencyPath: (() => {
      const path = (input.dependencyPath ?? []).map((entry, index) =>
        requiredStringV1(entry, `unavailable.dependencyPath[${index}]`, 320)
      );
      if (path.length > 16 || new Set(path).size !== path.length) {
        throw new AuthoritySkillFabricErrorV1(
          "unavailable_dependency_path_invalid",
          "Unavailable dependency path must be ordered, unique, and bounded."
        );
      }
      return path;
    })(),
    blockingScope: input.blockingScope,
    toolCatalogHash: input.env.toolCatalog.catalogHash,
    skillCatalogHash: input.env.skillCatalog.catalogHash,
    uxCapabilitySnapshotHash: input.env.request.capabilitySnapshotHash,
    aclSnapshotHash: input.env.request.aclSnapshotHash,
    catalogFingerprint: hashCanonicalJsonV1({
      toolCatalogHash: input.env.toolCatalog.catalogHash,
      skillCatalogHash: input.env.skillCatalog.catalogHash,
      uxContractFingerprint: input.env.request.uxContractFingerprint,
      capabilitySnapshotHash: input.env.request.capabilitySnapshotHash,
      aclSnapshotHash: input.env.request.aclSnapshotHash,
    }),
    canonicalDeliveryTemplateId: template.id,
    canonicalDeliveryTemplateVersion: template.version,
    canonicalDeliveryTemplateHash: hashCanonicalJsonV1(template),
    userAction: "contact_owner" as const,
    evidenceRefs: [] as string[],
    createdAt: requiredTimestampV1(input.createdAt, "unavailable.createdAt"),
  } as const;
  return { ...material, factHash: hashCanonicalJsonV1(material) };
};

const closureConflict = (closures: readonly ResolvedSkillClosureV1[]) => {
  const tools = new Map<string, string>();
  const ux = new Map<string, string>();
  for (const closure of closures) {
    for (const tool of closure.tools) {
      const identity = `${tool.toolVersion}\u0000${tool.definitionHash}\u0000${tool.executorBindingHash}\u0000${tool.requiredEffect}`;
      const current = tools.get(tool.toolId);
      if (current && current !== identity) return "conflicting_tool_identity";
      tools.set(tool.toolId, identity);
    }
    for (const contract of closure.uxContracts) {
      const identity = `${contract.contractVersion}\u0000${contract.contractHash}`;
      const current = ux.get(contract.contractId);
      if (current && current !== identity) return "conflicting_ux_contract_identity";
      ux.set(contract.contractId, identity);
    }
  }
  return null;
};

const normalizeResolvedUxContracts = (
  input: readonly ResolvedUxContractV1[]
) => {
  const contracts = input
    .map((entry, index) => {
      const path = `resolvedUxContracts[${index}]`;
      const record = strictRecordShapeV1(
        entry,
        ["contractId", "contractVersion", "contractHash"],
        [],
        path
      );
      return {
        contractId: requiredIdV1(record.contractId, `${path}.contractId`),
        contractVersion: requiredVersionV1(
          record.contractVersion,
          `${path}.contractVersion`
        ),
        contractHash: requiredHashV1(record.contractHash, `${path}.contractHash`),
      };
    })
    .sort(compareBy((entry) => `${entry.contractId}\u0000${entry.contractVersion}`));
  if (
    new Set(contracts.map((entry) => `${entry.contractId}\u0000${entry.contractVersion}`))
      .size !== contracts.length
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "resolved_ux_contract_identity_conflict",
      "Resolved UX contract identities must be unique."
    );
  }
  return contracts;
};

export const hashResolvedUxContractSetV1 = (
  input: readonly ResolvedUxContractV1[]
) => hashCanonicalJsonV1({ contracts: normalizeResolvedUxContracts(input) });

export const hashAvailableCapabilitySetV1 = (input: readonly string[]) =>
  hashCanonicalJsonV1({
    capabilities: decodeCanonicalStringSetV1(
      input,
      "availableCapabilities",
      { allowEmpty: true }
    ),
  });

const normalizeOptionalToolAdmissions = (
  input: readonly OptionalToolAdmissionV1[]
) => {
  const admissions = input
    .map((entry, index) => {
      const path = `optionalToolAdmissions[${index}]`;
      const record = strictRecordShapeV1(
        entry,
        ["skillRef", "toolId", "toolVersion", "admissionHash"],
        [],
        path
      );
      const material = {
        skillRef: requiredStringV1(record.skillRef, `${path}.skillRef`, 320),
        toolId: requiredIdV1(record.toolId, `${path}.toolId`),
        toolVersion: requiredVersionV1(record.toolVersion, `${path}.toolVersion`),
      };
      const admissionHash = requiredHashV1(
        record.admissionHash,
        `${path}.admissionHash`
      );
      if (admissionHash !== hashCanonicalJsonV1(material)) {
        throw new AuthoritySkillFabricErrorV1(
          "optional_tool_admission_hash_drift",
          "Optional Tool admission hash differs."
        );
      }
      return { ...material, admissionHash };
    })
    .sort(compareBy((entry) => `${entry.skillRef}\u0000${entry.toolId}\u0000${entry.toolVersion}`));
  if (
    new Set(
      admissions.map(
        (entry) => `${entry.skillRef}\u0000${entry.toolId}\u0000${entry.toolVersion}`
      )
    ).size !== admissions.length
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "optional_tool_admission_identity_conflict",
      "Optional Tool admissions must be unique."
    );
  }
  return admissions;
};

export const resolveSkillResolutionPlanV1 = (input: Readonly<{
  request: SkillResolutionRequestV1;
  skillCatalog: SkillCatalogV1;
  toolCatalog: CompiledToolCatalogV1;
  uxContracts: readonly ResolvedUxContractV1[];
  availableCapabilities: readonly string[];
  optionalToolAdmissions?: readonly OptionalToolAdmissionV1[];
  conflictRegistry: SkillConflictRegistrySnapshotV1;
  turnId: string;
  attemptId: string;
  createdAt: string;
}>): SkillResolutionPlanV1 => {
  const request = decodeSkillResolutionRequestV1(input.request);
  const skillCatalog = decodeSkillCatalogV1(input.skillCatalog);
  const toolCatalog = decodeCompiledToolCatalogV1(input.toolCatalog);
  const uxContracts = normalizeResolvedUxContracts(input.uxContracts);
  const availableCapabilities = decodeCanonicalStringSetV1(
    input.availableCapabilities,
    "availableCapabilities",
    { allowEmpty: true }
  );
  const optionalToolAdmissions = normalizeOptionalToolAdmissions(
    input.optionalToolAdmissions ?? []
  );
  const conflictRegistry = decodeSkillConflictRegistrySnapshotV1(
    input.conflictRegistry
  );
  if (
    request.skillCatalogHash !== skillCatalog.catalogHash ||
    request.toolCatalogHash !== toolCatalog.catalogHash ||
    request.uxContractFingerprint !== hashResolvedUxContractSetV1(uxContracts) ||
    request.capabilitySnapshotHash !==
      hashAvailableCapabilitySetV1(availableCapabilities) ||
    request.conflictRegistrySnapshotHash !== conflictRegistry.snapshotHash
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_catalog_drift",
      "Resolution request catalog hashes differ from the exact catalogs."
    );
  }
  const env: ResolveEnvironment = {
    request,
    skillCatalog,
    toolCatalog,
    uxContracts,
    availableCapabilities: new Set(availableCapabilities),
    optionalToolAdmissions,
  };
  const availableRoots: Array<{
    requested: SkillResolutionRequestV1["requestedSkills"][number];
    build: ClosureBuild;
  }> = [];
  const unavailable: CapabilityUnavailableV1[] = [];
  for (const requested of request.requestedSkills) {
    try {
      const pkg = resolvePackage(
        skillCatalog,
        requested.skillId,
        requested.exactVersion,
        requested.packageHash
      );
      availableRoots.push({
        requested,
        build: buildClosure(pkg, env, [], 0, pkg.definition.budgets.maxNestedSkillDepth),
      });
    } catch (error) {
      const code =
        error instanceof AuthoritySkillFabricErrorV1
          ? error.code
          : "skill_resolution_failed";
      unavailable.push(
        createUnavailable({
          env,
          turnId: input.turnId,
          attemptId: input.attemptId,
          requested,
          reasonCode: code,
          missingCapabilities:
            error instanceof AuthoritySkillFabricErrorV1
              ? error.details.missingCapabilities
              : undefined,
          dependencyPath:
            error instanceof AuthoritySkillFabricErrorV1
              ? error.details.dependencyPath
              : undefined,
          blockingScope: "single_skill",
          createdAt: input.createdAt,
        })
      );
    }
  }
  const allClosures = [
    ...new Map(
      availableRoots.flatMap(({ build }) => [...build.all.entries()])
    ).values(),
  ];
  const resolvedRefs = new Set(
    allClosures.map((closure) => skillRef(closure))
  );
  const registryConflict = conflictRegistry.conflicts.find(
    (conflict) =>
      resolvedRefs.has(conflict.leftSkillRef) &&
      resolvedRefs.has(conflict.rightSkillRef)
  );
  const structuralConflict = closureConflict(allClosures);
  if (registryConflict || structuralConflict) {
    const reasonCode = registryConflict?.reasonCode ?? structuralConflict!;
    for (const { requested } of availableRoots) {
      unavailable.push(
        createUnavailable({
          env,
          turnId: input.turnId,
          attemptId: input.attemptId,
          requested,
          reasonCode,
          blockingScope: "conflicting_set",
          createdAt: input.createdAt,
        })
      );
    }
    availableRoots.length = 0;
    allClosures.length = 0;
  }
  const rootSource = new Map(
    availableRoots.map(({ requested, build }) => [build.closure.closureHash, requested.source])
  );
  const dependencyHashes = new Set(
    allClosures.flatMap((closure) => closure.dependencies.map((dependency) => dependency.dependencyClosureHash))
  );
  const sourceRank = (closure: ResolvedSkillClosureV1) =>
    rootSource.get(closure.closureHash) === "user_explicit"
        ? 0
        : dependencyHashes.has(closure.closureHash)
          ? 1
          : 2;
  const orderedClosures = [...allClosures].sort((left, right) => {
    const rank = sourceRank(left) - sourceRank(right);
    return rank || compareCodeUnitV1(skillRef(left), skillRef(right));
  });
  const requestedSkills = [
    ...availableRoots.map(({ requested }) => requested),
    ...orderedClosures
      .filter(
        (closure) =>
          dependencyHashes.has(closure.closureHash) &&
          !rootSource.has(closure.closureHash)
      )
      .map((closure) => ({
        source: "dependency" as const,
        skillId: closure.skillId,
        exactVersion: closure.skillVersion,
        packageHash: closure.packageHash,
      })),
  ].sort((left, right) => {
    const rank = { user_explicit: 0, dependency: 1, actor_selected: 2 } as const;
    return rank[left.source] - rank[right.source] || compareCodeUnitV1(
      `${left.skillId}\u0000${left.exactVersion}\u0000${left.packageHash}`,
      `${right.skillId}\u0000${right.exactVersion}\u0000${right.packageHash}`
    );
  });
  const resolutionRequestHash = hashCanonicalJsonV1(request);
  const closureBudgetReservations = orderedClosures.map((closure) => {
    const pkg = resolvePackage(
      skillCatalog,
      closure.skillId,
      closure.skillVersion,
      closure.packageHash
    );
    const budget = {
      resolvedClosureHash: closure.closureHash,
      maxToolCalls: pkg.definition.budgets.maxToolCalls,
      maxContextBytes: pkg.definition.budgets.maxContextBytes,
      maxWallTimeMs: pkg.definition.budgets.maxWallTimeMs,
    };
    return { ...budget, reservationHash: hashCanonicalJsonV1({ resolutionRequestHash, ...budget }) };
  });
  const budgetReservationHash = hashCanonicalJsonV1(closureBudgetReservations);
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionPlan,
    runId: request.runId,
    requestId: request.requestId,
    resolutionRequestHash,
    kernelPrincipalBindingRef: request.kernelPrincipalBindingRef,
    toolCatalogHash: request.toolCatalogHash,
    skillCatalogHash: request.skillCatalogHash,
    uxCapabilitySnapshotHash: request.capabilitySnapshotHash,
    aclSnapshotHash: request.aclSnapshotHash,
    conflictRegistrySnapshotHash: conflictRegistry.snapshotHash,
    requestedSkills,
    orderedClosures,
    unavailable: [...unavailable].sort(compareBy((entry) => entry.factHash)),
    conflictPolicy: FORMAL_R3_AUTHORITY_FABRIC_V1.conflictPolicy,
    budgetReservationHash,
    closureBudgetReservations,
  } as const;
  return { ...material, planHash: hashCanonicalJsonV1(material) };
};

export const decodeResolvedSkillClosureV1 = (
  value: unknown,
  path = "resolvedSkillClosure"
): ResolvedSkillClosureV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "packageId",
      "packageVersion",
      "packageHash",
      "skillId",
      "skillVersion",
      "skillDefinitionHash",
      "dependencies",
      "tools",
      "uxContracts",
      "promptResourceHashes",
      "requiredReceiptEffects",
      "rubricHash",
      "claimPolicyHash",
      "closureHash",
    ],
    [],
    path
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.resolvedSkillClosure ||
    !Array.isArray(record.dependencies) ||
    !Array.isArray(record.tools) ||
    !Array.isArray(record.uxContracts) ||
    !Array.isArray(record.promptResourceHashes)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "resolved_skill_closure_contract_mismatch",
      "Resolved Skill Closure contract differs."
    );
  }
  const dependencies = record.dependencies.map((entry, index) => {
    const entryPath = `${path}.dependencies[${index}]`;
    const item = strictRecordShapeV1(
      entry,
      [
        "packageId",
        "packageVersion",
        "packageHash",
        "skillId",
        "skillVersion",
        "skillDefinitionHash",
        "dependencyClosureHash",
      ],
      [],
      entryPath
    );
    return {
      packageId: requiredIdV1(item.packageId, `${entryPath}.packageId`),
      packageVersion: requiredVersionV1(item.packageVersion, `${entryPath}.packageVersion`),
      packageHash: requiredHashV1(item.packageHash, `${entryPath}.packageHash`),
      skillId: requiredIdV1(item.skillId, `${entryPath}.skillId`),
      skillVersion: requiredVersionV1(item.skillVersion, `${entryPath}.skillVersion`),
      skillDefinitionHash: requiredHashV1(item.skillDefinitionHash, `${entryPath}.skillDefinitionHash`),
      dependencyClosureHash: requiredHashV1(item.dependencyClosureHash, `${entryPath}.dependencyClosureHash`),
    };
  });
  assertCanonicalArrayV1(
    dependencies,
    (entry) => `${entry.skillId}\u0000${entry.skillVersion}\u0000${entry.packageHash}`,
    `${path}.dependencies`
  );
  const tools = record.tools.map((entry, index) => {
    const entryPath = `${path}.tools[${index}]`;
    const item = strictRecordShapeV1(
      entry,
      [
        "toolId",
        "toolVersion",
        "definitionHash",
        "executorBindingHash",
        "admission",
        "declaredBySkillRef",
        "requiredEffect",
        "supportedClaimEffects",
        "optionalAdmissionHash",
      ],
      [],
      entryPath
    );
    const admission = requiredEnumV1(
      item.admission,
      ["required", "optional_admitted"] as const,
      `${entryPath}.admission`
    );
    const optionalAdmissionHash =
      item.optionalAdmissionHash === null
        ? null
        : requiredHashV1(item.optionalAdmissionHash, `${entryPath}.optionalAdmissionHash`);
    if (
      (admission === "required" && optionalAdmissionHash !== null) ||
      (admission === "optional_admitted" && optionalAdmissionHash === null)
    ) {
      throw new AuthoritySkillFabricErrorV1(
        "resolved_skill_tool_admission_mismatch",
        "Resolved Skill Tool admission and optional admission hash differ."
      );
    }
    return {
      toolId: requiredIdV1(item.toolId, `${entryPath}.toolId`),
      toolVersion: requiredVersionV1(item.toolVersion, `${entryPath}.toolVersion`),
      definitionHash: requiredHashV1(item.definitionHash, `${entryPath}.definitionHash`),
      executorBindingHash: requiredHashV1(item.executorBindingHash, `${entryPath}.executorBindingHash`),
      admission,
      declaredBySkillRef: requiredStringV1(item.declaredBySkillRef, `${entryPath}.declaredBySkillRef`, 320),
      requiredEffect: requiredEnumV1(
        item.requiredEffect,
        ["private_read", "presentation_state", "durable_write", "external_write"] as const,
        `${entryPath}.requiredEffect`
      ),
      supportedClaimEffects: decodeCanonicalStringSetV1(
        item.supportedClaimEffects,
        `${entryPath}.supportedClaimEffects`,
        { allowEmpty: true, requireCanonical: true }
      ),
      optionalAdmissionHash,
    };
  });
  assertCanonicalArrayV1(
    tools,
    (entry) => `${entry.toolId}\u0000${entry.toolVersion}\u0000${entry.declaredBySkillRef}`,
    `${path}.tools`
  );
  const uxContracts = normalizeResolvedUxContracts(
    record.uxContracts as ResolvedUxContractV1[]
  );
  if (hashCanonicalJsonV1(record.uxContracts) !== hashCanonicalJsonV1(uxContracts)) {
    throw new AuthoritySkillFabricErrorV1(
      "resolved_skill_ux_order_drift",
      "Resolved Skill UX contracts are not canonical."
    );
  }
  const promptResourceHashes = decodeCanonicalStringSetV1(
    record.promptResourceHashes,
    `${path}.promptResourceHashes`,
    { allowEmpty: true, kind: "hash", requireCanonical: true }
  );
  const requiredReceiptEffects = decodeCanonicalStringSetV1(
    record.requiredReceiptEffects,
    `${path}.requiredReceiptEffects`,
    { allowEmpty: true, requireCanonical: true }
  );
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.resolvedSkillClosure,
    packageId: requiredIdV1(record.packageId, `${path}.packageId`),
    packageVersion: requiredVersionV1(record.packageVersion, `${path}.packageVersion`),
    packageHash: requiredHashV1(record.packageHash, `${path}.packageHash`),
    skillId: requiredIdV1(record.skillId, `${path}.skillId`),
    skillVersion: requiredVersionV1(record.skillVersion, `${path}.skillVersion`),
    skillDefinitionHash: requiredHashV1(record.skillDefinitionHash, `${path}.skillDefinitionHash`),
    dependencies,
    tools,
    uxContracts,
    promptResourceHashes,
    requiredReceiptEffects,
    rubricHash: requiredHashV1(record.rubricHash, `${path}.rubricHash`),
    claimPolicyHash: requiredHashV1(
      record.claimPolicyHash,
      `${path}.claimPolicyHash`
    ),
  } as const;
  const closureHash = requiredHashV1(record.closureHash, `${path}.closureHash`);
  if (closureHash !== hashCanonicalJsonV1(material)) {
    throw new AuthoritySkillFabricErrorV1(
      "resolved_skill_closure_hash_drift",
      "Resolved Skill Closure hash differs."
    );
  }
  return { ...material, closureHash };
};

export const decodeCapabilityUnavailableV1 = (
  value: unknown,
  path = "capabilityUnavailable"
): CapabilityUnavailableV1 => {
  const keys = [
    "contractVersion",
    "kind",
    "runId",
    "turnId",
    "actorCallId",
    "attemptId",
    "requestedId",
    "requestedVersion",
    "requestedPackageHash",
    "requestedEffect",
    "reasonCode",
    "retryable",
    "missingCapabilities",
    "dependencyPath",
    "blockingScope",
    "toolCatalogHash",
    "skillCatalogHash",
    "uxCapabilitySnapshotHash",
    "aclSnapshotHash",
    "catalogFingerprint",
    "canonicalDeliveryTemplateId",
    "canonicalDeliveryTemplateVersion",
    "canonicalDeliveryTemplateHash",
    "userAction",
    "evidenceRefs",
    "createdAt",
    "factHash",
  ] as const;
  const record = strictRecordShapeV1(value, keys, [], path);
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.capabilityUnavailable ||
    !Array.isArray(record.missingCapabilities) ||
    !Array.isArray(record.dependencyPath) ||
    !Array.isArray(record.evidenceRefs)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "capability_unavailable_contract_mismatch",
      "Capability Unavailable contract differs."
    );
  }
  const dependencyPath = record.dependencyPath.map((entry, index) =>
    requiredStringV1(entry, `${path}.dependencyPath[${index}]`, 320)
  );
  if (dependencyPath.length > 16 || new Set(dependencyPath).size !== dependencyPath.length) {
    throw new AuthoritySkillFabricErrorV1(
      "capability_unavailable_dependency_path_invalid",
      "Capability Unavailable dependency path is invalid."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.capabilityUnavailable,
    kind: requiredEnumV1(
      record.kind,
      ["capability_unavailable", "skill_unavailable"] as const,
      `${path}.kind`
    ),
    runId: requiredIdV1(record.runId, `${path}.runId`),
    turnId: requiredIdV1(record.turnId, `${path}.turnId`),
    actorCallId:
      record.actorCallId === null
        ? null
        : requiredIdV1(record.actorCallId, `${path}.actorCallId`),
    attemptId: requiredIdV1(record.attemptId, `${path}.attemptId`),
    requestedId: requiredIdV1(record.requestedId, `${path}.requestedId`),
    requestedVersion: requiredVersionV1(record.requestedVersion, `${path}.requestedVersion`),
    requestedPackageHash:
      record.requestedPackageHash === null
        ? null
        : requiredHashV1(record.requestedPackageHash, `${path}.requestedPackageHash`),
    requestedEffect: requiredIdV1(record.requestedEffect, `${path}.requestedEffect`),
    reasonCode: requiredIdV1(record.reasonCode, `${path}.reasonCode`),
    retryable: requiredBooleanV1(record.retryable, `${path}.retryable`),
    missingCapabilities: decodeCanonicalStringSetV1(
      record.missingCapabilities,
      `${path}.missingCapabilities`,
      { allowEmpty: true, requireCanonical: true }
    ),
    dependencyPath,
    blockingScope: requiredEnumV1(
      record.blockingScope,
      ["single_skill", "conflicting_set", "entire_run"] as const,
      `${path}.blockingScope`
    ),
    toolCatalogHash: requiredHashV1(record.toolCatalogHash, `${path}.toolCatalogHash`),
    skillCatalogHash: requiredHashV1(record.skillCatalogHash, `${path}.skillCatalogHash`),
    uxCapabilitySnapshotHash: requiredHashV1(record.uxCapabilitySnapshotHash, `${path}.uxCapabilitySnapshotHash`),
    aclSnapshotHash: requiredHashV1(record.aclSnapshotHash, `${path}.aclSnapshotHash`),
    catalogFingerprint: requiredHashV1(record.catalogFingerprint, `${path}.catalogFingerprint`),
    canonicalDeliveryTemplateId: requiredIdV1(record.canonicalDeliveryTemplateId, `${path}.canonicalDeliveryTemplateId`),
    canonicalDeliveryTemplateVersion: requiredVersionV1(record.canonicalDeliveryTemplateVersion, `${path}.canonicalDeliveryTemplateVersion`),
    canonicalDeliveryTemplateHash: requiredHashV1(record.canonicalDeliveryTemplateHash, `${path}.canonicalDeliveryTemplateHash`),
    userAction: requiredEnumV1(
      record.userAction,
      ["wait_for_upgrade", "contact_owner", "grant_permission"] as const,
      `${path}.userAction`
    ),
    evidenceRefs: decodeCanonicalStringSetV1(
      record.evidenceRefs,
      `${path}.evidenceRefs`,
      { allowEmpty: true, kind: "string", requireCanonical: true }
    ),
    createdAt: requiredTimestampV1(record.createdAt, `${path}.createdAt`),
  } as const;
  const factHash = requiredHashV1(record.factHash, `${path}.factHash`);
  if (factHash !== hashCanonicalJsonV1(material)) {
    throw new AuthoritySkillFabricErrorV1(
      "capability_unavailable_hash_drift",
      "Capability Unavailable fact hash differs."
    );
  }
  return { ...material, factHash };
};

export const decodeSkillResolutionPlanV1 = (
  value: unknown
): SkillResolutionPlanV1 => {
  const record = strictRecordShapeV1(
    value,
    [
      "contractVersion",
      "runId",
      "requestId",
      "resolutionRequestHash",
      "kernelPrincipalBindingRef",
      "toolCatalogHash",
      "skillCatalogHash",
      "uxCapabilitySnapshotHash",
      "aclSnapshotHash",
      "conflictRegistrySnapshotHash",
      "requestedSkills",
      "orderedClosures",
      "unavailable",
      "conflictPolicy",
      "budgetReservationHash",
      "closureBudgetReservations",
      "planHash",
    ],
    [],
    "skillResolutionPlan"
  );
  if (
    record.contractVersion !== FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionPlan ||
    !Array.isArray(record.requestedSkills) ||
    !Array.isArray(record.orderedClosures) ||
    !Array.isArray(record.unavailable) ||
    !Array.isArray(record.closureBudgetReservations)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_contract_mismatch",
      "Skill Resolution Plan contract differs."
    );
  }
  const requestedSkills = record.requestedSkills.map((entry, index) => {
    const path = `skillResolutionPlan.requestedSkills[${index}]`;
    const item = strictRecordShapeV1(
      entry,
      ["source", "skillId", "exactVersion", "packageHash"],
      [],
      path
    );
    return {
      source: requiredEnumV1(
        item.source,
        ["user_explicit", "dependency", "actor_selected"] as const,
        `${path}.source`
      ),
      skillId: requiredIdV1(item.skillId, `${path}.skillId`),
      exactVersion: requiredVersionV1(item.exactVersion, `${path}.exactVersion`),
      packageHash: requiredHashV1(item.packageHash, `${path}.packageHash`),
    };
  });
  const requestedRank = { user_explicit: 0, dependency: 1, actor_selected: 2 } as const;
  const sortedRequested = [...requestedSkills].sort((left, right) =>
    requestedRank[left.source] - requestedRank[right.source] ||
    compareCodeUnitV1(
      `${left.skillId}\u0000${left.exactVersion}\u0000${left.packageHash}`,
      `${right.skillId}\u0000${right.exactVersion}\u0000${right.packageHash}`
    )
  );
  if (
    hashCanonicalJsonV1(requestedSkills) !== hashCanonicalJsonV1(sortedRequested) ||
    new Set(requestedSkills.map((entry) => `${entry.skillId}\u0000${entry.exactVersion}`)).size !== requestedSkills.length
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_requested_order_drift",
      "Skill Resolution Plan requested Skills are not canonical or unique."
    );
  }
  const orderedClosures = record.orderedClosures.map((entry, index) =>
    decodeResolvedSkillClosureV1(entry, `skillResolutionPlan.orderedClosures[${index}]`)
  );
  if (new Set(orderedClosures.map((entry) => entry.closureHash)).size !== orderedClosures.length) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_closure_duplicate",
      "Skill Resolution Plan closures must be unique."
    );
  }
  const closureHashes = new Set(orderedClosures.map((entry) => entry.closureHash));
  const rootSourceBySkillRef = new Map(
    requestedSkills
      .filter((entry) => entry.source !== "dependency")
      .map((entry) => [
        skillRef({
          skillId: entry.skillId,
          skillVersion: entry.exactVersion,
          packageHash: entry.packageHash,
        }),
        entry.source,
      ] as const)
  );
  const dependencyClosureHashes = new Set(
    orderedClosures.flatMap((closure) =>
      closure.dependencies.map(
        (dependency) => dependency.dependencyClosureHash
      )
    )
  );
  const canonicalClosures = [...orderedClosures].sort((left, right) => {
    const leftSource = rootSourceBySkillRef.get(skillRef(left));
    const rightSource = rootSourceBySkillRef.get(skillRef(right));
    const rank = (closure: ResolvedSkillClosureV1, source?: string) =>
      source === "user_explicit"
        ? 0
        : dependencyClosureHashes.has(closure.closureHash)
          ? 1
          : 2;
    return (
      rank(left, leftSource) - rank(right, rightSource) ||
      compareCodeUnitV1(skillRef(left), skillRef(right))
    );
  });
  if (
    hashCanonicalJsonV1(orderedClosures) !==
    hashCanonicalJsonV1(canonicalClosures)
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_closure_order_drift",
      "Skill Resolution Plan closures differ from the canonical source-ranked order."
    );
  }
  if (
    orderedClosures.some((closure) =>
      closure.dependencies.some(
        (dependency) => !closureHashes.has(dependency.dependencyClosureHash)
      )
    )
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_dependency_missing",
      "Skill Resolution Plan omits a dependency closure."
    );
  }
  const unavailable = record.unavailable.map((entry, index) =>
    decodeCapabilityUnavailableV1(entry, `skillResolutionPlan.unavailable[${index}]`)
  );
  assertCanonicalArrayV1(
    unavailable,
    (entry) => entry.factHash,
    "skillResolutionPlan.unavailable"
  );
  const resolutionRequestHash = requiredHashV1(
    record.resolutionRequestHash,
    "skillResolutionPlan.resolutionRequestHash"
  );
  const closureBudgetReservations = record.closureBudgetReservations.map(
    (entry, index) => {
      const path = `skillResolutionPlan.closureBudgetReservations[${index}]`;
      const item = strictRecordShapeV1(
        entry,
        [
          "resolvedClosureHash",
          "reservationHash",
          "maxToolCalls",
          "maxContextBytes",
          "maxWallTimeMs",
        ],
        [],
        path
      );
      const budget = {
        resolvedClosureHash: requiredHashV1(item.resolvedClosureHash, `${path}.resolvedClosureHash`),
        maxToolCalls: requiredSafeIntegerV1(item.maxToolCalls, `${path}.maxToolCalls`, 1, 1_000),
        maxContextBytes: requiredSafeIntegerV1(item.maxContextBytes, `${path}.maxContextBytes`, 1, 10_000_000),
        maxWallTimeMs: requiredSafeIntegerV1(item.maxWallTimeMs, `${path}.maxWallTimeMs`, 1, 3_600_000),
      };
      const reservationHash = requiredHashV1(item.reservationHash, `${path}.reservationHash`);
      if (reservationHash !== hashCanonicalJsonV1({ resolutionRequestHash, ...budget })) {
        throw new AuthoritySkillFabricErrorV1(
          "skill_resolution_plan_reservation_drift",
          "Skill Resolution Plan closure budget reservation differs."
        );
      }
      return { ...budget, reservationHash };
    }
  );
  if (
    closureBudgetReservations.length !== orderedClosures.length ||
    closureBudgetReservations.some(
      (entry, index) => entry.resolvedClosureHash !== orderedClosures[index]!.closureHash
    )
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_reservation_order_drift",
      "Skill Resolution Plan reservations must match ordered closures one-for-one."
    );
  }
  const budgetReservationHash = requiredHashV1(
    record.budgetReservationHash,
    "skillResolutionPlan.budgetReservationHash"
  );
  if (budgetReservationHash !== hashCanonicalJsonV1(closureBudgetReservations)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_budget_hash_drift",
      "Skill Resolution Plan budget reservation hash differs."
    );
  }
  const material = {
    contractVersion: FORMAL_R3_AUTHORITY_FABRIC_V1.skillResolutionPlan,
    runId: requiredIdV1(record.runId, "skillResolutionPlan.runId"),
    requestId: requiredIdV1(record.requestId, "skillResolutionPlan.requestId"),
    resolutionRequestHash,
    kernelPrincipalBindingRef: requiredIdV1(
      record.kernelPrincipalBindingRef,
      "skillResolutionPlan.kernelPrincipalBindingRef"
    ),
    toolCatalogHash: requiredHashV1(record.toolCatalogHash, "skillResolutionPlan.toolCatalogHash"),
    skillCatalogHash: requiredHashV1(record.skillCatalogHash, "skillResolutionPlan.skillCatalogHash"),
    uxCapabilitySnapshotHash: requiredHashV1(record.uxCapabilitySnapshotHash, "skillResolutionPlan.uxCapabilitySnapshotHash"),
    aclSnapshotHash: requiredHashV1(record.aclSnapshotHash, "skillResolutionPlan.aclSnapshotHash"),
    conflictRegistrySnapshotHash: requiredHashV1(
      record.conflictRegistrySnapshotHash,
      "skillResolutionPlan.conflictRegistrySnapshotHash"
    ),
    requestedSkills,
    orderedClosures,
    unavailable,
    conflictPolicy: requiredEnumV1(
      record.conflictPolicy,
      [FORMAL_R3_AUTHORITY_FABRIC_V1.conflictPolicy] as const,
      "skillResolutionPlan.conflictPolicy"
    ),
    budgetReservationHash,
    closureBudgetReservations,
  } as const;
  if (
    unavailable.some(
      (entry) =>
        entry.runId !== material.runId ||
        entry.toolCatalogHash !== material.toolCatalogHash ||
        entry.skillCatalogHash !== material.skillCatalogHash ||
        entry.uxCapabilitySnapshotHash !== material.uxCapabilitySnapshotHash ||
        entry.aclSnapshotHash !== material.aclSnapshotHash
    )
  ) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_unavailable_binding_drift",
      "Capability Unavailable facts differ from the Plan snapshots."
    );
  }
  const planHash = requiredHashV1(record.planHash, "skillResolutionPlan.planHash");
  if (planHash !== hashCanonicalJsonV1(material)) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_resolution_plan_hash_drift",
      "Skill Resolution Plan hash differs."
    );
  }
  return { ...material, planHash };
};

export const assertSkillInvocationWithinClosureV1 = (input: Readonly<{
  closure: ResolvedSkillClosureV1;
  toolId: string;
  toolVersion: string;
  definitionHash: string;
  executorBindingHash: string;
}>) => {
  const matches = input.closure.tools.filter(
    (tool) =>
      tool.toolId === input.toolId &&
      tool.toolVersion === input.toolVersion &&
      tool.definitionHash === input.definitionHash &&
      tool.executorBindingHash === input.executorBindingHash &&
      (tool.admission === "required" ||
        (tool.admission === "optional_admitted" && tool.optionalAdmissionHash !== null))
  );
  if (matches.length !== 1) {
    throw new AuthoritySkillFabricErrorV1(
      "skill_tool_outside_resolved_closure",
      "Skill Tool call is outside the exact required/admitted Tool closure."
    );
  }
  return matches[0]!;
};
