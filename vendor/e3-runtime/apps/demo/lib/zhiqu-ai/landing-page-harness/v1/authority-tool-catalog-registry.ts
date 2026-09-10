import type {
  CompiledAuthorityToolV1,
  CompiledToolCatalogV1,
} from "./authority-fabric-contracts";
import { decodeCompiledToolCatalogV1 } from "./authority-tool-compiler";
import {
  decodeRunToolCatalogBindingSeedV1,
  decodeRunToolCatalogBindingV1,
  type RunToolCatalogBindingSeedV1,
  type RunToolCatalogBindingV1,
} from "./run-tool-catalog-binding";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  strictRecordV1,
} from "./strict-json";
import { requiredVersionV1 } from "./authority-fabric-codecs";

export const AUTHORITY_TOOL_CATALOG_REGISTRY_V1 = Object.freeze({
  registrationContractVersion: "formal-r3-installed-authority-tool-catalog-v1",
  productionTrustDomain: "server-owned-production-installation-v1",
  testTrustDomain: "explicit-test-installation-v1",
} as const);

export type InstalledModelToolDescriptorV1 = Readonly<{
  toolId: string;
  version: string;
  description: string;
  effect: "read_only" | "runtime_state" | "capability_read";
  inputSchema: Readonly<Record<string, unknown>>;
}>;

export type InstalledAuthorityToolCatalogV1 = Readonly<{
  contractVersion: typeof AUTHORITY_TOOL_CATALOG_REGISTRY_V1.registrationContractVersion;
  catalogProfileId: string;
  catalogEpoch: number;
  eventEnvelopeVersion: string;
  compiledCatalog: CompiledToolCatalogV1;
  modelDescriptors: readonly InstalledModelToolDescriptorV1[];
  catalogHash: string;
  definitionEnvelopeHash: string;
  descriptorFingerprintHash: string;
  executorBindingHash: string;
  projectionBindingHash: string;
  installationHash: string;
}>;

export type ResolvedInstalledAuthorityToolCatalogV1 = Readonly<{
  installation: InstalledAuthorityToolCatalogV1;
  compiledCatalog: CompiledToolCatalogV1;
}>;

export class AuthorityToolCatalogRegistryErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "AuthorityToolCatalogRegistryErrorV1";
  }
}

const safe = <T>(operation: () => T, code: string, message: string): T => {
  try {
    return operation();
  } catch (error) {
    if (error instanceof AuthorityToolCatalogRegistryErrorV1) throw error;
    throw new AuthorityToolCatalogRegistryErrorV1(code, message);
  }
};

const requireEpoch = (value: unknown, path: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 1) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_epoch_invalid",
      `${path} must be a positive safe integer.`
    );
  }
  return Number(value);
};

const descriptorEffectFor = (
  tool: CompiledAuthorityToolV1
): InstalledModelToolDescriptorV1["effect"] => {
  if (tool.modelDescriptor.effect === "presentation_state") {
    return "runtime_state";
  }
  if (tool.modelDescriptor.effect === "private_read") {
    return tool.modelDescriptor.toolId === "inspect_ux_capability"
      ? "capability_read"
      : "read_only";
  }
  throw new AuthorityToolCatalogRegistryErrorV1(
    "installed_catalog_model_effect_unsupported",
    "The R1 model descriptor projection does not admit write effects."
  );
};

const descriptorKey = (descriptor: InstalledModelToolDescriptorV1) =>
  `${descriptor.toolId}\u0000${descriptor.version}`;

const decodeDescriptor = (
  value: unknown,
  path: string
): InstalledModelToolDescriptorV1 => {
  const record = safe(
    () =>
      strictRecordV1(
        value,
        ["toolId", "version", "description", "effect", "inputSchema"],
        path
      ),
    "installed_catalog_descriptor_invalid",
    "Installed Catalog descriptor differs from the frozen contract."
  );
  if (
    typeof record.description !== "string" ||
    record.description.length < 1 ||
    record.description.length > 1_000 ||
    (record.effect !== "read_only" &&
      record.effect !== "runtime_state" &&
      record.effect !== "capability_read") ||
    record.inputSchema === null ||
    typeof record.inputSchema !== "object" ||
    Array.isArray(record.inputSchema)
  ) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_descriptor_invalid",
      "Installed Catalog descriptor fields are invalid."
    );
  }
  return {
    toolId: safe(
      () => requiredIdV1(record.toolId, `${path}.toolId`),
      "installed_catalog_descriptor_invalid",
      "Installed Catalog descriptor Tool identity is invalid."
    ),
    version: safe(
      () => requiredVersionV1(record.version, `${path}.version`),
      "installed_catalog_descriptor_invalid",
      "Installed Catalog descriptor Tool version is invalid."
    ),
    description: record.description,
    effect: record.effect,
    inputSchema: structuredClone(
      record.inputSchema as Readonly<Record<string, unknown>>
    ),
  };
};

const decodeDescriptors = (
  value: unknown,
  compiledCatalog: CompiledToolCatalogV1
) => {
  if (!Array.isArray(value) || value.length < 1 || value.length > 256) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_descriptor_set_invalid",
      "Installed Catalog must expose a bounded non-empty descriptor set."
    );
  }
  const descriptors = value.map((descriptor, index) =>
    decodeDescriptor(descriptor, `installedCatalog.modelDescriptors[${index}]`)
  );
  const sorted = [...descriptors].sort((left, right) =>
    descriptorKey(left) < descriptorKey(right)
      ? -1
      : descriptorKey(left) > descriptorKey(right)
      ? 1
      : 0
  );
  if (
    canonicalJsonV1(descriptors) !== canonicalJsonV1(sorted) ||
    new Set(descriptors.map(descriptorKey)).size !== descriptors.length
  ) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_descriptor_set_not_canonical",
      "Installed Catalog descriptors must be unique and canonically ordered."
    );
  }
  for (const descriptor of descriptors) {
    const matches = compiledCatalog.tools.filter(
      (tool) =>
        tool.modelDescriptor.toolId === descriptor.toolId &&
        tool.modelDescriptor.toolVersion === descriptor.version
    );
    if (
      matches.length !== 1 ||
      matches[0]!.modelDescriptor.description !== descriptor.description ||
      descriptorEffectFor(matches[0]!) !== descriptor.effect ||
      canonicalJsonV1(matches[0]!.modelDescriptor.inputSchema) !==
        canonicalJsonV1(descriptor.inputSchema)
    ) {
      throw new AuthorityToolCatalogRegistryErrorV1(
        "installed_catalog_descriptor_closure_mismatch",
        "Installed descriptor is outside the exact compiled Tool closure."
      );
    }
  }
  const expectedDescriptors = compiledCatalog.tools
    .map((tool) => ({
      toolId: tool.modelDescriptor.toolId,
      version: tool.modelDescriptor.toolVersion,
      description: tool.modelDescriptor.description,
      effect: descriptorEffectFor(tool),
      inputSchema: structuredClone(tool.modelDescriptor.inputSchema),
    }))
    .sort((left, right) =>
      descriptorKey(left) < descriptorKey(right)
        ? -1
        : descriptorKey(left) > descriptorKey(right)
          ? 1
          : 0
    );
  if (canonicalJsonV1(descriptors) !== canonicalJsonV1(expectedDescriptors)) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_descriptor_set_incomplete",
      "Installed Catalog descriptors must exactly cover every compiled model descriptor."
    );
  }
  return descriptors;
};

const definitionEnvelopeHashFor = (catalog: CompiledToolCatalogV1) =>
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-authority-definition-envelope-v1",
    definitions: catalog.tools.map((tool) => ({
      toolId: tool.definition.toolId,
      toolVersion: tool.definition.toolVersion,
      definitionHash: tool.definitionHash,
      definition: tool.definition,
    })),
  });

const executorBindingHashFor = (catalog: CompiledToolCatalogV1) =>
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-authority-executor-binding-set-v1",
    bindings: catalog.tools.map((tool) => ({
      toolId: tool.definition.toolId,
      toolVersion: tool.definition.toolVersion,
      bindingHash: tool.executorBinding.bindingHash,
      executorArtifactHash: tool.executorBinding.executorArtifactHash,
      adapterArtifactHash: tool.executorBinding.adapterArtifactHash,
      bridgeContractHash: tool.executorBinding.bridgeContractHash,
    })),
  });

const projectionBindingHashFor = (catalog: CompiledToolCatalogV1) =>
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-authority-projection-binding-set-v1",
    bindings: catalog.tools.map((tool) => ({
      toolId: tool.definition.toolId,
      toolVersion: tool.definition.toolVersion,
      publicProjection: tool.publicProjection,
    })),
  });

const createInstallationMaterial = (
  input: Readonly<{
    catalogProfileId: string;
    catalogEpoch: number;
    eventEnvelopeVersion: string;
    compiledCatalog: CompiledToolCatalogV1;
    modelDescriptors: readonly InstalledModelToolDescriptorV1[];
  }>
) => {
  const catalogProfileId = safe(
    () =>
      requiredIdV1(input.catalogProfileId, "installedCatalog.catalogProfileId"),
    "installed_catalog_profile_invalid",
    "Installed Catalog profile is invalid."
  );
  const catalogEpoch = requireEpoch(
    input.catalogEpoch,
    "installedCatalog.catalogEpoch"
  );
  const eventEnvelopeVersion = safe(
    () =>
      requiredVersionV1(
        input.eventEnvelopeVersion,
        "installedCatalog.eventEnvelopeVersion"
      ),
    "installed_catalog_event_envelope_invalid",
    "Installed Catalog event envelope is invalid."
  );
  const compiledCatalog = safe(
    () => decodeCompiledToolCatalogV1(input.compiledCatalog),
    "installed_catalog_compiled_closure_invalid",
    "Installed compiled Catalog closure is invalid."
  );
  const modelDescriptors = decodeDescriptors(
    input.modelDescriptors,
    compiledCatalog
  );
  return {
    contractVersion:
      AUTHORITY_TOOL_CATALOG_REGISTRY_V1.registrationContractVersion,
    catalogProfileId,
    catalogEpoch,
    eventEnvelopeVersion,
    compiledCatalog,
    modelDescriptors,
    catalogHash: compiledCatalog.catalogHash,
    definitionEnvelopeHash: definitionEnvelopeHashFor(compiledCatalog),
    descriptorFingerprintHash: hashCanonicalJsonV1(modelDescriptors),
    executorBindingHash: executorBindingHashFor(compiledCatalog),
    projectionBindingHash: projectionBindingHashFor(compiledCatalog),
  } as const;
};

export const createInstalledAuthorityToolCatalogV1 = (
  input: Readonly<{
    catalogProfileId: string;
    catalogEpoch: number;
    eventEnvelopeVersion: string;
    compiledCatalog: CompiledToolCatalogV1;
    modelDescriptors?: readonly InstalledModelToolDescriptorV1[];
  }>
): InstalledAuthorityToolCatalogV1 => {
  const compiledCatalog = decodeCompiledToolCatalogV1(input.compiledCatalog);
  const material = createInstallationMaterial({
    ...input,
    compiledCatalog,
    modelDescriptors:
      input.modelDescriptors ||
      compiledCatalog.tools.map((tool) => ({
        toolId: tool.modelDescriptor.toolId,
        version: tool.modelDescriptor.toolVersion,
        description: tool.modelDescriptor.description,
        effect: descriptorEffectFor(tool),
        inputSchema: tool.modelDescriptor.inputSchema,
      })),
  });
  return {
    ...material,
    installationHash: hashCanonicalJsonV1(material),
  };
};

export const decodeInstalledAuthorityToolCatalogV1 = (
  value: unknown
): InstalledAuthorityToolCatalogV1 => {
  const record = safe(
    () =>
      strictRecordV1(
        value,
        [
          "contractVersion",
          "catalogProfileId",
          "catalogEpoch",
          "eventEnvelopeVersion",
          "compiledCatalog",
          "modelDescriptors",
          "catalogHash",
          "definitionEnvelopeHash",
          "descriptorFingerprintHash",
          "executorBindingHash",
          "projectionBindingHash",
          "installationHash",
        ],
        "installedCatalog"
      ),
    "installed_catalog_registration_invalid",
    "Installed Catalog registration differs from the frozen contract."
  );
  if (
    record.contractVersion !==
    AUTHORITY_TOOL_CATALOG_REGISTRY_V1.registrationContractVersion
  ) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_contract_mismatch",
      "Installed Catalog registration contract version differs."
    );
  }
  const catalogProfileId = safe(
    () =>
      requiredIdV1(
        record.catalogProfileId,
        "installedCatalog.catalogProfileId"
      ),
    "installed_catalog_profile_invalid",
    "Installed Catalog profile is invalid."
  );
  const eventEnvelopeVersion = safe(
    () =>
      requiredVersionV1(
        record.eventEnvelopeVersion,
        "installedCatalog.eventEnvelopeVersion"
      ),
    "installed_catalog_event_envelope_invalid",
    "Installed Catalog event envelope is invalid."
  );
  const material = createInstallationMaterial({
    catalogProfileId,
    catalogEpoch: record.catalogEpoch as number,
    eventEnvelopeVersion,
    compiledCatalog: record.compiledCatalog as CompiledToolCatalogV1,
    modelDescriptors:
      record.modelDescriptors as readonly InstalledModelToolDescriptorV1[],
  });
  for (const [name, actual, expected] of [
    ["catalog", record.catalogHash, material.catalogHash],
    [
      "definition",
      record.definitionEnvelopeHash,
      material.definitionEnvelopeHash,
    ],
    [
      "descriptor",
      record.descriptorFingerprintHash,
      material.descriptorFingerprintHash,
    ],
    ["executor", record.executorBindingHash, material.executorBindingHash],
    [
      "projection",
      record.projectionBindingHash,
      material.projectionBindingHash,
    ],
  ] as const) {
    if (
      safe(
        () => requiredHashV1(actual, `installedCatalog.${name}Hash`),
        `installed_catalog_${name}_hash_invalid`,
        `Installed Catalog ${name} hash is invalid.`
      ) !== expected
    ) {
      throw new AuthorityToolCatalogRegistryErrorV1(
        `installed_catalog_${name}_closure_mismatch`,
        `Installed Catalog ${name} closure differs from its compiled Catalog.`
      );
    }
  }
  const installationHash = safe(
    () =>
      requiredHashV1(
        record.installationHash,
        "installedCatalog.installationHash"
      ),
    "installed_catalog_installation_hash_invalid",
    "Installed Catalog installation hash is invalid."
  );
  if (installationHash !== hashCanonicalJsonV1(material)) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_installation_hash_mismatch",
      "Installed Catalog registration was modified."
    );
  }
  return { ...material, installationHash };
};

const installationKey = (catalogProfileId: string, catalogEpoch: number) =>
  `${catalogProfileId}\u0000${catalogEpoch}`;

type AuthorityToolCatalogRegistryBaseV1 = Readonly<{
  resolveExact(
    binding: RunToolCatalogBindingSeedV1 | RunToolCatalogBindingV1
  ): ResolvedInstalledAuthorityToolCatalogV1;
  resolveTool(
    binding: RunToolCatalogBindingSeedV1 | RunToolCatalogBindingV1,
    toolId: string,
    toolVersion: string
  ): CompiledAuthorityToolV1;
  listInstalled(): readonly Readonly<{
    catalogProfileId: string;
    catalogEpoch: number;
    catalogHash: string;
    installationHash: string;
  }>[];
}>;

export type ProductionAuthorityToolCatalogRegistryV1 =
  AuthorityToolCatalogRegistryBaseV1 &
    Readonly<{
      trustDomain: typeof AUTHORITY_TOOL_CATALOG_REGISTRY_V1.productionTrustDomain;
    }>;

export type TestAuthorityToolCatalogRegistryV1 =
  AuthorityToolCatalogRegistryBaseV1 &
    Readonly<{
      trustDomain: typeof AUTHORITY_TOOL_CATALOG_REGISTRY_V1.testTrustDomain;
    }>;

const createRegistry = <
  TTrustDomain extends
    | typeof AUTHORITY_TOOL_CATALOG_REGISTRY_V1.productionTrustDomain
    | typeof AUTHORITY_TOOL_CATALOG_REGISTRY_V1.testTrustDomain
>(
  trustDomain: TTrustDomain,
  installationsInput: readonly InstalledAuthorityToolCatalogV1[]
): AuthorityToolCatalogRegistryBaseV1 &
  Readonly<{ trustDomain: TTrustDomain }> => {
  const installations = installationsInput.map((entry) =>
    decodeInstalledAuthorityToolCatalogV1(entry)
  );
  if (installations.length < 1 || installations.length > 256) {
    throw new AuthorityToolCatalogRegistryErrorV1(
      "installed_catalog_registry_size_invalid",
      "Authority Tool Catalog Registry must contain a bounded non-empty installation set."
    );
  }
  const byKey = new Map<string, InstalledAuthorityToolCatalogV1>();
  for (const installation of installations) {
    const key = installationKey(
      installation.catalogProfileId,
      installation.catalogEpoch
    );
    if (byKey.has(key)) {
      throw new AuthorityToolCatalogRegistryErrorV1(
        "installed_catalog_identity_conflict",
        "Authority Tool Catalog profile and epoch must be installed exactly once."
      );
    }
    byKey.set(key, installation);
  }

  const resolveExact = (
    bindingInput: RunToolCatalogBindingSeedV1 | RunToolCatalogBindingV1
  ): ResolvedInstalledAuthorityToolCatalogV1 => {
    const candidate = bindingInput as Partial<RunToolCatalogBindingV1>;
    const binding =
      candidate.contractVersion === undefined
        ? decodeRunToolCatalogBindingSeedV1(bindingInput)
        : decodeRunToolCatalogBindingV1(bindingInput);
    const installation = byKey.get(
      installationKey(binding.catalogProfileId, binding.catalogEpoch)
    );
    if (!installation) {
      throw new AuthorityToolCatalogRegistryErrorV1(
        "installed_catalog_not_found",
        "The exact Authority Tool Catalog profile and epoch is not installed."
      );
    }
    if (
      binding.catalogHash !== installation.catalogHash ||
      binding.toolDescriptorFingerprint !==
        installation.descriptorFingerprintHash ||
      binding.eventEnvelopeVersion !== installation.eventEnvelopeVersion
    ) {
      throw new AuthorityToolCatalogRegistryErrorV1(
        "installed_catalog_binding_mismatch",
        "Run binding differs from the exact server-installed Catalog closure."
      );
    }
    const decoded = decodeInstalledAuthorityToolCatalogV1(installation);
    return {
      installation: decoded,
      compiledCatalog: decoded.compiledCatalog,
    };
  };

  return Object.freeze({
    trustDomain,
    resolveExact,
    resolveTool: (binding, toolId, toolVersion) => {
      const resolved = resolveExact(binding);
      const identity = `${requiredIdV1(
        toolId,
        "toolId"
      )}\u0000${requiredVersionV1(toolVersion, "toolVersion")}`;
      const matches = resolved.compiledCatalog.tools.filter(
        (tool) =>
          `${tool.definition.toolId}\u0000${tool.definition.toolVersion}` ===
          identity
      );
      if (matches.length !== 1) {
        throw new AuthorityToolCatalogRegistryErrorV1(
          "installed_catalog_tool_not_found",
          "Tool identity is not installed in the Run-bound Catalog."
        );
      }
      return structuredClone(matches[0]!);
    },
    listInstalled: () =>
      [...byKey.values()]
        .map((installation) => ({
          catalogProfileId: installation.catalogProfileId,
          catalogEpoch: installation.catalogEpoch,
          catalogHash: installation.catalogHash,
          installationHash: installation.installationHash,
        }))
        .sort((left, right) =>
          installationKey(left.catalogProfileId, left.catalogEpoch) <
          installationKey(right.catalogProfileId, right.catalogEpoch)
            ? -1
            : 1
        ),
  });
};

export const createProductionAuthorityToolCatalogRegistryV1 = (
  installations: readonly InstalledAuthorityToolCatalogV1[]
): ProductionAuthorityToolCatalogRegistryV1 =>
  createRegistry(
    AUTHORITY_TOOL_CATALOG_REGISTRY_V1.productionTrustDomain,
    installations
  );

// Test installation is deliberately a separate trust-domain type. Production
// Store/Runtime constructors must require ProductionAuthorityToolCatalogRegistryV1
// and must never accept this factory as a fallback.
export const createTestAuthorityToolCatalogRegistryV1 = (
  installations: readonly InstalledAuthorityToolCatalogV1[]
): TestAuthorityToolCatalogRegistryV1 =>
  createRegistry(
    AUTHORITY_TOOL_CATALOG_REGISTRY_V1.testTrustDomain,
    installations
  );
