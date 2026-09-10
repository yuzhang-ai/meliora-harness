import {
  browserAtomicFingerprintPort,
} from "../../../../config/blocks/editor-kernel/atomic-document-version";
import {
  decodeR2SelectionC0ReadbackV1,
  type R2SelectionC0IntegrityPortV1,
  type R2SelectionC0PointerV1,
  type R2SelectionC0ReadbackV1,
} from "./r2-selection-c0-contract";
import {
  R2_SELECTION_C0_HOST_OBSERVATION_V1,
  R2_SELECTION_C0_TURN_OBSERVATION_V1,
  R2_SELECTION_C0_V1,
  type R2SelectionC0DeviceV1,
} from "./r2-selection-c0-profile";
import {
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "./strict-json";

export type DecodedR2SelectionC0TurnObservationV1 = Readonly<{
  contractVersion: typeof R2_SELECTION_C0_TURN_OBSERVATION_V1.contractVersion;
  submitBinding: Readonly<{
    contractVersion: typeof R2_SELECTION_C0_TURN_OBSERVATION_V1.submitBindingVersion;
    requestId: string;
    envelopeId: string;
    workspaceId: string;
    sessionId: string;
    documentId: typeof R2_SELECTION_C0_V1.documentId;
    sourceThreadId: string | null;
  }>;
  hostObservation: Readonly<{
    contractVersion: typeof R2_SELECTION_C0_HOST_OBSERVATION_V1.contractVersion;
    browserPathname: typeof R2_SELECTION_C0_V1.browserPathname;
    routePath: typeof R2_SELECTION_C0_V1.routePath;
    documentId: typeof R2_SELECTION_C0_V1.documentId;
    captureProfile: typeof R2_SELECTION_C0_V1.captureProfile;
    capturedAt: string;
    mountId: string;
    device: R2SelectionC0DeviceV1;
    frameId: number;
    pointer: R2SelectionC0PointerV1;
    readbackHash: string;
    readback: R2SelectionC0ReadbackV1;
    selectedNodeRefs: readonly string[];
    consistencyFingerprintAlgorithm: typeof R2_SELECTION_C0_HOST_OBSERVATION_V1.consistencyFingerprintAlgorithm;
    consistencyFingerprint: string;
  }>;
}>;

export class R2SelectionC0TurnObservationErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "R2SelectionC0TurnObservationErrorV1";
  }
}

const fail = (code: string, message: string): never => {
  throw new R2SelectionC0TurnObservationErrorV1(code, message);
};

const integrityPort: R2SelectionC0IntegrityPortV1 = Object.freeze({
  contractVersion: R2_SELECTION_C0_V1.integrityPortVersion,
  sourceCommit: R2_SELECTION_C0_V1.sourceCommit,
  sourceContractVersion: R2_SELECTION_C0_V1.sourceContractVersion,
  sourceBlobOid: R2_SELECTION_C0_V1.sourceBlobOid,
  fingerprintSourceBlobOid: R2_SELECTION_C0_V1.fingerprintSourceBlobOid,
  fingerprintAlgorithm: R2_SELECTION_C0_V1.pointerFingerprintAlgorithm,
  verify: (payload, claimedHash) =>
    browserAtomicFingerprintPort.fingerprint(payload) === claimedHash,
});

const optionalId = (value: unknown, path: string) =>
  value === null ? null : requiredIdV1(value, path);

const safeInteger = (value: unknown, path: string) => {
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    return fail("r2_turn_observation_integer_invalid", `${path} is invalid.`);
  }
  return value as number;
};

const exactSelectedRefs = (value: unknown) => {
  if (
    !Array.isArray(value) ||
    value.length > R2_SELECTION_C0_V1.maxSelectedRefs
  ) {
    return fail(
      "r2_turn_observation_selection_invalid",
      "Host selection must contain zero or one node."
    );
  }
  const refs = value.map((entry, index) =>
    requiredIdV1(entry, `r2TurnObservation.hostObservation.selectedNodeRefs[${index}]`)
  );
  if (new Set(refs).size !== refs.length) {
    return fail(
      "r2_turn_observation_selection_invalid",
      "Host selection contains duplicate nodes."
    );
  }
  return Object.freeze(refs);
};

export const decodeR2SelectionC0TurnObservationV1 = (
  value: unknown
): DecodedR2SelectionC0TurnObservationV1 => {
  const root = strictRecordV1(
    value,
    ["contractVersion", "submitBinding", "hostObservation"],
    "r2TurnObservation"
  );
  if (
    root.contractVersion !==
    R2_SELECTION_C0_TURN_OBSERVATION_V1.contractVersion
  ) {
    return fail(
      "r2_turn_observation_version_invalid",
      "R2 Turn observation contract is not installed."
    );
  }
  const binding = strictRecordV1(
    root.submitBinding,
    [
      "contractVersion",
      "requestId",
      "envelopeId",
      "workspaceId",
      "sessionId",
      "documentId",
      "sourceThreadId",
    ],
    "r2TurnObservation.submitBinding"
  );
  if (
    binding.contractVersion !==
      R2_SELECTION_C0_TURN_OBSERVATION_V1.submitBindingVersion ||
    binding.documentId !== R2_SELECTION_C0_V1.documentId
  ) {
    return fail(
      "r2_turn_observation_binding_invalid",
      "R2 submit binding target is invalid."
    );
  }
  const host = strictRecordV1(
    root.hostObservation,
    [
      "browserPathname",
      "captureProfile",
      "capturedAt",
      "consistencyFingerprint",
      "consistencyFingerprintAlgorithm",
      "contractVersion",
      "device",
      "documentId",
      "frameId",
      "mountId",
      "pointer",
      "readback",
      "readbackHash",
      "routePath",
      "selectedNodeRefs",
    ],
    "r2TurnObservation.hostObservation"
  );
  if (
    host.contractVersion !==
      R2_SELECTION_C0_HOST_OBSERVATION_V1.contractVersion ||
    host.browserPathname !== R2_SELECTION_C0_V1.browserPathname ||
    host.routePath !== R2_SELECTION_C0_V1.routePath ||
    host.documentId !== R2_SELECTION_C0_V1.documentId ||
    host.captureProfile !== R2_SELECTION_C0_V1.captureProfile ||
    host.consistencyFingerprintAlgorithm !==
      R2_SELECTION_C0_HOST_OBSERVATION_V1.consistencyFingerprintAlgorithm ||
    !R2_SELECTION_C0_V1.admittedDevices.includes(
      host.device as R2SelectionC0DeviceV1
    )
  ) {
    return fail(
      "r2_turn_observation_host_target_invalid",
      "R2 Host observation target or profile is invalid."
    );
  }
  const capturedAt = requiredTimestampV1(
    host.capturedAt,
    "r2TurnObservation.hostObservation.capturedAt"
  );
  const mountId = requiredRuntimeMountIdV1(
    host.mountId,
    "r2TurnObservation.hostObservation.mountId"
  );
  const device = host.device as R2SelectionC0DeviceV1;
  const frameId = safeInteger(
    host.frameId,
    "r2TurnObservation.hostObservation.frameId"
  );
  const readbackHash = requiredStringV1(
    host.readbackHash,
    "r2TurnObservation.hostObservation.readbackHash",
    240
  );
  const pointerRecord = strictRecordV1(
    host.pointer,
    ["revision", "atomicFingerprint", "fingerprintAlgorithm"],
    "r2TurnObservation.hostObservation.pointer"
  );
  const pointer = {
    revision: safeInteger(
      pointerRecord.revision,
      "r2TurnObservation.hostObservation.pointer.revision"
    ),
    atomicFingerprint: requiredStringV1(
      pointerRecord.atomicFingerprint,
      "r2TurnObservation.hostObservation.pointer.atomicFingerprint",
      240
    ),
    fingerprintAlgorithm: pointerRecord.fingerprintAlgorithm,
  } as R2SelectionC0PointerV1;
  if (
    pointer.fingerprintAlgorithm !==
    R2_SELECTION_C0_V1.pointerFingerprintAlgorithm
  ) {
    return fail(
      "r2_turn_observation_pointer_invalid",
      "R2 Host pointer algorithm is invalid."
    );
  }
  const readback = decodeR2SelectionC0ReadbackV1(
    host.readback,
    integrityPort,
    { device, frameId, pointer, readbackHash }
  );
  const selectedNodeRefs = exactSelectedRefs(host.selectedNodeRefs);
  const nodeIds = new Set(readback.structure.preorderIds);
  if (selectedNodeRefs.some((nodeRef) => !nodeIds.has(nodeRef))) {
    return fail(
      "r2_turn_observation_selection_unknown",
      "R2 Host selection is outside the exact C0 readback."
    );
  }
  const consistencyMaterial = {
    browserPathname: R2_SELECTION_C0_V1.browserPathname,
    captureProfile: R2_SELECTION_C0_V1.captureProfile,
    capturedAt,
    consistencyFingerprintAlgorithm:
      R2_SELECTION_C0_HOST_OBSERVATION_V1.consistencyFingerprintAlgorithm,
    contractVersion: R2_SELECTION_C0_HOST_OBSERVATION_V1.contractVersion,
    device,
    documentId: R2_SELECTION_C0_V1.documentId,
    frameId,
    mountId,
    pointer,
    readback,
    readbackHash,
    routePath: R2_SELECTION_C0_V1.routePath,
    selectedNodeRefs,
  } as const;
  const consistencyFingerprint = requiredStringV1(
    host.consistencyFingerprint,
    "r2TurnObservation.hostObservation.consistencyFingerprint",
    240
  );
  if (
    browserAtomicFingerprintPort.fingerprint(consistencyMaterial) !==
    consistencyFingerprint
  ) {
    return fail(
      "r2_turn_observation_consistency_mismatch",
      "R2 Host observation consistency fingerprint does not match."
    );
  }
  return Object.freeze({
    contractVersion: R2_SELECTION_C0_TURN_OBSERVATION_V1.contractVersion,
    submitBinding: Object.freeze({
      contractVersion:
        R2_SELECTION_C0_TURN_OBSERVATION_V1.submitBindingVersion,
      requestId: requiredIdV1(binding.requestId, "r2TurnObservation.submitBinding.requestId"),
      envelopeId: requiredIdV1(binding.envelopeId, "r2TurnObservation.submitBinding.envelopeId"),
      workspaceId: requiredIdV1(binding.workspaceId, "r2TurnObservation.submitBinding.workspaceId"),
      sessionId: requiredIdV1(binding.sessionId, "r2TurnObservation.submitBinding.sessionId"),
      documentId: R2_SELECTION_C0_V1.documentId,
      sourceThreadId: optionalId(binding.sourceThreadId, "r2TurnObservation.submitBinding.sourceThreadId"),
    }),
    hostObservation: Object.freeze({
      ...consistencyMaterial,
      readback,
      consistencyFingerprint,
    }),
  });
};

export const assertR2SelectionC0TurnObservationMatchesRequestV1 = (
  observation: DecodedR2SelectionC0TurnObservationV1,
  input: Readonly<{
    requestId: string;
    envelopeId: string;
    workspaceId: string;
    sessionId: string;
    documentId: string;
    threadId?: string;
  }>
) => {
  const binding = observation.submitBinding;
  if (
    binding.requestId !== input.requestId ||
    binding.envelopeId !== input.envelopeId ||
    binding.workspaceId !== input.workspaceId ||
    binding.sessionId !== input.sessionId ||
    binding.documentId !== input.documentId ||
    binding.sourceThreadId !== (input.threadId ?? null)
  ) {
    return fail(
      "r2_turn_observation_request_binding_mismatch",
      "R2 Host observation is not bound to the exact submitted request."
    );
  }
  return observation;
};
