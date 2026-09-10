/** Browser-safe immutable profile shared by the UX Host seam and server. */
export const R2_SELECTION_C0_V1 = Object.freeze({
  profileId: "r2-atomic-acceptance-selection-read-v1",
  catalogEpoch: 1,
  toolId: "canvas_inspect",
  toolVersion: "r2-selection-c0-v1",
  requestVersion: "formal-r3-r2-selection-c0-request-v1",
  resultVersion: "formal-r3-r2-selection-c0-result-v1",
  selectionBindingVersion: "formal-r3-r2-selection-c0-binding-v1",
  integrityPortVersion: "formal-r3-r2-c0-integrity-port-v1",
  sourceContractVersion: "editor-ux.atomic-canvas-readback.v1",
  sourceCommit: "da424d161ce453090313c8898ad5aaf6b11bc709",
  sourcePath:
    "zhangyu-workspace/AI落地页/demo/apps/demo/config/blocks/editor-kernel/atomic-canvas-readback.ts",
  sourceBlobOid: "5a3d849fe5ab4fbc9a2f8047a3c03f502bccaea2",
  fingerprintSourcePath:
    "zhangyu-workspace/AI落地页/demo/apps/demo/config/blocks/editor-kernel/atomic-document-version.ts",
  fingerprintSourceBlobOid: "172e589f2ce6fdd5a408483bfc65c94e44f3fa8b",
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
} as const);

export const R2_SELECTION_C0_HOST_OBSERVATION_V1 = Object.freeze({
  contractVersion: "formal-r3-r2-selection-c0-host-observation-v1",
  consistencyFingerprintAlgorithm: "canonical-json-fnv128-v1",
} as const);

export const R2_SELECTION_C0_TURN_OBSERVATION_V1 = Object.freeze({
  contractVersion: "formal-r3-r2-selection-c0-turn-observation-v1",
  submitBindingVersion: "formal-r3-r2-selection-c0-submit-binding-v1",
} as const);

export const R2_SELECTION_C0_ATOM_TYPES_V1 = Object.freeze([
  "BlankCanvas",
  "ContainerElement",
  "TextBox",
  "ImageElement",
  "VideoElement",
  "ShapeElement",
  "IconElement",
] as const);

export type R2SelectionC0DeviceV1 =
  (typeof R2_SELECTION_C0_V1.admittedDevices)[number];
export type R2SelectionC0AtomTypeV1 =
  (typeof R2_SELECTION_C0_ATOM_TYPES_V1)[number];
