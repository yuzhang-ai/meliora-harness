import {
  createInstalledAuthorityToolCatalogV1,
  createProductionAuthorityToolCatalogRegistryV1,
} from "./authority-tool-catalog-registry";
import {
  GENERAL_RUNTIME_AUTHORITY_V1,
  GENERAL_RUNTIME_COMPILED_TOOL_CATALOG_V1,
  GENERAL_RUNTIME_TOOL_DESCRIPTORS_V1,
} from "./general-runtime-authority";
import {
  H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
  H1_RUNTIME_TOOL_DESCRIPTORS_V1,
} from "./h1-runtime-authority";
import {
  RUN_TOOL_CATALOG_BINDING_V1,
  createCompiledCatalogBindingSeedV1,
} from "./run-tool-catalog-binding";

export const H1_RUNTIME_CATALOG_PROFILE_V1 = Object.freeze({
  catalogProfileId: "h1-restricted-read-v1",
  catalogEpoch: 1,
} as const);

export const GENERAL_RUNTIME_INSTALLED_CATALOG_V1 =
  createInstalledAuthorityToolCatalogV1({
    catalogProfileId: GENERAL_RUNTIME_AUTHORITY_V1.catalogProfileId,
    catalogEpoch: GENERAL_RUNTIME_AUTHORITY_V1.catalogEpoch,
    eventEnvelopeVersion: RUN_TOOL_CATALOG_BINDING_V1.eventEnvelopeVersion,
    compiledCatalog: GENERAL_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    modelDescriptors: GENERAL_RUNTIME_TOOL_DESCRIPTORS_V1,
  });

/**
 * H1 has one stable three-tool surface in R1. A missing capability is reported
 * by the exact inspect_ux_capability Receipt; phase flags never change the
 * descriptor fingerprint for the same profile and epoch.
 */
export const H1_RUNTIME_INSTALLED_CATALOG_V1 =
  createInstalledAuthorityToolCatalogV1({
    ...H1_RUNTIME_CATALOG_PROFILE_V1,
    eventEnvelopeVersion: RUN_TOOL_CATALOG_BINDING_V1.eventEnvelopeVersion,
    compiledCatalog: H1_RUNTIME_COMPILED_TOOL_CATALOG_V1,
    modelDescriptors: H1_RUNTIME_TOOL_DESCRIPTORS_V1,
  });

export const PRODUCTION_AUTHORITY_TOOL_CATALOG_REGISTRY_V1 =
  createProductionAuthorityToolCatalogRegistryV1([
    GENERAL_RUNTIME_INSTALLED_CATALOG_V1,
    H1_RUNTIME_INSTALLED_CATALOG_V1,
  ]);

export const GENERAL_RUNTIME_CATALOG_BINDING_SEED_V1 =
  createCompiledCatalogBindingSeedV1({
    catalogProfileId: GENERAL_RUNTIME_INSTALLED_CATALOG_V1.catalogProfileId,
    catalogEpoch: GENERAL_RUNTIME_INSTALLED_CATALOG_V1.catalogEpoch,
    compiledCatalog: GENERAL_RUNTIME_INSTALLED_CATALOG_V1.compiledCatalog,
    descriptors: GENERAL_RUNTIME_INSTALLED_CATALOG_V1.modelDescriptors,
  });

export const H1_RUNTIME_CATALOG_BINDING_SEED_V1 =
  createCompiledCatalogBindingSeedV1({
    catalogProfileId: H1_RUNTIME_INSTALLED_CATALOG_V1.catalogProfileId,
    catalogEpoch: H1_RUNTIME_INSTALLED_CATALOG_V1.catalogEpoch,
    compiledCatalog: H1_RUNTIME_INSTALLED_CATALOG_V1.compiledCatalog,
    descriptors: H1_RUNTIME_INSTALLED_CATALOG_V1.modelDescriptors,
  });
