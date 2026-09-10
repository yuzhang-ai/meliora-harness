/**
 * Browser-safe identity for the isolated E1 Editor loop.
 *
 * This is deliberately a new profile. The frozen R2 profile remains the
 * historical selection-read checkpoint and is never rewritten to impersonate
 * the integrated UX source tree.
 */
export const E1_LOCAL_SELECTION_READ_MODE_V1 = "e1-local-editor-loop";

export const E1_LOCAL_SELECTION_READ_TRANSPORT_V1 = Object.freeze({
  admissionResponseVersion:
    "formal-r3-e1-local-selection-read-admission-response-v1",
  reconcileResponseVersion:
    "formal-r3-e1-local-selection-read-reconcile-response-v1",
} as const);

export const E1_LOCAL_SELECTION_READ_SOURCE_V1 = Object.freeze({
  candidateContractVersion: "formal-r3-e1-ux-source-candidate-v1",
  candidateClaim: "source_candidate_not_runtime_admitted",
  sourceTag:
    "ai-landing-page-harness-ux-pre-batch7-integration-candidate-20260906",
  sourceCommit: "9c1ddb1361bcfc8eebad9ed6f1c88beae506a4f7",
  canonicalManifestHash:
    "d85ca7e764a7f55b1797ccd4ea8a22cabea50d9114dd14178d62526d56e9e40c",
  canonicalFilesHash:
    "3ac27382e3f24ee36789635e078debbd8e8457d789fcff4666a449f62b42b735",
  readbackSourceBlobOid: "5a3d849fe5ab4fbc9a2f8047a3c03f502bccaea2",
  fingerprintSourceBlobOid: "797ca5b983204b0e88aa65b39459032436c493d3",
} as const);

export const E1_LOCAL_SELECTION_READ_V1 = Object.freeze({
  profileId: "e1-atomic-acceptance-editor-selection-read-v1",
  mechanicsProfileId: "r2-atomic-acceptance-selection-read-v1",
  mechanicsCatalogEpoch: 2,
  toolId: "canvas_inspect",
  toolVersion: "r2-selection-c0-v1",
  requestVersion: "formal-r3-r2-selection-c0-request-v1",
  resultVersion: "formal-r3-r2-selection-c0-result-v1",
  sourceContractVersion: "editor-ux.atomic-canvas-readback.v1",
  sourceCommit: E1_LOCAL_SELECTION_READ_SOURCE_V1.sourceCommit,
  sourcePath:
    "zhangyu-workspace/AI落地页/demo/apps/demo/config/blocks/editor-kernel/atomic-canvas-readback.ts",
  sourceBlobOid: E1_LOCAL_SELECTION_READ_SOURCE_V1.readbackSourceBlobOid,
  fingerprintSourcePath:
    "zhangyu-workspace/AI落地页/demo/apps/demo/config/blocks/editor-kernel/atomic-document-version.ts",
  fingerprintSourceBlobOid:
    E1_LOCAL_SELECTION_READ_SOURCE_V1.fingerprintSourceBlobOid,
  browserPathname: "/custom-ui/atomic-acceptance/edit",
  routePath: "/atomic-acceptance",
  documentId: "path--atomic-acceptance",
  captureProfile: "r2-atomic-acceptance-selection-v1",
  pointerFingerprintAlgorithm: "canonical-json-fnv128-v1",
  admittedDevices: Object.freeze(["desktop", "tablet", "mobile"] as const),
  maxNodes: 256,
  maxDepth: 24,
  maxSelectedRefs: 1,
  maxNodeChildren: 256,
  readBudgetPerRun: 1,
  canvasWriteBudgetPerRun: 0,
  scope: "selection",
  environment: "development-local-isolated",
} as const);

/** The public flag is required by the browser bundle; the server/worker flag
 * is required by every authority-bearing process. A server process never
 * accepts the public flag as its sole authority switch. */
export const isE1LocalSelectionReadProfileEnabledV1 = () =>
  process.env.NODE_ENV === "development" &&
  (typeof window === "undefined"
    ? process.env.ZHIQU_LANDING_PAGE_HARNESS_E1_MODE ===
      E1_LOCAL_SELECTION_READ_MODE_V1
    : process.env
        .NEXT_PUBLIC_ZHIQU_LANDING_PAGE_HARNESS_E1_LOCAL_SELECTION_READ ===
      "1");
