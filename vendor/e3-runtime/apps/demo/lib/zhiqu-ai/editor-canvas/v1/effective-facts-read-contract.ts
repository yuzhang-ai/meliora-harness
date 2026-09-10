import { decodeJsonValueV1, type JsonValueV1 } from "../../canvas-runtime/v1/canvas-port";
import { hashCanonicalV1 } from "../../canvas-runtime/v1/store-contracts";
import {
  requiredHashV1,
  requiredIdV1,
  requiredRuntimeMountIdV1,
  requiredStringV1,
  requiredTimestampV1,
  strictRecordV1,
} from "../../landing-page-harness/v1/strict-json";

export const UX_EFFECTIVE_FACTS_READ_V1 = Object.freeze({
  contractVersion: "ux-effective-facts-snapshot-v1",
  providerId: "canvas-studio-effective-facts-read-v1",
  providerVersion: "0.2.0",
  providerBindingVersion: "formal-r3-editor-ux-p1-55ff2e53",
  effectiveFactsSchemaVersion: "seven-atom-effective-facts-v1",
  maxNodes: 256,
  maxDepth: 24,
  maxFieldsPerNode: 160,
  maxSelectionRefs: 32,
  maxFieldPath: 200,
  maxReason: 320,
  installationStatus: "ux_adapter_candidate_not_registered",
} as const);

export const UX_EFFECTIVE_FACTS_CAPTURE_PROFILES_V1 = [
  "h1-empty-page-r1",
  "h1-container-layout-r1",
  "h1-seven-atomic-r1",
  "h1-dirty-page-r1",
] as const;

export type UxEffectiveFactsCaptureProfileV1 =
  (typeof UX_EFFECTIVE_FACTS_CAPTURE_PROFILES_V1)[number];

export const UX_EFFECTIVE_FACTS_CAPTURE_PROFILE_MATRIX_V1 = Object.freeze({
  "h1-empty-page-r1": {
    routePath: "/edit",
    pageClass: "empty_seven_atom_page",
    admittedViewports: ["desktop"],
    status: "contract_pending_renderer_oracle",
  },
  "h1-container-layout-r1": {
    routePath: "/container-acceptance",
    pageClass: "container_layout_seven_atom_page",
    admittedViewports: ["desktop"],
    status: "contract_pending_renderer_oracle",
  },
  "h1-seven-atomic-r1": {
    routePath: "/atomic-acceptance",
    pageClass: "mixed_seven_atom_page",
    admittedViewports: ["desktop"],
    status: "contract_pending_renderer_oracle",
  },
  "h1-dirty-page-r1": {
    routePath: "/edit",
    pageClass: "unsaved_user_edited_seven_atom_page",
    admittedViewports: ["desktop"],
    status: "contract_pending_renderer_oracle",
  },
} as const);

export const UX_EFFECTIVE_FACTS_ATOM_TYPES_V1 = [
  "BlankCanvas",
  "ContainerElement",
  "TextBox",
  "ImageElement",
  "VideoElement",
  "ShapeElement",
  "IconElement",
] as const;

export type UxEffectiveFactsAtomTypeV1 =
  (typeof UX_EFFECTIVE_FACTS_ATOM_TYPES_V1)[number];

export const UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1 = Object.freeze({
  identity: "puck_app_store_same_read",
  authored: "atomic_page_fact_allowlist",
  defaults: "ux_component_default_props",
  parentPlacement: "ux_layout_item_resolver",
  ownLayout: "ux_atomic_layout_capability_resolver",
  geometry: "ux_renderer_geometry_resolver",
  surface: "ux_renderer_surface_resolver",
  typography: "ux_renderer_text_resolver",
  media: "ux_renderer_media_resolver",
  unavailable: "ux_effective_facts_unavailable",
  unsupported: "ux_effective_facts_unsupported",
} as const);

export type UxEffectiveFactsFieldSourceV1 =
  (typeof UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1)[keyof typeof UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1];

export const UX_EFFECTIVE_FACTS_AVAILABLE_FIELD_SOURCE_MATRIX_V1 = Object.freeze({
  identity: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.identity,
  authored: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.authored,
  defaults: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.defaults,
  "layout.parentPlacement": UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.parentPlacement,
  "layout.own": UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.ownLayout,
  geometry: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.geometry,
  surface: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.surface,
  typography: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.typography,
  media: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.media,
} as const);

type UxEffectiveFactsFieldManifestEntryV1 = Readonly<{
  atomType: UxEffectiveFactsAtomTypeV1;
  path: string;
  availableSource: UxEffectiveFactsFieldSourceV1;
  allowedStates: readonly ("available" | "unavailable" | "unsupported")[];
  reasonCodes: readonly string[];
  valueSchema:
    | "container_frame_height_v1"
    | "layout_mode_v1"
    | "size_mode_v1"
    | "surface_fill_summary_v1"
    | "text_v1"
    | "unsupported_v1";
}>;

/** H1-0 deliberately freezes only a narrow common-field seed. H1-1 must
 * extend this exact manifest from UX-owned Renderer oracles before a field can
 * be exposed; unknown atom/path pairs fail closed. */
export const UX_EFFECTIVE_FACTS_FIELD_MANIFEST_V1 = Object.freeze([
  {
    atomType: "BlankCanvas",
    path: "layout.own.mode",
    availableSource: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.ownLayout,
    allowedStates: ["available"],
    reasonCodes: [],
    valueSchema: "layout_mode_v1",
  },
  {
    atomType: "BlankCanvas",
    path: "surface.fill",
    availableSource: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.surface,
    allowedStates: ["available", "unavailable", "unsupported"],
    reasonCodes: ["renderer_surface_unmeasured", "surface_outside_atomic_contract"],
    valueSchema: "surface_fill_summary_v1",
  },
  {
    atomType: "ContainerElement",
    path: "geometry.frame.height",
    availableSource: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.geometry,
    allowedStates: ["available", "unavailable"],
    reasonCodes: ["renderer_geometry_unmeasured"],
    valueSchema: "container_frame_height_v1",
  },
  {
    atomType: "ContainerElement",
    path: "layout.parentPlacement.heightMode",
    availableSource: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.parentPlacement,
    allowedStates: ["available"],
    reasonCodes: [],
    valueSchema: "size_mode_v1",
  },
  {
    atomType: "TextBox",
    path: "authored.text",
    availableSource: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.authored,
    allowedStates: ["available"],
    reasonCodes: [],
    valueSchema: "text_v1",
  },
  {
    atomType: "TextBox",
    path: "typography.richText",
    availableSource: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.typography,
    allowedStates: ["unsupported"],
    reasonCodes: ["rich_text_outside_atomic_contract"],
    valueSchema: "unsupported_v1",
  },
] as const satisfies readonly UxEffectiveFactsFieldManifestEntryV1[]);

export type UxEffectiveFieldFactV1 =
  | Readonly<{
      path: string;
      state: "available";
      source: UxEffectiveFactsFieldSourceV1;
      value: JsonValueV1;
    }>
  | Readonly<{
      path: string;
      state: "unavailable" | "unsupported";
      source: UxEffectiveFactsFieldSourceV1;
      reasonCode: string;
    }>;

export type UxEffectiveFactsNodeV1 = Readonly<{
  nodeRef: string;
  atomType: UxEffectiveFactsAtomTypeV1;
  parentRef: string | null;
  childRefs: readonly string[];
  depth: number;
  fields: readonly UxEffectiveFieldFactV1[];
}>;

export type UxEffectiveFactsRevisionV1 = Readonly<{
  contractVersion: "ux-effective-facts-revision-v1";
  owner: "puck_history_store";
  historyIndex: number;
  historyLength: number;
  historyEntryId: string;
  historyFingerprint: string;
  dataFingerprint: string;
}>;

export type UxEffectiveFactsSnapshotV1 = Readonly<{
  contractVersion: typeof UX_EFFECTIVE_FACTS_READ_V1.contractVersion;
  providerId: typeof UX_EFFECTIVE_FACTS_READ_V1.providerId;
  providerVersion: typeof UX_EFFECTIVE_FACTS_READ_V1.providerVersion;
  providerBindingVersion: typeof UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion;
  effectiveFactsSchemaVersion: typeof UX_EFFECTIVE_FACTS_READ_V1.effectiveFactsSchemaVersion;
  capabilityFingerprint: string;
  captureProfile: UxEffectiveFactsCaptureProfileV1;
  routePath: string;
  documentId: string;
  mountId: string;
  viewport: "desktop" | "tablet" | "mobile";
  observedAt: string;
  revision: UxEffectiveFactsRevisionV1;
  rawDataFingerprint: string;
  effectiveFactsFingerprint: string;
  rootNodeRefs: readonly string[];
  selection: Readonly<{ nodeRefs: readonly string[] }>;
  nodes: readonly UxEffectiveFactsNodeV1[];
}>;

export class UxEffectiveFactsContractErrorV1 extends Error {
  constructor(readonly code: string, readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = "UxEffectiveFactsContractErrorV1";
  }
}

const atomTypes = new Set<string>(UX_EFFECTIVE_FACTS_ATOM_TYPES_V1);
const captureProfiles = new Set<string>(UX_EFFECTIVE_FACTS_CAPTURE_PROFILES_V1);
const fieldSources = new Set<string>(Object.values(UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1));
const availableFieldSources = Object.entries(
  UX_EFFECTIVE_FACTS_AVAILABLE_FIELD_SOURCE_MATRIX_V1
).sort(([left], [right]) => right.length - left.length);
const canOwnChildren = new Set<UxEffectiveFactsAtomTypeV1>([
  "BlankCanvas",
  "ContainerElement",
]);
const canonicalCompare = (left: string, right: string) =>
  left < right ? -1 : left > right ? 1 : 0;

const exactArray = (value: unknown, path: string, max: number) => {
  if (
    !Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Array.prototype ||
    value.length > max
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_array_invalid",
      path,
      `Expected a dense array with at most ${max} entries.`
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.prototype.hasOwnProperty.call(value, index)) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_array_invalid",
        `${path}[${index}]`,
        "Sparse arrays are not allowed."
      );
    }
  }
  return value;
};

const uniqueIds = (value: unknown, path: string, max: number) => {
  const items = exactArray(value, path, max).map((item, index) =>
    requiredIdV1(item, `${path}[${index}]`)
  );
  if (new Set(items).size !== items.length) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_duplicate_ref",
      path,
      "Node refs must be unique."
    );
  }
  return items;
};

const decodeRevision = (value: unknown): UxEffectiveFactsRevisionV1 => {
  const path = "effectiveFactsSnapshot.revision";
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "owner",
      "historyIndex",
      "historyLength",
      "historyEntryId",
      "historyFingerprint",
      "dataFingerprint",
    ],
    path
  );
  if (
    record.contractVersion !== "ux-effective-facts-revision-v1" ||
    record.owner !== "puck_history_store"
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_revision_owner_invalid",
      path,
      "Revision must be owned by the current Puck history store."
    );
  }
  if (
    !Number.isInteger(record.historyIndex) ||
    !Number.isInteger(record.historyLength) ||
    (record.historyIndex as number) < 0 ||
    (record.historyLength as number) < 1 ||
    (record.historyIndex as number) >= (record.historyLength as number) ||
    (record.historyLength as number) > 1_000_000
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_revision_invalid",
      path,
      "History index and length do not form a current Store revision."
    );
  }
  return {
    contractVersion: "ux-effective-facts-revision-v1",
    owner: "puck_history_store",
    historyIndex: record.historyIndex as number,
    historyLength: record.historyLength as number,
    historyEntryId: requiredIdV1(
      record.historyEntryId,
      `${path}.historyEntryId`
    ),
    historyFingerprint: requiredHashV1(
      record.historyFingerprint,
      `${path}.historyFingerprint`
    ),
    dataFingerprint: requiredHashV1(
      record.dataFingerprint,
      `${path}.dataFingerprint`
    ),
  };
};

const fieldPath = (value: unknown, path: string) => {
  const text = requiredStringV1(value, path, UX_EFFECTIVE_FACTS_READ_V1.maxFieldPath);
  if (
    text !== text.trim() ||
    !/^[a-z][a-zA-Z0-9]*(?:\.[a-z][a-zA-Z0-9]*)*$/u.test(text)
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_field_path_invalid",
      path,
      "Field path must be a canonical dotted identifier."
    );
  }
  return text;
};

const decodeManifestedFieldValue = (
  value: JsonValueV1,
  schema: UxEffectiveFactsFieldManifestEntryV1["valueSchema"],
  path: string
): JsonValueV1 => {
  if (schema === "text_v1") {
    if (typeof value !== "string") {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_value_schema_invalid",
        path,
        "Text facts require a string."
      );
    }
    return value;
  }
  if (schema === "layout_mode_v1") {
    if (!["free", "horizontal", "vertical", "grid"].includes(String(value))) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_value_schema_invalid",
        path,
        "Layout mode is outside the UX resolver enum."
      );
    }
    return value;
  }
  if (schema === "size_mode_v1") {
    if (!["fixed", "hug", "fill"].includes(String(value))) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_value_schema_invalid",
        path,
        "Size mode is outside the UX layout item enum."
      );
    }
    return value;
  }
  if (schema === "container_frame_height_v1") {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_value_schema_invalid",
        path,
        "Renderer frame height requires a finite non-negative number."
      );
    }
    return value;
  }
  if (schema === "surface_fill_summary_v1") {
    const expectedKeys = ["color", "enabled", "mode", "opacity"];
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_value_schema_invalid",
        path,
        "Surface fill summary requires an exact object."
      );
    }
    const record = value as Record<string, JsonValueV1>;
    const actualKeys = Object.keys(record).sort();
    if (
      actualKeys.length !== expectedKeys.length ||
      actualKeys.some((key, index) => key !== expectedKeys[index]) ||
      !["angular", "diamond", "image", "linear", "radial", "solid"].includes(
        String(record.mode)
      ) ||
      typeof record.color !== "string" ||
      !record.color ||
      typeof record.enabled !== "boolean" ||
      typeof record.opacity !== "number" ||
      !Number.isFinite(record.opacity) ||
      record.opacity < 0 ||
      record.opacity > 100
    ) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_value_schema_invalid",
        path,
        "Surface fill summary does not match the exact UX schema."
      );
    }
    return {
      mode: record.mode as string,
      color: record.color,
      enabled: record.enabled,
      opacity: record.opacity,
    } as JsonValueV1;
  }
  throw new UxEffectiveFactsContractErrorV1(
    "effective_facts_value_schema_invalid",
    path,
    "Unsupported fields cannot carry an available value."
  );
};

const decodeField = (
  value: unknown,
  path: string,
  atomType: UxEffectiveFactsAtomTypeV1
): UxEffectiveFieldFactV1 => {
  const loose = value as Record<string, unknown> | null;
  const state = loose?.state;
  const record = strictRecordV1(
    value,
    state === "available"
      ? ["path", "state", "source", "value"]
      : ["path", "state", "source", "reasonCode"],
    path
  );
  const source = requiredStringV1(record.source, `${path}.source`, 96);
  if (!fieldSources.has(source)) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_source_invalid",
      `${path}.source`,
      "Field source is not in the frozen source matrix."
    );
  }
  const decodedPath = fieldPath(record.path, `${path}.path`);
  const manifest = UX_EFFECTIVE_FACTS_FIELD_MANIFEST_V1.find(
    (item) => item.atomType === atomType && item.path === decodedPath
  );
  if (!manifest) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_field_not_manifested",
      `${path}.path`,
      "Atom and field path are absent from the frozen H1 manifest."
    );
  }
  if (
    state !== "available" &&
    state !== "unavailable" &&
    state !== "unsupported"
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_state_invalid",
      `${path}.state`,
      "Field state must be available, unavailable, or unsupported."
    );
  }
  if (!(manifest.allowedStates as readonly string[]).includes(state)) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_state_not_manifested",
      `${path}.state`,
      "Field state is not admitted for this atom/path pair."
    );
  }
  if (state === "available") {
    const expectedSource = availableFieldSources.find(
      ([namespace]) =>
        decodedPath === namespace || decodedPath.startsWith(`${namespace}.`)
    )?.[1];
    if (
      !expectedSource ||
      source !== expectedSource ||
      source !== manifest.availableSource
    ) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_available_source_mismatch",
        `${path}.source`,
        "Available field source does not match its frozen path namespace."
      );
    }
    const decodedValue = decodeJsonValueV1(record.value, `${path}.value`);
    return {
      path: decodedPath,
      state,
      source: source as UxEffectiveFactsFieldSourceV1,
      value: decodeManifestedFieldValue(
        decodedValue,
        manifest.valueSchema,
        `${path}.value`
      ),
    };
  }
  const requiredSource =
    state === "unavailable"
      ? UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.unavailable
      : UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1.unsupported;
  if (source !== requiredSource) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_state_source_mismatch",
      `${path}.source`,
      `${state} fields must use their matching source identity.`
    );
  }
  const reasonCode = requiredIdV1(record.reasonCode, `${path}.reasonCode`);
  if (!(manifest.reasonCodes as readonly string[]).includes(reasonCode)) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_reason_not_manifested",
      `${path}.reasonCode`,
      "Reason code is not admitted for this atom/path pair."
    );
  }
  return {
    path: decodedPath,
    state,
    source: source as UxEffectiveFactsFieldSourceV1,
    reasonCode,
  };
};

const decodeNode = (value: unknown, path: string): UxEffectiveFactsNodeV1 => {
  const record = strictRecordV1(
    value,
    ["nodeRef", "atomType", "parentRef", "childRefs", "depth", "fields"],
    path
  );
  const atomType = requiredStringV1(record.atomType, `${path}.atomType`, 40);
  if (!atomTypes.has(atomType)) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_atom_type_invalid",
      `${path}.atomType`,
      "Only the seven frozen atomic types are accepted."
    );
  }
  if (
    !Number.isInteger(record.depth) ||
    (record.depth as number) < 0 ||
    (record.depth as number) > UX_EFFECTIVE_FACTS_READ_V1.maxDepth
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_depth_invalid",
      `${path}.depth`,
      "Node depth is outside the H1 budget."
    );
  }
  const typedAtomType = atomType as UxEffectiveFactsAtomTypeV1;
  const fields = exactArray(
    record.fields,
    `${path}.fields`,
    UX_EFFECTIVE_FACTS_READ_V1.maxFieldsPerNode
  ).map((item, index) =>
    decodeField(item, `${path}.fields[${index}]`, typedAtomType)
  );
  const fieldPaths = fields.map((field) => field.path);
  if (
    fieldPaths.some(
      (field, index) =>
        index > 0 && canonicalCompare(fieldPaths[index - 1]!, field) >= 0
    )
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_field_order_invalid",
      `${path}.fields`,
      "Fields must be unique and sorted by canonical path."
    );
  }
  return {
    nodeRef: requiredIdV1(record.nodeRef, `${path}.nodeRef`),
    atomType: typedAtomType,
    parentRef:
      record.parentRef === null
        ? null
        : requiredIdV1(record.parentRef, `${path}.parentRef`),
    childRefs: uniqueIds(
      record.childRefs,
      `${path}.childRefs`,
      UX_EFFECTIVE_FACTS_READ_V1.maxNodes
    ),
    depth: record.depth as number,
    fields,
  };
};

export const UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1 = hashCanonicalV1({
  contractVersion: UX_EFFECTIVE_FACTS_READ_V1.contractVersion,
  providerId: UX_EFFECTIVE_FACTS_READ_V1.providerId,
  providerVersion: UX_EFFECTIVE_FACTS_READ_V1.providerVersion,
  providerBindingVersion: UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion,
  effectiveFactsSchemaVersion: UX_EFFECTIVE_FACTS_READ_V1.effectiveFactsSchemaVersion,
  atomTypes: UX_EFFECTIVE_FACTS_ATOM_TYPES_V1,
  captureProfiles: UX_EFFECTIVE_FACTS_CAPTURE_PROFILES_V1,
  captureProfileMatrix: UX_EFFECTIVE_FACTS_CAPTURE_PROFILE_MATRIX_V1,
  fieldSources: UX_EFFECTIVE_FACTS_FIELD_SOURCES_V1,
  availableFieldSourceMatrix:
    UX_EFFECTIVE_FACTS_AVAILABLE_FIELD_SOURCE_MATRIX_V1,
  fieldManifest: UX_EFFECTIVE_FACTS_FIELD_MANIFEST_V1,
});

const effectiveFingerprintMaterial = (
  snapshot: Omit<UxEffectiveFactsSnapshotV1, "effectiveFactsFingerprint">
) => ({
  capabilityFingerprint: snapshot.capabilityFingerprint,
  captureProfile: snapshot.captureProfile,
  routePath: snapshot.routePath,
  documentId: snapshot.documentId,
  mountId: snapshot.mountId,
  viewport: snapshot.viewport,
  observedAt: snapshot.observedAt,
  revision: snapshot.revision,
  rawDataFingerprint: snapshot.rawDataFingerprint,
  rootNodeRefs: snapshot.rootNodeRefs,
  selection: snapshot.selection,
  nodes: snapshot.nodes,
});

export const hashUxEffectiveFactsSnapshotV1 = (
  snapshot: Omit<UxEffectiveFactsSnapshotV1, "effectiveFactsFingerprint">
) => hashCanonicalV1(effectiveFingerprintMaterial(snapshot));

export const decodeUxEffectiveFactsSnapshotV1 = (
  value: unknown
): UxEffectiveFactsSnapshotV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "providerId",
      "providerVersion",
      "providerBindingVersion",
      "effectiveFactsSchemaVersion",
      "capabilityFingerprint",
      "captureProfile",
      "routePath",
      "documentId",
      "mountId",
      "viewport",
      "observedAt",
      "revision",
      "rawDataFingerprint",
      "effectiveFactsFingerprint",
      "rootNodeRefs",
      "selection",
      "nodes",
    ],
    "effectiveFactsSnapshot"
  );
  if (
    record.contractVersion !== UX_EFFECTIVE_FACTS_READ_V1.contractVersion ||
    record.providerId !== UX_EFFECTIVE_FACTS_READ_V1.providerId ||
    record.providerVersion !== UX_EFFECTIVE_FACTS_READ_V1.providerVersion ||
    record.providerBindingVersion !==
      UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion ||
    record.effectiveFactsSchemaVersion !==
      UX_EFFECTIVE_FACTS_READ_V1.effectiveFactsSchemaVersion
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_contract_mismatch",
      "effectiveFactsSnapshot",
      "Provider or schema identity drifted."
    );
  }
  const capabilityFingerprint = requiredHashV1(
    record.capabilityFingerprint,
    "effectiveFactsSnapshot.capabilityFingerprint"
  );
  if (capabilityFingerprint !== UX_EFFECTIVE_FACTS_CAPABILITY_FINGERPRINT_V1) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_capability_mismatch",
      "effectiveFactsSnapshot.capabilityFingerprint",
      "Capability fingerprint does not match the installed contract."
    );
  }
  const captureProfile = requiredStringV1(
    record.captureProfile,
    "effectiveFactsSnapshot.captureProfile",
    80
  );
  if (!captureProfiles.has(captureProfile)) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_profile_invalid",
      "effectiveFactsSnapshot.captureProfile",
      "Capture profile is not admitted."
    );
  }
  const routePath = requiredStringV1(
    record.routePath,
    "effectiveFactsSnapshot.routePath",
    512
  );
  if (!/^\/[a-z0-9/_-]*$/u.test(routePath)) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_route_invalid",
      "effectiveFactsSnapshot.routePath",
      "Route must be a normalized path without query or fragment."
    );
  }
  const profile =
    UX_EFFECTIVE_FACTS_CAPTURE_PROFILE_MATRIX_V1[
      captureProfile as UxEffectiveFactsCaptureProfileV1
    ];
  if (routePath !== profile.routePath) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_profile_route_mismatch",
      "effectiveFactsSnapshot.routePath",
      "Route does not match the frozen capture profile."
    );
  }
  if (
    record.viewport !== "desktop" &&
    record.viewport !== "tablet" &&
    record.viewport !== "mobile"
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_viewport_invalid",
      "effectiveFactsSnapshot.viewport",
      "Viewport is invalid."
    );
  }
  if (!profile.admittedViewports.includes(record.viewport as "desktop")) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_profile_viewport_mismatch",
      "effectiveFactsSnapshot.viewport",
      "Viewport is not admitted by the capture profile."
    );
  }
  const selection = strictRecordV1(
    record.selection,
    ["nodeRefs"],
    "effectiveFactsSnapshot.selection"
  );
  const nodes = exactArray(
    record.nodes,
    "effectiveFactsSnapshot.nodes",
    UX_EFFECTIVE_FACTS_READ_V1.maxNodes
  ).map((item, index) => decodeNode(item, `effectiveFactsSnapshot.nodes[${index}]`));
  const refs = nodes.map((node) => node.nodeRef);
  if (
    refs.some(
      (ref, index) =>
        index > 0 && canonicalCompare(refs[index - 1]!, ref) >= 0
    )
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_node_order_invalid",
      "effectiveFactsSnapshot.nodes",
      "Nodes must be unique and sorted by nodeRef."
    );
  }
  const refSet = new Set(refs);
  const rootNodeRefs = uniqueIds(
    record.rootNodeRefs,
    "effectiveFactsSnapshot.rootNodeRefs",
    UX_EFFECTIVE_FACTS_READ_V1.maxNodes
  );
  if (rootNodeRefs.length !== 1) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_root_invalid",
      "effectiveFactsSnapshot.rootNodeRefs",
      "Seven-atom snapshots require exactly one BlankCanvas root."
    );
  }
  const selectionRefs = uniqueIds(
    selection.nodeRefs,
    "effectiveFactsSnapshot.selection.nodeRefs",
    UX_EFFECTIVE_FACTS_READ_V1.maxSelectionRefs
  );
  for (const ref of [...rootNodeRefs, ...selectionRefs]) {
    if (!refSet.has(ref)) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_ref_missing",
        "effectiveFactsSnapshot",
        `Referenced node ${ref} is absent.`
      );
    }
  }
  for (const node of nodes) {
    if (!canOwnChildren.has(node.atomType) && node.childRefs.length > 0) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_leaf_children_invalid",
        `effectiveFactsSnapshot.nodes.${node.nodeRef}.childRefs`,
        `${node.atomType} is a leaf atom and cannot own children.`
      );
    }
    if (node.parentRef === null) {
      if (!rootNodeRefs.includes(node.nodeRef) || node.depth !== 0) {
        throw new UxEffectiveFactsContractErrorV1(
          "effective_facts_root_invalid",
          `effectiveFactsSnapshot.nodes.${node.nodeRef}`,
          "Root identity or depth is inconsistent."
        );
      }
    } else if (!refSet.has(node.parentRef)) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_parent_missing",
        `effectiveFactsSnapshot.nodes.${node.nodeRef}.parentRef`,
        "Parent ref is absent."
      );
    }
    if (
      (node.parentRef === null && node.atomType !== "BlankCanvas") ||
      (node.parentRef !== null && node.atomType === "BlankCanvas")
    ) {
      throw new UxEffectiveFactsContractErrorV1(
        "effective_facts_root_invalid",
        `effectiveFactsSnapshot.nodes.${node.nodeRef}.atomType`,
        "BlankCanvas is root-only."
      );
    }
    for (const childRef of node.childRefs) {
      const child = nodes.find((candidate) => candidate.nodeRef === childRef);
      if (!child || child.parentRef !== node.nodeRef || child.depth !== node.depth + 1) {
        throw new UxEffectiveFactsContractErrorV1(
          "effective_facts_hierarchy_invalid",
          `effectiveFactsSnapshot.nodes.${node.nodeRef}.childRefs`,
          "Parent, child, and depth facts do not close."
        );
      }
    }
    if (node.parentRef !== null) {
      const parent = nodes.find(
        (candidate) => candidate.nodeRef === node.parentRef
      );
      if (!parent?.childRefs.includes(node.nodeRef)) {
        throw new UxEffectiveFactsContractErrorV1(
          "effective_facts_hierarchy_invalid",
          `effectiveFactsSnapshot.nodes.${node.nodeRef}.parentRef`,
          "Parent and child refs must close in both directions."
        );
      }
    }
  }
  const snapshotWithoutFingerprint = {
    contractVersion: UX_EFFECTIVE_FACTS_READ_V1.contractVersion,
    providerId: UX_EFFECTIVE_FACTS_READ_V1.providerId,
    providerVersion: UX_EFFECTIVE_FACTS_READ_V1.providerVersion,
    providerBindingVersion: UX_EFFECTIVE_FACTS_READ_V1.providerBindingVersion,
    effectiveFactsSchemaVersion:
      UX_EFFECTIVE_FACTS_READ_V1.effectiveFactsSchemaVersion,
    capabilityFingerprint,
    captureProfile: captureProfile as UxEffectiveFactsCaptureProfileV1,
    routePath,
    documentId: requiredIdV1(record.documentId, "effectiveFactsSnapshot.documentId"),
    mountId: requiredRuntimeMountIdV1(
      record.mountId,
      "effectiveFactsSnapshot.mountId"
    ),
    viewport: record.viewport,
    observedAt: requiredTimestampV1(
      record.observedAt,
      "effectiveFactsSnapshot.observedAt"
    ),
    revision: decodeRevision(record.revision),
    rawDataFingerprint: requiredHashV1(
      record.rawDataFingerprint,
      "effectiveFactsSnapshot.rawDataFingerprint"
    ),
    rootNodeRefs,
    selection: { nodeRefs: selectionRefs },
    nodes,
  } as const;
  const effectiveFactsFingerprint = requiredHashV1(
    record.effectiveFactsFingerprint,
    "effectiveFactsSnapshot.effectiveFactsFingerprint"
  );
  if (
    snapshotWithoutFingerprint.revision.dataFingerprint !==
    snapshotWithoutFingerprint.rawDataFingerprint
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_revision_data_mismatch",
      "effectiveFactsSnapshot.revision.dataFingerprint",
      "Puck history revision and raw Store snapshot must bind the same data."
    );
  }
  if (
    effectiveFactsFingerprint !==
    hashUxEffectiveFactsSnapshotV1(snapshotWithoutFingerprint)
  ) {
    throw new UxEffectiveFactsContractErrorV1(
      "effective_facts_fingerprint_mismatch",
      "effectiveFactsSnapshot.effectiveFactsFingerprint",
      "Effective facts fingerprint does not match the decoded snapshot."
    );
  }
  return { ...snapshotWithoutFingerprint, effectiveFactsFingerprint };
};

/** UX owns the implementation. Harness may depend on this interface and the
 * strict snapshot decoder, but must not implement Renderer defaults or layout
 * semantics behind this port. */
export interface UxEffectiveFactsReadPortV1 {
  /** Profile, route, viewport, revision and mount are derived inside the UX
   * adapter from one current AppStore/Renderer observation, never supplied by
   * a Harness caller. */
  capture(input: { documentId: string }): Promise<UxEffectiveFactsSnapshotV1>;
}
