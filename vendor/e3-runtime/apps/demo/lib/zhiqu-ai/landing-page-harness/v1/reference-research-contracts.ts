import type { ReferenceDesignIntelligenceV1 } from "../../reference-design-intelligence";

export const REFERENCE_RESEARCH_V1 = Object.freeze({
  rootArtifact: "reference-acquisition-root-v1",
  domArtifact: "reference-sanitized-dom-snapshot-v1",
  computedStyleArtifact: "reference-computed-style-snapshot-v1",
  structureArtifact: "reference-structure-evidence-v1",
  toolAnalyze: "analyze_public_landing_page",
  toolReadSlice: "read_reference_design_slice",
  toolVersion: "1.0.0",
  collectorVersion: "neutral-public-page-collector-v1",
  captureProfileVersion: "desktop-safe-1440x900-v1",
  networkPolicyVersion: "pinned-public-egress-v1",
  rootMediaType:
    "application/vnd.zhiqu.reference-acquisition-root+json;version=1",
  domMediaType: "application/vnd.zhiqu.reference-sanitized-dom+json;version=1",
  computedStyleMediaType:
    "application/vnd.zhiqu.reference-computed-style+json;version=1",
  structureMediaType:
    "application/vnd.zhiqu.reference-structure+json;version=1",
  designIntelligenceMediaType:
    "application/vnd.zhiqu.reference-design-intelligence+json;version=1",
  screenshotMediaType: "image/jpeg",
});

export const REFERENCE_RESEARCH_LIMITS_V1 = Object.freeze({
  maxObservationBytes: 12 * 1_024,
  maxCatalogBytes: 4 * 1_024,
  maxCatalogEntries: 6,
  maxSliceLimit: 50,
  defaultSliceLimit: 20,
  maxSectionIdCharacters: 160,
  maxUrlCharacters: 2_048,
  maxDomNodes: 320,
  maxComputedStyleNodes: 180,
  maxSections: 24,
  maxAssets: 160,
  maxContent: 240,
  maxCssVariables: 160,
  maxMediaRules: 120,
  maxWarnings: 16,
  maxNetworkRequests: 180,
});

export type ReferenceArtifactRefV1 = Readonly<{
  contractVersion: "reference-artifact-ref-v1";
  artifactId: string;
  sha256: string;
  mediaType: string;
  byteLength: number;
}>;

export type ReferenceResearchScopeV1 = Readonly<{
  workspaceId: string;
  sessionId: string;
  threadId: string;
}>;

export type ReferenceResearchInvocationV1 = ReferenceResearchScopeV1 &
  Readonly<{
    runId: string;
    callId: string;
  }>;

export type ReferenceViewportV1 = Readonly<{
  width: number;
  height: number;
  deviceScaleFactor: number;
}>;

export type ReferenceSourceIdentityV1 = Readonly<{
  requestedUrl: string;
  resolvedUrl: string;
  frameUrl: string;
  requestedUrlHash: string;
  queryPolicy: "reject-sensitive-strip-tracking-store-origin-path";
  title: string;
  capturedAt: string;
  snapshotId: string;
}>;

export type ReferenceScreenshotArtifactV1 = Readonly<{
  kind: "desktop" | "desktop-full";
  viewport: ReferenceViewportV1;
  artifactRef: ReferenceArtifactRefV1;
  modelVisibility: "artifact_ref_only";
}>;

export type NeutralReferenceDomNodeV1 = Readonly<{
  nodeRef: string;
  parentNodeRef: string | null;
  sectionId: string | null;
  selector: string;
  tag: string;
  role: string | null;
  text: string;
  alt: string;
  href: string | null;
  bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
}>;

export type ReferenceSanitizedDomSnapshotArtifactV1 = Readonly<{
  contractVersion: typeof REFERENCE_RESEARCH_V1.domArtifact;
  viewport: ReferenceViewportV1;
  totalVisibleNodeCount: number;
  retainedNodeCount: number;
  truncated: boolean;
  nodes: readonly NeutralReferenceDomNodeV1[];
  digest: string;
}>;

export type NeutralReferenceComputedStyleNodeV1 = Readonly<{
  nodeRef: string;
  sectionId: string | null;
  selector: string;
  tag: string;
  state: "default";
  viewport: ReferenceViewportV1;
  bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  properties: Readonly<Record<string, string | number>>;
}>;

export type NeutralReferenceSectionMeasurementV1 = Readonly<{
  sectionId: string;
  role: string;
  selector: string;
  bounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  layout: Readonly<Record<string, string | number>>;
  typography: Readonly<Record<string, string | number>>;
  spacing: Readonly<Record<string, number>>;
  surface: Readonly<Record<string, string | number>>;
  media: Readonly<Record<string, string | number>>;
}>;

export type NeutralReferenceCssVariableV1 = Readonly<{
  name: string;
  value: string;
  selector: string;
}>;

export type NeutralReferenceMediaRuleV1 = Readonly<{
  conditionText: string;
  selectorCount: number;
  selectors: readonly string[];
  digest: string;
}>;

export type ReferenceComputedStyleSnapshotArtifactV1 = Readonly<{
  contractVersion: typeof REFERENCE_RESEARCH_V1.computedStyleArtifact;
  viewport: ReferenceViewportV1;
  states: readonly ["default"];
  cssVariables: readonly NeutralReferenceCssVariableV1[];
  mediaRules: readonly NeutralReferenceMediaRuleV1[];
  global: Readonly<{
    colors: readonly string[];
    fonts: readonly string[];
    radii: readonly number[];
  }>;
  sections: readonly NeutralReferenceSectionMeasurementV1[];
  nodes: readonly NeutralReferenceComputedStyleNodeV1[];
  unavailableFacts: readonly string[];
  digest: string;
}>;

export type NeutralReferenceAssetV1 = Readonly<{
  assetId: string;
  kind: "image" | "video" | "background" | "icon" | "logo";
  sectionId: string | null;
  url: string;
  urlHash: string;
  alt: string;
  width: number | null;
  height: number | null;
}>;

export type NeutralReferenceContentV1 = Readonly<{
  contentId: string;
  kind: "heading" | "paragraph" | "button" | "link";
  sectionId: string | null;
  text: string;
  headingLevel: number | null;
  href: string | null;
  top: number;
}>;

export type NeutralReferenceOutlineNodeV1 = Readonly<{
  outlineId: string;
  sectionId: string;
  role: string;
  label: string;
  contentIds: readonly string[];
  top: number;
}>;

export type NeutralReferenceLayoutNodeV1 = Readonly<{
  layoutId: string;
  sectionId: string;
  order: number;
  role: string;
  widthMode: "full-bleed" | "contained" | "narrow";
  display: string;
  columnCount: number;
  mediaPosition: "left" | "right" | "background" | "full" | "none";
  itemCount: number;
  confidence: number;
}>;

export type ReferenceStructureEvidenceArtifactV1 = Readonly<{
  contractVersion: typeof REFERENCE_RESEARCH_V1.structureArtifact;
  assets: readonly NeutralReferenceAssetV1[];
  content: readonly NeutralReferenceContentV1[];
  outline: readonly NeutralReferenceOutlineNodeV1[];
  layout: readonly NeutralReferenceLayoutNodeV1[];
  digest: string;
}>;

export type ReferenceAcquisitionRootArtifactV1 = Readonly<{
  contractVersion: typeof REFERENCE_RESEARCH_V1.rootArtifact;
  source: ReferenceSourceIdentityV1;
  provenance: Readonly<{
    collectorVersion: typeof REFERENCE_RESEARCH_V1.collectorVersion;
    browserEngine: "chromium";
    browserVersion: string;
    browserUserAgent: string;
    captureProfileVersion: typeof REFERENCE_RESEARCH_V1.captureProfileVersion;
    networkPolicyVersion: typeof REFERENCE_RESEARCH_V1.networkPolicyVersion;
    viewports: readonly ReferenceViewportV1[];
    evidenceKinds: readonly ["measured", "deterministic_derived"];
    modelInference: "not_used";
    completeness: "partial";
    unavailableFacts: readonly string[];
  }>;
  graph: Readonly<{
    sanitizedDomSnapshotRef: ReferenceArtifactRefV1;
    computedStyleSnapshotRef: ReferenceArtifactRefV1;
    contentAssetOutlineLayoutRef: ReferenceArtifactRefV1;
    designIntelligenceRef: ReferenceArtifactRefV1;
    screenshotRefs: readonly ReferenceScreenshotArtifactV1[];
  }>;
  designSummary: Readonly<{
    digest: string;
    domains: ReferenceDesignIntelligenceV1["domains"];
    scales: ReferenceDesignIntelligenceV1["scales"];
    sections: readonly Readonly<{
      sectionId: string;
      role: string;
      selector: string;
      factCount: number;
      digest: string;
    }>[];
  }>;
  evidenceCounts: Readonly<{
    domNodes: number;
    computedStyleNodes: number;
    facts: number;
    assets: number;
    content: number;
    outline: number;
    layout: number;
    screenshots: number;
  }>;
  warnings: readonly string[];
}>;

export type ReferenceAcquisitionRecordV1 = Readonly<{
  referenceId: string;
  invocation: ReferenceResearchInvocationV1;
  toolId: typeof REFERENCE_RESEARCH_V1.toolAnalyze;
  toolVersion: typeof REFERENCE_RESEARCH_V1.toolVersion;
  argumentsHash: string;
  captureProfileVersion: typeof REFERENCE_RESEARCH_V1.captureProfileVersion;
  rootArtifactRef: ReferenceArtifactRefV1;
  closureArtifactRefs: readonly ReferenceArtifactRefV1[];
  createdAt: string;
  recordHash: string;
}>;

export const REFERENCE_DESIGN_SLICES_V1 = Object.freeze([
  "overview",
  "typography",
  "colors",
  "spacing",
  "surfaces",
  "sections",
  "content",
  "assets",
  "layout",
  "screenshots",
] as const);

export type ReferenceDesignSliceV1 =
  (typeof REFERENCE_DESIGN_SLICES_V1)[number];

export type ReferenceAcquisitionManifestV1 = Readonly<{
  referenceId: string;
  trust: "untrusted_external_content";
  effectSemantics: "external_read_only_internal_artifact_persistence";
  rootArtifactRef: ReferenceArtifactRefV1;
  source: ReferenceSourceIdentityV1;
  provenance: ReferenceAcquisitionRootArtifactV1["provenance"];
  designDigest: string;
  domains: ReferenceDesignIntelligenceV1["domains"];
  scales: ReferenceDesignIntelligenceV1["scales"];
  sections: ReferenceAcquisitionRootArtifactV1["designSummary"]["sections"];
  evidenceCounts: ReferenceAcquisitionRootArtifactV1["evidenceCounts"];
  screenshots: readonly ReferenceScreenshotArtifactV1[];
  warnings: readonly string[];
  availableSlices: readonly ReferenceDesignSliceV1[];
}>;

export type ReferenceCatalogEntryV1 = Readonly<{
  referenceId: string;
  sourceUrl: string;
  title: string;
  capturedAt: string;
  designDigest: string;
  availableSlices: readonly ReferenceDesignSliceV1[];
}>;

export type ReferenceCatalogContextV1 =
  | Readonly<{ state: "absent"; reason: "reference_store_not_connected" }>
  | Readonly<{
      state: "available";
      trust: "untrusted_external_content_catalog";
      entries: readonly ReferenceCatalogEntryV1[];
    }>;

export interface ReferenceContextBuildPortV1 {
  buildCatalog(
    scope: ReferenceResearchScopeV1
  ): Promise<ReferenceCatalogContextV1>;
}
