import type {
  AuthorityToolDefinitionV1,
  PolicyIdentityV1,
  TrustedExecutorFactoryEntryV1,
} from "./authority-fabric-contracts";
import {
  R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
} from "./authority-fabric-private-projection";
import {
  compileAuthorityToolCatalogV1,
  createPolicyRegistrySnapshotV1,
  createTrustedExecutorBindingV1,
  decodeAuthorityToolDefinitionV1,
} from "./authority-tool-compiler";
import {
  createInstalledAuthorityToolCatalogV1,
  createTestAuthorityToolCatalogRegistryV1,
} from "./authority-tool-catalog-registry";
import {
  GENERAL_RUNTIME_TOOL_DEFINITIONS_V1,
  GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1,
} from "./general-runtime-authority";
import {
  GENERAL_RUNTIME_INSTALLED_CATALOG_V1,
  H1_RUNTIME_INSTALLED_CATALOG_V1,
} from "./production-authority-tool-catalogs";
import {
  R2_SELECTION_C0_POLICY_REGISTRY_V1,
  R2_SELECTION_C0_TOOL_DEFINITION_V1,
} from "./r2-selection-c0-authority";
import { R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1 } from "./r2-selection-c0-contract";
import { R2_SELECTION_C0_V1 } from "./r2-selection-c0-profile";
import {
  RUN_TOOL_CATALOG_BINDING_V1,
  createCompiledCatalogBindingSeedV1,
} from "./run-tool-catalog-binding";
import { hashCanonicalJsonV1 } from "./strict-json";
import type { ToolDescriptorV1 } from "./tools";

export const R2_SELECTION_C0_B3_AUTHORITY_V1 = Object.freeze({
  catalogProfileId: R2_SELECTION_C0_V1.profileId,
  catalogEpoch: 2,
  runtimeAuthorityKind: "r2-selection-runtime-admission-v1",
  reconciliationClass:
    "r2-selection-c0-persisted-receipt-reconciliation",
  checkpointClaim:
    "r2_atomic_acceptance_selection_epoch2_store_reservation_candidate_runtime_not_installed",
} as const);

const persistedReceiptPolicy: PolicyIdentityV1 = Object.freeze({
  policyKind: "reconciliation",
  policyId: R2_SELECTION_C0_B3_AUTHORITY_V1.reconciliationClass,
  policyVersion: "1.0.0",
  implementationHash: hashCanonicalJsonV1({
    implementation:
      R2_SELECTION_C0_B3_AUTHORITY_V1.reconciliationClass,
    version: "1.0.0",
    semantics:
      "exact_run_call_arguments_tuple_returns_only_an_existing_immutable_completed_receipt_never_recaptures_host_state",
  }),
});

export const R2_SELECTION_C0_B3_POLICY_REGISTRY_V1 =
  createPolicyRegistrySnapshotV1([
    ...R2_SELECTION_C0_POLICY_REGISTRY_V1.policies,
    persistedReceiptPolicy,
  ]);

export const R2_SELECTION_C0_B3_TOOL_DEFINITION_V1: AuthorityToolDefinitionV1 =
  decodeAuthorityToolDefinitionV1({
    ...structuredClone(R2_SELECTION_C0_TOOL_DEFINITION_V1),
    executionPolicy: {
      ...structuredClone(R2_SELECTION_C0_TOOL_DEFINITION_V1.executionPolicy),
      reconciliationClass:
        R2_SELECTION_C0_B3_AUTHORITY_V1.reconciliationClass,
    },
  });

export const R2_SELECTION_C0_B3_TRUSTED_FACTORY_ENTRY_V1: TrustedExecutorFactoryEntryV1 =
  Object.freeze({
    toolId: R2_SELECTION_C0_B3_TOOL_DEFINITION_V1.toolId,
    toolVersion: R2_SELECTION_C0_B3_TOOL_DEFINITION_V1.toolVersion,
    executorBrand:
      R2_SELECTION_C0_B3_TOOL_DEFINITION_V1.executionPolicy
        .requiredExecutorBrand,
    executorBuildRef: "repo:r2-selection-c0-b3-durable-executor-v1",
    executorArtifactHash: hashCanonicalJsonV1({
      implementation: "R2SelectionC0B3DurableExecutorV1",
      targetContractHash: R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1,
      sourceContractVersion: R2_SELECTION_C0_V1.sourceContractVersion,
      sourceCommit: R2_SELECTION_C0_V1.sourceCommit,
      selection: "zero_or_one_no_truncation",
      execution: "durable_single_call_fenced_receipt",
      reconciliation: "persisted_completed_receipt_only_no_recapture",
    }),
    adapterId: "r2-selection-c0-receipt-adapter",
    adapterVersion: "1.0.0",
    adapterArtifactHash:
      R2_SELECTION_C0_RECEIPT_ADAPTER_IMPLEMENTATION_HASH_V1,
    bridgeContractHash: hashCanonicalJsonV1({
      implementation: "formal-r3-r2-selection-c0-b3-authority-bridge",
      version: "1.0.0",
      boundary:
        "main_store_run_catalog_admission_snapshot_then_exact_acl_and_receipt_dispatch",
      targetContractHash: R2_SELECTION_C0_TARGET_CONTRACT_HASH_V1,
      productionRuntime: "deny_all",
    }),
  });

const definitions = [
  ...GENERAL_RUNTIME_TOOL_DEFINITIONS_V1,
  R2_SELECTION_C0_B3_TOOL_DEFINITION_V1,
] as const;
const factoryEntries = [
  ...GENERAL_RUNTIME_TRUSTED_FACTORY_ENTRIES_V1,
  R2_SELECTION_C0_B3_TRUSTED_FACTORY_ENTRY_V1,
] as const;
const trustedFactorySnapshotHash = hashCanonicalJsonV1({
  contractVersion: "formal-r3-r2-selection-c0-b3-trusted-factory-snapshot-v1",
  entries: factoryEntries,
});

export const R2_SELECTION_C0_B3_EXECUTOR_BINDINGS_V1 = Object.freeze(
  definitions.map((definition, index) =>
    createTrustedExecutorBindingV1({
      definition,
      policyRegistry: R2_SELECTION_C0_B3_POLICY_REGISTRY_V1,
      factoryEntry: factoryEntries[index]!,
      trustedFactorySnapshotHash,
    })
  )
);

export const R2_SELECTION_C0_B3_COMPILED_TOOL_CATALOG_V1 =
  compileAuthorityToolCatalogV1(
    R2_SELECTION_C0_B3_POLICY_REGISTRY_V1,
    definitions.map((definition, index) => ({
      enabled: true,
      definition,
      executorBinding: R2_SELECTION_C0_B3_EXECUTOR_BINDINGS_V1[index]!,
    }))
  );

const descriptorEffect = (
  definition: AuthorityToolDefinitionV1
): ToolDescriptorV1["effect"] =>
  definition.toolId === "inspect_ux_capability"
    ? "capability_read"
    : definition.effect === "presentation_state"
      ? "runtime_state"
      : "read_only";

export const R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1: readonly ToolDescriptorV1[] =
  Object.freeze(
    R2_SELECTION_C0_B3_COMPILED_TOOL_CATALOG_V1.tools.map((tool) => ({
      toolId: tool.modelDescriptor.toolId,
      version: tool.modelDescriptor.toolVersion,
      description: tool.modelDescriptor.description,
      inputSchema: structuredClone(tool.modelDescriptor.inputSchema),
      effect: descriptorEffect(tool.definition),
    }))
  );

export const R2_SELECTION_C0_B3_INSTALLED_CATALOG_V1 =
  createInstalledAuthorityToolCatalogV1({
    catalogProfileId: R2_SELECTION_C0_B3_AUTHORITY_V1.catalogProfileId,
    catalogEpoch: R2_SELECTION_C0_B3_AUTHORITY_V1.catalogEpoch,
    eventEnvelopeVersion: RUN_TOOL_CATALOG_BINDING_V1.eventEnvelopeVersion,
    compiledCatalog: R2_SELECTION_C0_B3_COMPILED_TOOL_CATALOG_V1,
    modelDescriptors: R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1,
  });

export const R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1 =
  createCompiledCatalogBindingSeedV1({
    catalogProfileId:
      R2_SELECTION_C0_B3_INSTALLED_CATALOG_V1.catalogProfileId,
    catalogEpoch: R2_SELECTION_C0_B3_INSTALLED_CATALOG_V1.catalogEpoch,
    compiledCatalog:
      R2_SELECTION_C0_B3_INSTALLED_CATALOG_V1.compiledCatalog,
    descriptors: R2_SELECTION_C0_B3_INSTALLED_CATALOG_V1.modelDescriptors,
  });

/** Development-only acceptance Registry. Production keeps only General/H1
 * until the explicit R2 Runtime mode and deny-all production gate land. */
export const R2_SELECTION_C0_B3_ACCEPTANCE_CATALOG_REGISTRY_V1 =
  createTestAuthorityToolCatalogRegistryV1([
    GENERAL_RUNTIME_INSTALLED_CATALOG_V1,
    H1_RUNTIME_INSTALLED_CATALOG_V1,
    R2_SELECTION_C0_B3_INSTALLED_CATALOG_V1,
  ]);
