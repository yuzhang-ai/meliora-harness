import { LANDING_PAGE_HARNESS_V1 } from "./contracts";
import {
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";
import type { CompiledToolCatalogV1 } from "./authority-fabric-contracts";
import { decodeCompiledToolCatalogV1 } from "./authority-tool-compiler";
import { requiredVersionV1 } from "./authority-fabric-codecs";

export const RUN_TOOL_CATALOG_BINDING_V1 = Object.freeze({
  contractVersion: "formal-r3-run-tool-catalog-binding-v1",
  storeVersion: "landing-page-conversation-store-state-v4",
  eventEnvelopeVersion: LANDING_PAGE_HARNESS_V1.event,
  directStoreFixtureProfileId: "store-direct-fixture-v1",
} as const);

export type RunToolCatalogBindingSeedV1 = Readonly<{
  catalogProfileId: string;
  catalogEpoch: number;
  catalogHash: string;
  toolDescriptorFingerprint: string;
  eventEnvelopeVersion: string;
}>;

export type RunToolCatalogBindingV1 = RunToolCatalogBindingSeedV1 &
  Readonly<{
    contractVersion: typeof RUN_TOOL_CATALOG_BINDING_V1.contractVersion;
    bindingId: string;
    runId: string;
    createdAt: string;
    bindingHash: string;
  }>;

export type StoreCatalogMigrationRecordV1 = Readonly<{
  contractVersion: "landing-page-conversation-store-catalog-migration-v1";
  migrationId: "conversation-store-pre-r1-to-v4";
  sourceVersion:
    | "landing-page-conversation-store-state-v1"
    | "landing-page-conversation-store-state-v2"
    | "landing-page-conversation-store-state-v3";
  targetVersion: typeof RUN_TOOL_CATALOG_BINDING_V1.storeVersion;
  sourcePayloadHash: string;
  migratedAt: string;
  migrationHash: string;
}>;

export class RunToolCatalogBindingErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "RunToolCatalogBindingErrorV1";
  }
}

const safe = <T>(operation: () => T, code: string, message: string): T => {
  try {
    return operation();
  } catch {
    throw new RunToolCatalogBindingErrorV1(code, message);
  }
};

const catalogEpochV1 = (value: unknown, path: string) => {
  if (!Number.isSafeInteger(value) || (value as number) < 1) {
    throw new RunToolCatalogBindingErrorV1(
      "run_tool_catalog_epoch_invalid",
      `${path} must be a positive safe integer.`
    );
  }
  return value as number;
};

export const decodeRunToolCatalogBindingSeedV1 = (
  value: unknown
): RunToolCatalogBindingSeedV1 => {
  const record = safe(
    () =>
      strictRecordV1(
        value,
        [
          "catalogProfileId",
          "catalogEpoch",
          "catalogHash",
          "toolDescriptorFingerprint",
          "eventEnvelopeVersion",
        ],
        "runToolCatalogBindingSeed"
      ),
    "run_tool_catalog_binding_seed_invalid",
    "Run Tool Catalog binding seed differs from the frozen contract."
  );
  return {
    catalogProfileId: safe(
      () => requiredIdV1(record.catalogProfileId, "catalogProfileId"),
      "run_tool_catalog_profile_invalid",
      "Run Tool Catalog profile is invalid."
    ),
    catalogEpoch: catalogEpochV1(record.catalogEpoch, "catalogEpoch"),
    catalogHash: safe(
      () => requiredHashV1(record.catalogHash, "catalogHash"),
      "run_tool_catalog_hash_invalid",
      "Run Tool Catalog hash is invalid."
    ),
    toolDescriptorFingerprint: safe(
      () =>
        requiredHashV1(
          record.toolDescriptorFingerprint,
          "toolDescriptorFingerprint"
        ),
      "run_tool_catalog_descriptor_fingerprint_invalid",
      "Run Tool Catalog descriptor fingerprint is invalid."
    ),
    eventEnvelopeVersion: safe(
      () =>
        requiredVersionV1(
          record.eventEnvelopeVersion,
          "eventEnvelopeVersion"
        ),
      "run_tool_catalog_event_envelope_invalid",
      "Run Tool Catalog event envelope version is invalid."
    ),
  };
};

export const createRunToolCatalogBindingV1 = (input: Readonly<{
  runId: string;
  seed: RunToolCatalogBindingSeedV1;
  createdAt: string;
}>): RunToolCatalogBindingV1 => {
  const runId = safe(
    () => requiredIdV1(input.runId, "runToolCatalogBinding.runId"),
    "run_tool_catalog_binding_identity_invalid",
    "Run Tool Catalog binding Run identity is invalid."
  );
  const seed = decodeRunToolCatalogBindingSeedV1(input.seed);
  const createdAt = safe(
    () => requiredTimestampV1(input.createdAt, "runToolCatalogBinding.createdAt"),
    "run_tool_catalog_binding_timestamp_invalid",
    "Run Tool Catalog binding timestamp is invalid."
  );
  const bindingIdentityHash = hashCanonicalJsonV1({
    contractVersion: RUN_TOOL_CATALOG_BINDING_V1.contractVersion,
    runId,
    ...seed,
    createdAt,
  });
  const material = {
    contractVersion: RUN_TOOL_CATALOG_BINDING_V1.contractVersion,
    bindingId: `catalog-binding-${bindingIdentityHash}`,
    runId,
    ...seed,
    createdAt,
  } as const;
  return { ...material, bindingHash: hashCanonicalJsonV1(material) };
};

export const decodeRunToolCatalogBindingV1 = (
  value: unknown
): RunToolCatalogBindingV1 => {
  const record = safe(
    () =>
      strictRecordV1(
        value,
        [
          "contractVersion",
          "bindingId",
          "runId",
          "catalogProfileId",
          "catalogEpoch",
          "catalogHash",
          "toolDescriptorFingerprint",
          "eventEnvelopeVersion",
          "createdAt",
          "bindingHash",
        ],
        "runToolCatalogBinding"
      ),
    "run_tool_catalog_binding_invalid",
    "Run Tool Catalog binding differs from the frozen contract."
  );
  if (record.contractVersion !== RUN_TOOL_CATALOG_BINDING_V1.contractVersion) {
    throw new RunToolCatalogBindingErrorV1(
      "run_tool_catalog_binding_contract_mismatch",
      "Run Tool Catalog binding contract version differs."
    );
  }
  const decoded = createRunToolCatalogBindingV1({
    runId: String(record.runId),
    seed: {
      catalogProfileId: String(record.catalogProfileId),
      catalogEpoch: record.catalogEpoch as number,
      catalogHash: String(record.catalogHash),
      toolDescriptorFingerprint: String(record.toolDescriptorFingerprint),
      eventEnvelopeVersion: String(record.eventEnvelopeVersion),
    },
    createdAt: String(record.createdAt),
  });
  if (
    record.bindingId !== decoded.bindingId ||
    record.bindingHash !== decoded.bindingHash
  ) {
    throw new RunToolCatalogBindingErrorV1(
      "run_tool_catalog_binding_hash_mismatch",
      "Run Tool Catalog binding identity or hash differs."
    );
  }
  return decoded;
};

export const DIRECT_STORE_FIXTURE_CATALOG_BINDING_SEED_V1 =
  decodeRunToolCatalogBindingSeedV1({
    catalogProfileId: RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId,
    catalogEpoch: 1,
    catalogHash: hashCanonicalJsonV1({
      kind: "store-direct-fixture-catalog",
      version: "1.0.0",
      executableRuntime: false,
    }),
    toolDescriptorFingerprint: hashCanonicalJsonV1({
      kind: "store-direct-fixture-descriptors",
      version: "1.0.0",
    }),
    eventEnvelopeVersion: RUN_TOOL_CATALOG_BINDING_V1.eventEnvelopeVersion,
  });

type DescriptorCatalogFactV1 = Readonly<{
  toolId: string;
  version: string;
  description: string;
  effect: string;
  inputSchema: Readonly<Record<string, unknown>>;
}>;

export const createDescriptorBackedCatalogBindingSeedV1 = (input: Readonly<{
  catalogProfileId: string;
  catalogEpoch: number;
  descriptors: readonly DescriptorCatalogFactV1[];
  closureMaterial: unknown;
}>): RunToolCatalogBindingSeedV1 => {
  const descriptors = input.descriptors
    .map(({ toolId, version, description, effect, inputSchema }) => ({
      toolId: requiredIdV1(toolId, "catalogDescriptor.toolId"),
      version: requiredVersionV1(version, "catalogDescriptor.version"),
      description,
      effect,
      inputSchema: structuredClone(inputSchema),
    }))
    .sort((left, right) => left.toolId.localeCompare(right.toolId));
  if (
    new Set(descriptors.map((descriptor) => descriptor.toolId)).size !==
    descriptors.length
  ) {
    throw new RunToolCatalogBindingErrorV1(
      "run_tool_catalog_tool_id_conflict",
      "One Run Tool Catalog may expose only one version of each model-callable toolId."
    );
  }
  return decodeRunToolCatalogBindingSeedV1({
    catalogProfileId: input.catalogProfileId,
    catalogEpoch: input.catalogEpoch,
    catalogHash: hashCanonicalJsonV1({
      contractVersion: "formal-r3-r1-descriptor-backed-catalog-closure-v1",
      catalogProfileId: input.catalogProfileId,
      catalogEpoch: input.catalogEpoch,
      descriptors,
      closureMaterial: input.closureMaterial,
    }),
    toolDescriptorFingerprint: hashCanonicalJsonV1(descriptors),
    eventEnvelopeVersion: RUN_TOOL_CATALOG_BINDING_V1.eventEnvelopeVersion,
  });
};

export const createCompiledCatalogBindingSeedV1 = (input: Readonly<{
  catalogProfileId: string;
  catalogEpoch: number;
  compiledCatalog: CompiledToolCatalogV1;
  descriptors?: readonly DescriptorCatalogFactV1[];
}>): RunToolCatalogBindingSeedV1 => {
  const compiledCatalog = decodeCompiledToolCatalogV1(input.compiledCatalog);
  const descriptors = (input.descriptors ||
    compiledCatalog.tools.map((tool) => ({
      toolId: tool.modelDescriptor.toolId,
      version: tool.modelDescriptor.toolVersion,
      description: tool.modelDescriptor.description,
      effect:
        tool.modelDescriptor.effect === "presentation_state"
          ? "runtime_state"
          : "read_only",
      inputSchema: tool.modelDescriptor.inputSchema,
    })))
    .map(({ toolId, version, description, effect, inputSchema }) => ({
      toolId,
      version,
      description,
      effect,
      inputSchema: structuredClone(inputSchema),
    }))
    .sort((left, right) => left.toolId.localeCompare(right.toolId));
  const compiledIdentities = compiledCatalog.tools
    .map((tool) => `${tool.modelDescriptor.toolId}\u0000${tool.modelDescriptor.toolVersion}`)
    .sort();
  const descriptorIdentities = descriptors
    .map((descriptor) => `${descriptor.toolId}\u0000${descriptor.version}`)
    .sort();
  if (
    descriptorIdentities.length === 0 ||
    new Set(descriptorIdentities).size !== descriptorIdentities.length ||
    descriptorIdentities.some(
      (identity) => !compiledIdentities.includes(identity)
    )
  ) {
    throw new RunToolCatalogBindingErrorV1(
      "run_tool_catalog_descriptor_identity_mismatch",
      "The supplied model surface contains an identity outside the compiled Catalog."
    );
  }
  return decodeRunToolCatalogBindingSeedV1({
    catalogProfileId: input.catalogProfileId,
    catalogEpoch: input.catalogEpoch,
    catalogHash: compiledCatalog.catalogHash,
    toolDescriptorFingerprint: hashCanonicalJsonV1(descriptors),
    eventEnvelopeVersion: RUN_TOOL_CATALOG_BINDING_V1.eventEnvelopeVersion,
  });
};

export const createStoreCatalogMigrationRecordV1 = (input: Readonly<{
  sourceVersion: StoreCatalogMigrationRecordV1["sourceVersion"];
  sourcePayloadHash: string;
  migratedAt: string;
}>): StoreCatalogMigrationRecordV1 => {
  const material = {
    contractVersion:
      "landing-page-conversation-store-catalog-migration-v1" as const,
    migrationId: "conversation-store-pre-r1-to-v4" as const,
    sourceVersion: input.sourceVersion,
    targetVersion: RUN_TOOL_CATALOG_BINDING_V1.storeVersion,
    sourcePayloadHash: requiredHashV1(
      input.sourcePayloadHash,
      "catalogMigration.sourcePayloadHash"
    ),
    migratedAt: requiredTimestampV1(
      input.migratedAt,
      "catalogMigration.migratedAt"
    ),
  };
  return { ...material, migrationHash: hashCanonicalJsonV1(material) };
};

export const decodeStoreCatalogMigrationRecordV1 = (
  value: unknown
): StoreCatalogMigrationRecordV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "migrationId",
      "sourceVersion",
      "targetVersion",
      "sourcePayloadHash",
      "migratedAt",
      "migrationHash",
    ],
    "catalogMigration"
  );
  if (
    record.contractVersion !==
      "landing-page-conversation-store-catalog-migration-v1" ||
    record.migrationId !== "conversation-store-pre-r1-to-v4" ||
    ![
      "landing-page-conversation-store-state-v1",
      "landing-page-conversation-store-state-v2",
      "landing-page-conversation-store-state-v3",
    ].includes(String(record.sourceVersion)) ||
    record.targetVersion !== RUN_TOOL_CATALOG_BINDING_V1.storeVersion
  ) {
    throw new RunToolCatalogBindingErrorV1(
      "store_catalog_migration_tuple_invalid",
      "Store Catalog migration tuple is not registered."
    );
  }
  const decoded = createStoreCatalogMigrationRecordV1({
    sourceVersion:
      record.sourceVersion as StoreCatalogMigrationRecordV1["sourceVersion"],
    sourcePayloadHash: String(record.sourcePayloadHash),
    migratedAt: String(record.migratedAt),
  });
  if (record.migrationHash !== decoded.migrationHash) {
    throw new RunToolCatalogBindingErrorV1(
      "store_catalog_migration_hash_mismatch",
      "Store Catalog migration hash differs."
    );
  }
  return decoded;
};
