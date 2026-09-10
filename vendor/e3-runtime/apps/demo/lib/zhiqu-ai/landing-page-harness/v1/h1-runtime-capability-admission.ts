import { readFileSync } from "node:fs";

import {
  EFFECTIVE_FACTS_CAPTURE_GRANT_V1,
  EFFECTIVE_FACTS_CAPTURE_TARGETS_V1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import { EFFECTIVE_FACTS_TURN_REGISTRY_V1 } from "../../editor-canvas/v1/effective-facts-turn-registry";
import type { UxEffectiveFactsCaptureProfileV1 } from "../../editor-canvas/v1/effective-facts-read-contract";
import { LANDING_PAGE_HARNESS_LIMITS_V1 } from "./contracts";
import { H1_RUNTIME_EXECUTION_LIMITS_V1 } from "./h1-runtime-limits";
import {
  StrictJsonErrorV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export const H1_RUNTIME_CAPABILITY_ADMISSION_V1 = Object.freeze({
  contractVersion: "formal-r3-capability-admission-record-v1",
  bindingContractVersion:
    "formal-r3-h1-runtime-capability-admission-binding-v1",
  phase: "B1",
  status: "approved_for_deterministic_runtime_candidate",
  environment: "local_isolated_machine_runtime",
  allowedEffect: "private_read",
  claimCeiling: "restricted_h1_dev_runtime_candidate",
  principalPolicy: Object.freeze({
    authority: "server_owned_injected_host_principal",
    clientPrincipalOverride: "denied",
    clientScopeOverride: "denied",
    productionAuthentication: "not_admitted",
  }),
  dataPolicy: Object.freeze({
    inputClass: "local_editor_effective_facts_private",
    durableStorage: "isolated_sqlite_private_authority_record",
    publicProjection: "opaque_receipt_identity_only",
    externalEgress: "none",
    retention: "test_lifetime_only",
  }),
  rollback: Object.freeze({
    strategy: "remove_b1_runtime_adapter_and_discard_isolated_store",
    legacyRuntimeDefault: "unchanged",
    productionImpact: "none",
  }),
  validityRevocationMode: "host_acl_revision_or_admission_status",
  owner: Object.freeze({
    harnessOwnerRef: "role:harness-construction-owner",
    uxOwnerRef: "role:editor-ux-owner",
    productOwnerRef: "role:ai-landing-page-product-owner",
    approvalScope: "local-isolated-deterministic-private-read-only",
    reviewRequiredBeforeExpansion: true,
  }),
  explicitHolds: Object.freeze([
    "real_model_tool_selection",
    "real_browser_canvas_read",
    "user_visible_h1_submission_ui",
    "edit_and_dirty_page_profiles",
    "general_canvas_read",
    "canvas_mutation",
    "publish_or_external_write",
    "non_h1_tool_family_migration",
    "external_skill_package_installation",
    "mcp_facade",
    "production_auth_acl",
    "production_durable_grant_cas",
    "push_deploy_release",
  ]),
  budgets: Object.freeze({
    maxGrantUses: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxUses,
    maxToolCallsPerRun: LANDING_PAGE_HARNESS_LIMITS_V1.maxToolCallsPerRun,
    maxSnapshotBytes: EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes,
    maxGrantTtlMs: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.ttlMs,
    maxRunWallTimeMs: H1_RUNTIME_EXECUTION_LIMITS_V1.maxRunWallTimeMs,
    paidModelCalls: 0,
  }),
} as const);

export const H1_RUNTIME_CAPABILITY_ADMISSION_B2_V1 = Object.freeze({
  contractVersion: "formal-r3-capability-admission-record-v1",
  bindingContractVersion:
    "formal-r3-h1-runtime-capability-admission-binding-v1",
  phase: "B2",
  status: "approved_for_local_real_model_browser_acceptance",
  environment: "local_isolated_browser_acceptance",
  allowedEffect: "private_read",
  claimCeiling: "restricted_profile_canvas_read_go",
  principalPolicy: Object.freeze({
    authority: "server_owned_local_browser_acceptance_principal",
    clientPrincipalOverride: "denied",
    clientScopeOverride: "denied",
    productionAuthentication: "not_admitted",
  }),
  dataPolicy: Object.freeze({
    inputClass: "local_editor_effective_facts_private",
    durableStorage: "isolated_sqlite_private_authority_record",
    publicProjection: "receipt_grounded_bounded_read_answer",
    externalEgress: "exact_model_provider_bounded_projection_only",
    retention: "acceptance_evidence_lifetime_only",
  }),
  rollback: Object.freeze({
    strategy: "disable_b2_local_browser_mode_and_discard_isolated_store",
    legacyRuntimeDefault: "unchanged",
    productionImpact: "none",
  }),
  validityRevocationMode: "host_acl_revision_or_admission_status",
  owner: Object.freeze({
    harnessOwnerRef: "role:harness-construction-owner",
    uxOwnerRef: "role:editor-ux-owner",
    productOwnerRef: "role:ai-landing-page-product-owner",
    approvalScope: "local-isolated-real-model-browser-private-read-only",
    reviewRequiredBeforeExpansion: true,
  }),
  explicitHolds: Object.freeze([
    "edit_and_dirty_page_profiles",
    "general_canvas_read",
    "canvas_mutation",
    "publish_or_external_write",
    "non_h1_tool_family_migration",
    "external_skill_package_installation",
    "mcp_facade",
    "production_auth_acl",
    "production_durable_grant_cas",
    "push_deploy_release",
  ]),
  budgets: Object.freeze({
    maxGrantUses: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.maxUses,
    maxToolCallsPerRun: LANDING_PAGE_HARNESS_LIMITS_V1.maxToolCallsPerRun,
    maxSnapshotBytes: EFFECTIVE_FACTS_TURN_REGISTRY_V1.maxSnapshotBytes,
    maxGrantTtlMs: EFFECTIVE_FACTS_CAPTURE_GRANT_V1.ttlMs,
    maxRunWallTimeMs: H1_RUNTIME_EXECUTION_LIMITS_V1.maxRunWallTimeMs,
    paidModelCalls: 6,
  }),
} as const);

type H1RuntimeCapabilityAdmissionDefinitionV1 =
  | typeof H1_RUNTIME_CAPABILITY_ADMISSION_V1
  | typeof H1_RUNTIME_CAPABILITY_ADMISSION_B2_V1;

type H1CapabilityTargetDocumentIdV1 =
  keyof typeof EFFECTIVE_FACTS_CAPTURE_TARGETS_V1;

export type H1RuntimeCapabilityAdmissionTargetV1 = Readonly<{
  tenantId: string;
  workspaceId: string;
  documentId: H1CapabilityTargetDocumentIdV1;
  routePath: string;
  captureProfile: UxEffectiveFactsCaptureProfileV1;
  viewport: "desktop";
}>;

export type H1RuntimeCapabilityAdmissionRecordV1 = Readonly<{
  contractVersion: typeof H1_RUNTIME_CAPABILITY_ADMISSION_V1.contractVersion;
  admissionId: string;
  phase: H1RuntimeCapabilityAdmissionDefinitionV1["phase"];
  status: H1RuntimeCapabilityAdmissionDefinitionV1["status"];
  environment: H1RuntimeCapabilityAdmissionDefinitionV1["environment"];
  allowedEffect: H1RuntimeCapabilityAdmissionDefinitionV1["allowedEffect"];
  claimCeiling: H1RuntimeCapabilityAdmissionDefinitionV1["claimCeiling"];
  modelIdentity: string;
  principalPolicy: H1RuntimeCapabilityAdmissionDefinitionV1["principalPolicy"];
  allowedTargets: readonly H1RuntimeCapabilityAdmissionTargetV1[];
  dataPolicy: H1RuntimeCapabilityAdmissionDefinitionV1["dataPolicy"];
  budgets: H1RuntimeCapabilityAdmissionDefinitionV1["budgets"];
  rollback: H1RuntimeCapabilityAdmissionDefinitionV1["rollback"];
  validity: Readonly<{
    issuedAt: string;
    expiresAt: string;
    revocationMode:
      typeof H1_RUNTIME_CAPABILITY_ADMISSION_V1.validityRevocationMode;
  }>;
  owner: H1RuntimeCapabilityAdmissionDefinitionV1["owner"];
  explicitHolds: H1RuntimeCapabilityAdmissionDefinitionV1["explicitHolds"];
}>;

export type LoadedH1RuntimeCapabilityAdmissionV1 = Readonly<{
  record: H1RuntimeCapabilityAdmissionRecordV1;
  admissionHash: string;
  sourceHash: string;
}>;

export type H1RuntimeCapabilityAdmissionBindingV1 = Readonly<{
  contractVersion:
    typeof H1_RUNTIME_CAPABILITY_ADMISSION_V1.bindingContractVersion;
  admissionId: string;
  admissionHash: string;
  sourceHash: string;
  claimCeiling: H1RuntimeCapabilityAdmissionDefinitionV1["claimCeiling"];
  bindingHash: string;
}>;

const exactLiteralV1 = <T extends string>(
  value: unknown,
  expected: T,
  path: string
): T => {
  if (value !== expected) {
    throw new StrictJsonErrorV1(
      "invalid_enum",
      path,
      `Expected ${expected}.`
    );
  }
  return expected;
};

const exactBooleanV1 = <T extends boolean>(
  value: unknown,
  expected: T,
  path: string
): T => {
  if (value !== expected) {
    throw new StrictJsonErrorV1(
      "invalid_boolean",
      path,
      `Expected ${String(expected)}.`
    );
  }
  return expected;
};

const exactIntegerV1 = <T extends number>(
  value: unknown,
  expected: T,
  path: string
): T => {
  if (!Number.isInteger(value) || value !== expected) {
    throw new StrictJsonErrorV1(
      "invalid_number",
      path,
      `Expected integer ${expected}.`
    );
  }
  return expected;
};

const decodeTargetV1 = (
  value: unknown,
  index: number
): H1RuntimeCapabilityAdmissionTargetV1 => {
  const path = `h1CapabilityAdmission.allowedTargets[${index}]`;
  const record = strictRecordV1(
    value,
    [
      "tenantId",
      "workspaceId",
      "documentId",
      "routePath",
      "captureProfile",
      "viewport",
    ],
    path
  );
  const documentId = requiredIdV1(
    record.documentId,
    `${path}.documentId`
  );
  if (!Object.hasOwn(EFFECTIVE_FACTS_CAPTURE_TARGETS_V1, documentId)) {
    throw new StrictJsonErrorV1(
      "invalid_enum",
      `${path}.documentId`,
      "Target is not an installed H1 document."
    );
  }
  const installed =
    EFFECTIVE_FACTS_CAPTURE_TARGETS_V1[
      documentId as H1CapabilityTargetDocumentIdV1
    ];
  const routePath = requiredStringV1(record.routePath, `${path}.routePath`, 160);
  const captureProfile = requiredStringV1(
    record.captureProfile,
    `${path}.captureProfile`,
    160
  );
  if (
    routePath !== installed.routePath ||
    captureProfile !== installed.captureProfile
  ) {
    throw new StrictJsonErrorV1(
      "h1_capability_target_mismatch",
      path,
      "Document, route, and capture profile do not match the installed target."
    );
  }
  return {
    tenantId: requiredIdV1(record.tenantId, `${path}.tenantId`),
    workspaceId: requiredIdV1(record.workspaceId, `${path}.workspaceId`),
    documentId: documentId as H1CapabilityTargetDocumentIdV1,
    routePath,
    captureProfile: captureProfile as UxEffectiveFactsCaptureProfileV1,
    viewport: exactLiteralV1(record.viewport, "desktop", `${path}.viewport`),
  };
};

const decodeExactPolicyV1 = <T extends Readonly<Record<string, string>>>(
  value: unknown,
  expected: T,
  path: string
): T => {
  const record = strictRecordV1(value, Object.keys(expected), path);
  for (const [key, expectedValue] of Object.entries(expected)) {
    exactLiteralV1(record[key], expectedValue, `${path}.${key}`);
  }
  return structuredClone(expected);
};

const admissionDefinitionForPhaseV1 = (
  phase: unknown
): H1RuntimeCapabilityAdmissionDefinitionV1 => {
  if (phase === H1_RUNTIME_CAPABILITY_ADMISSION_V1.phase) {
    return H1_RUNTIME_CAPABILITY_ADMISSION_V1;
  }
  if (phase === H1_RUNTIME_CAPABILITY_ADMISSION_B2_V1.phase) {
    return H1_RUNTIME_CAPABILITY_ADMISSION_B2_V1;
  }
  throw new StrictJsonErrorV1(
    "invalid_enum",
    "h1CapabilityAdmission.phase",
    "Capability Admission phase is not installed."
  );
};

export const decodeH1RuntimeCapabilityAdmissionV1 = (
  value: unknown
): H1RuntimeCapabilityAdmissionRecordV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "admissionId",
      "phase",
      "status",
      "environment",
      "allowedEffect",
      "claimCeiling",
      "modelIdentity",
      "principalPolicy",
      "allowedTargets",
      "dataPolicy",
      "budgets",
      "rollback",
      "validity",
      "owner",
      "explicitHolds",
    ],
    "h1CapabilityAdmission"
  );
  const definition = admissionDefinitionForPhaseV1(record.phase);
  if (!Array.isArray(record.allowedTargets) || record.allowedTargets.length !== 2) {
    throw new StrictJsonErrorV1(
      "invalid_array",
      "h1CapabilityAdmission.allowedTargets",
      `${definition.phase} requires exactly two target records.`
    );
  }
  const allowedTargets = record.allowedTargets.map(decodeTargetV1);
  const targetIds = allowedTargets.map((target) => target.documentId);
  if (
    new Set(targetIds).size !== targetIds.length ||
    targetIds.some((value, index) =>
      index === 0 ? false : targetIds[index - 1]!.localeCompare(value) >= 0
    )
  ) {
    throw new StrictJsonErrorV1(
      "h1_capability_target_order_invalid",
      "h1CapabilityAdmission.allowedTargets",
      "Targets must be unique and sorted by documentId."
    );
  }
  const budgets = strictRecordV1(
    record.budgets,
    [
      "maxGrantUses",
      "maxToolCallsPerRun",
      "maxSnapshotBytes",
      "maxGrantTtlMs",
      "maxRunWallTimeMs",
      "paidModelCalls",
    ],
    "h1CapabilityAdmission.budgets"
  );
  const validity = strictRecordV1(
    record.validity,
    ["issuedAt", "expiresAt", "revocationMode"],
    "h1CapabilityAdmission.validity"
  );
  const issuedAt = requiredTimestampV1(
    validity.issuedAt,
    "h1CapabilityAdmission.validity.issuedAt"
  );
  const expiresAt = requiredTimestampV1(
    validity.expiresAt,
    "h1CapabilityAdmission.validity.expiresAt"
  );
  if (Date.parse(expiresAt) <= Date.parse(issuedAt)) {
    throw new StrictJsonErrorV1(
      "invalid_time_range",
      "h1CapabilityAdmission.validity",
      "Capability Admission must expire after issue."
    );
  }
  const owner = strictRecordV1(
    record.owner,
    [
      "harnessOwnerRef",
      "uxOwnerRef",
      "productOwnerRef",
      "approvalScope",
      "reviewRequiredBeforeExpansion",
    ],
    "h1CapabilityAdmission.owner"
  );
  if (!Array.isArray(record.explicitHolds)) {
    throw new StrictJsonErrorV1(
      "invalid_array",
      "h1CapabilityAdmission.explicitHolds",
      "Explicit HOLDs must be an exact array."
    );
  }
  if (
    record.explicitHolds.length !==
      definition.explicitHolds.length ||
    record.explicitHolds.some(
      (value, index) =>
        value !== definition.explicitHolds[index]
    )
  ) {
    throw new StrictJsonErrorV1(
      "h1_capability_holds_mismatch",
      "h1CapabilityAdmission.explicitHolds",
      `Explicit HOLDs differ from the frozen ${definition.phase} boundary.`
    );
  }
  return {
    contractVersion: exactLiteralV1(
      record.contractVersion,
      definition.contractVersion,
      "h1CapabilityAdmission.contractVersion"
    ),
    admissionId: requiredIdV1(
      record.admissionId,
      "h1CapabilityAdmission.admissionId"
    ),
    phase: exactLiteralV1(
      record.phase,
      definition.phase,
      "h1CapabilityAdmission.phase"
    ),
    status: exactLiteralV1(
      record.status,
      definition.status,
      "h1CapabilityAdmission.status"
    ),
    environment: exactLiteralV1(
      record.environment,
      definition.environment,
      "h1CapabilityAdmission.environment"
    ),
    allowedEffect: exactLiteralV1(
      record.allowedEffect,
      definition.allowedEffect,
      "h1CapabilityAdmission.allowedEffect"
    ),
    claimCeiling: exactLiteralV1(
      record.claimCeiling,
      definition.claimCeiling,
      "h1CapabilityAdmission.claimCeiling"
    ),
    modelIdentity: requiredModelIdentityV1(
      record.modelIdentity,
      "h1CapabilityAdmission.modelIdentity"
    ),
    principalPolicy: decodeExactPolicyV1(
      record.principalPolicy,
      definition.principalPolicy,
      "h1CapabilityAdmission.principalPolicy"
    ),
    allowedTargets,
    dataPolicy: decodeExactPolicyV1(
      record.dataPolicy,
      definition.dataPolicy,
      "h1CapabilityAdmission.dataPolicy"
    ),
    budgets: {
      maxGrantUses: exactIntegerV1(
        budgets.maxGrantUses,
        definition.budgets.maxGrantUses,
        "h1CapabilityAdmission.budgets.maxGrantUses"
      ),
      maxToolCallsPerRun: exactIntegerV1(
        budgets.maxToolCallsPerRun,
        definition.budgets.maxToolCallsPerRun,
        "h1CapabilityAdmission.budgets.maxToolCallsPerRun"
      ),
      maxSnapshotBytes: exactIntegerV1(
        budgets.maxSnapshotBytes,
        definition.budgets.maxSnapshotBytes,
        "h1CapabilityAdmission.budgets.maxSnapshotBytes"
      ),
      maxGrantTtlMs: exactIntegerV1(
        budgets.maxGrantTtlMs,
        definition.budgets.maxGrantTtlMs,
        "h1CapabilityAdmission.budgets.maxGrantTtlMs"
      ),
      maxRunWallTimeMs: exactIntegerV1(
        budgets.maxRunWallTimeMs,
        definition.budgets.maxRunWallTimeMs,
        "h1CapabilityAdmission.budgets.maxRunWallTimeMs"
      ),
      paidModelCalls: exactIntegerV1(
        budgets.paidModelCalls,
        definition.budgets.paidModelCalls,
        "h1CapabilityAdmission.budgets.paidModelCalls"
      ),
    },
    rollback: decodeExactPolicyV1(
      record.rollback,
      definition.rollback,
      "h1CapabilityAdmission.rollback"
    ),
    validity: {
      issuedAt,
      expiresAt,
      revocationMode: exactLiteralV1(
        validity.revocationMode,
        definition.validityRevocationMode,
        "h1CapabilityAdmission.validity.revocationMode"
      ),
    },
    owner: {
      harnessOwnerRef: exactLiteralV1(
        owner.harnessOwnerRef,
        definition.owner.harnessOwnerRef,
        "h1CapabilityAdmission.owner.harnessOwnerRef"
      ),
      uxOwnerRef: exactLiteralV1(
        owner.uxOwnerRef,
        definition.owner.uxOwnerRef,
        "h1CapabilityAdmission.owner.uxOwnerRef"
      ),
      productOwnerRef: exactLiteralV1(
        owner.productOwnerRef,
        definition.owner.productOwnerRef,
        "h1CapabilityAdmission.owner.productOwnerRef"
      ),
      approvalScope: exactLiteralV1(
        owner.approvalScope,
        definition.owner.approvalScope,
        "h1CapabilityAdmission.owner.approvalScope"
      ),
      reviewRequiredBeforeExpansion: exactBooleanV1(
        owner.reviewRequiredBeforeExpansion,
        true,
        "h1CapabilityAdmission.owner.reviewRequiredBeforeExpansion"
      ),
    },
    explicitHolds: structuredClone(
      definition.explicitHolds
    ),
  };
};

export const loadH1RuntimeCapabilityAdmissionV1 = (
  path: string
): LoadedH1RuntimeCapabilityAdmissionV1 => {
  const source = readFileSync(path, "utf8");
  let value: unknown;
  try {
    value = JSON.parse(source) as unknown;
  } catch {
    throw new StrictJsonErrorV1(
      "invalid_json",
      "h1CapabilityAdmission",
      "Capability Admission source is not valid JSON."
    );
  }
  const record = decodeH1RuntimeCapabilityAdmissionV1(value);
  return {
    record,
    admissionHash: hashCanonicalJsonV1(record),
    sourceHash: hashUtf8V1(source),
  };
};

const bindingWithoutHashV1 = (
  value: Omit<H1RuntimeCapabilityAdmissionBindingV1, "bindingHash">
) => value;

export const createH1RuntimeCapabilityAdmissionBindingV1 = (
  loaded: LoadedH1RuntimeCapabilityAdmissionV1
): H1RuntimeCapabilityAdmissionBindingV1 => {
  const material = bindingWithoutHashV1({
    contractVersion:
      H1_RUNTIME_CAPABILITY_ADMISSION_V1.bindingContractVersion,
    admissionId: requiredIdV1(
      loaded.record.admissionId,
      "h1CapabilityAdmissionBinding.admissionId"
    ),
    admissionHash: requiredHashV1(
      loaded.admissionHash,
      "h1CapabilityAdmissionBinding.admissionHash"
    ),
    sourceHash: requiredHashV1(
      loaded.sourceHash,
      "h1CapabilityAdmissionBinding.sourceHash"
    ),
    claimCeiling: loaded.record.claimCeiling,
  });
  return { ...material, bindingHash: hashCanonicalJsonV1(material) };
};

export const decodeH1RuntimeCapabilityAdmissionBindingV1 = (
  value: unknown
): H1RuntimeCapabilityAdmissionBindingV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "admissionId",
      "admissionHash",
      "sourceHash",
      "claimCeiling",
      "bindingHash",
    ],
    "h1CapabilityAdmissionBinding"
  );
  const claimCeiling = requiredStringV1(
    record.claimCeiling,
    "h1CapabilityAdmissionBinding.claimCeiling",
    120
  );
  if (
    claimCeiling !== H1_RUNTIME_CAPABILITY_ADMISSION_V1.claimCeiling &&
    claimCeiling !== H1_RUNTIME_CAPABILITY_ADMISSION_B2_V1.claimCeiling
  ) {
    throw new StrictJsonErrorV1(
      "invalid_enum",
      "h1CapabilityAdmissionBinding.claimCeiling",
      "Capability Admission claim ceiling is not installed."
    );
  }
  const material = bindingWithoutHashV1({
    contractVersion: exactLiteralV1(
      record.contractVersion,
      H1_RUNTIME_CAPABILITY_ADMISSION_V1.bindingContractVersion,
      "h1CapabilityAdmissionBinding.contractVersion"
    ),
    admissionId: requiredIdV1(
      record.admissionId,
      "h1CapabilityAdmissionBinding.admissionId"
    ),
    admissionHash: requiredHashV1(
      record.admissionHash,
      "h1CapabilityAdmissionBinding.admissionHash"
    ),
    sourceHash: requiredHashV1(
      record.sourceHash,
      "h1CapabilityAdmissionBinding.sourceHash"
    ),
    claimCeiling,
  });
  const bindingHash = requiredHashV1(
    record.bindingHash,
    "h1CapabilityAdmissionBinding.bindingHash"
  );
  if (bindingHash !== hashCanonicalJsonV1(material)) {
    throw new StrictJsonErrorV1(
      "hash_mismatch",
      "h1CapabilityAdmissionBinding.bindingHash",
      "Capability Admission binding hash differs."
    );
  }
  return { ...material, bindingHash };
};

export const assertH1RuntimeCapabilityAdmissionActiveV1 = (
  loaded: LoadedH1RuntimeCapabilityAdmissionV1,
  input: Readonly<{
    nowEpoch: number;
    modelIdentity: string;
  }>
) => {
  if (
    input.nowEpoch < Date.parse(loaded.record.validity.issuedAt) ||
    input.nowEpoch >= Date.parse(loaded.record.validity.expiresAt)
  ) {
    throw new StrictJsonErrorV1(
      "h1_capability_admission_expired",
      "h1CapabilityAdmission.validity",
      "Capability Admission is not currently active."
    );
  }
  if (
    requiredModelIdentityV1(
      input.modelIdentity,
      "h1CapabilityAdmission.runtimeModelIdentity"
    ) !== loaded.record.modelIdentity
  ) {
    throw new StrictJsonErrorV1(
      "h1_capability_model_identity_mismatch",
      "h1CapabilityAdmission.modelIdentity",
      "Runtime model identity differs from the admitted Actor."
    );
  }
  return loaded;
};

export const assertH1RuntimeCapabilityAdmissionTargetV1 = (
  loaded: LoadedH1RuntimeCapabilityAdmissionV1,
  input: Readonly<{
    tenantId: string;
    workspaceId: string;
    documentId: string;
    routePath?: string;
    captureProfile?: string;
    viewport?: string;
  }>
) => {
  const target = loaded.record.allowedTargets.find(
    (candidate) =>
      candidate.tenantId === input.tenantId &&
      candidate.workspaceId === input.workspaceId &&
      candidate.documentId === input.documentId
  );
  if (
    !target ||
    (input.routePath !== undefined && target.routePath !== input.routePath) ||
    (input.captureProfile !== undefined &&
      target.captureProfile !== input.captureProfile) ||
    (input.viewport !== undefined && target.viewport !== input.viewport)
  ) {
    throw new StrictJsonErrorV1(
      "h1_capability_target_not_admitted",
      "h1CapabilityAdmission.allowedTargets",
      "Requested H1 scope is outside the admitted local target set."
    );
  }
  return target;
};

export const assertH1RuntimeCapabilityBindingMatchesV1 = (
  binding: H1RuntimeCapabilityAdmissionBindingV1,
  loaded: LoadedH1RuntimeCapabilityAdmissionV1 | undefined
) => {
  const decoded = decodeH1RuntimeCapabilityAdmissionBindingV1(binding);
  if (!loaded) {
    throw new StrictJsonErrorV1(
      "h1_capability_admission_not_installed",
      "h1CapabilityAdmissionBinding",
      "The exact Capability Admission source is not installed."
    );
  }
  const expected = createH1RuntimeCapabilityAdmissionBindingV1(loaded);
  if (decoded.bindingHash !== expected.bindingHash) {
    throw new StrictJsonErrorV1(
      "h1_capability_admission_drift",
      "h1CapabilityAdmissionBinding",
      "Persisted Run authority differs from the installed Capability Admission."
    );
  }
  return decoded;
};
