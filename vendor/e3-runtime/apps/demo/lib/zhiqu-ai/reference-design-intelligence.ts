import { createHash } from "node:crypto";
import { referenceDesignComparableDomainForPropertyV1 } from "./reference-design-property-domain";

export const REFERENCE_DESIGN_INTELLIGENCE_CONTRACT_V1 =
  "reference-design-intelligence-v1" as const;

export type ReferenceDesignFactDomainV1 =
  | "css_variable"
  | "color"
  | "typography"
  | "spacing"
  | "radius"
  | "shadow"
  | "surface";

export type ReferenceDesignFactV1 = {
  factId: string;
  domain: ReferenceDesignFactDomainV1;
  property: string;
  value: string | number;
  source: {
    kind: "computed_style" | "css_variable" | "derived_scale";
    selector: string;
    sectionId: string | null;
  };
  viewport: { width: number; height: number };
  state: "default";
  confidence: number;
  evidenceDigest: string;
};

export type ReferenceDesignSectionRecipeV1 = {
  sectionId: string;
  role: string;
  selector: string;
  factIds: string[];
  digest: string;
};

export type ReferenceDesignIntelligenceV1 = {
  contractVersion: typeof REFERENCE_DESIGN_INTELLIGENCE_CONTRACT_V1;
  sourceSnapshotId: string;
  viewport: { width: number; height: number };
  states: ["default"];
  facts: ReferenceDesignFactV1[];
  domains: Array<{
    domain: ReferenceDesignFactDomainV1;
    factCount: number;
    digest: string;
  }>;
  scales: {
    fontSizes: number[];
    fontWeights: number[];
    lineHeights: number[];
    letterSpacings: number[];
    spacing: number[];
    radii: number[];
    shadows: string[];
  };
  sections: ReferenceDesignSectionRecipeV1[];
  digest: string;
};

type CapturedDesignSectionV1 = {
  id: string;
  role: string;
  selector: string;
  typography: Record<string, string | number | undefined>;
  spacing: Record<string, number | undefined>;
  surface: Record<string, string | number | undefined>;
};

type CapturedCssVariableV1 = {
  name: string;
  value: string;
  selector: string;
};

const stableValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, stableValue(entry)])
    );
  }
  return value;
};

export const hashReferenceDesignValueV1 = (value: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(stableValue(value)))
    .digest("hex");

const boundedText = (value: unknown, max: number) =>
  typeof value === "string"
    ? value.normalize("NFKC").replace(/\s+/gu, " ").trim().slice(0, max)
    : "";

const finiteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.round(value * 100) / 100
    : null;

const DESIGN_CSS_VARIABLE_NAME_PATTERN =
  /(?:color|background|foreground|surface|brand|accent|font|type|text|space|spacing|gap|padding|margin|radius|round|shadow|border|size|width|height|line|letter|opacity|transition|duration|eas(?:e|ing)|z-index)/iu;
const SENSITIVE_CSS_VARIABLE_NAME_PATTERN =
  /(?:auth|bearer|cookie|credential|csrf|jwt|key|pass|secret|session|signature|token)/iu;
const UNSAFE_CSS_VARIABLE_VALUE_PATTERN =
  /(?:url\s*\(|data\s*:|javascript\s*:|@import|expression\s*\(|(?:https?|ftp)\s*:|^\s*\/\/|[?&][-_a-z0-9]+=|[{};<>`\\])/iu;
const SAFE_CSS_DESIGN_PRIMITIVE_PATTERN =
  /^[#(),.%+\-/"'_a-z0-9\s]+$/iu;

export const isPublicDesignCssVariableV1 = (input: {
  name: string;
  value: string;
}) =>
  /^--[-_a-z0-9]+$/iu.test(input.name) &&
  DESIGN_CSS_VARIABLE_NAME_PATTERN.test(input.name) &&
  !SENSITIVE_CSS_VARIABLE_NAME_PATTERN.test(input.name) &&
  !UNSAFE_CSS_VARIABLE_VALUE_PATTERN.test(input.value) &&
  SAFE_CSS_DESIGN_PRIMITIVE_PATTERN.test(input.value);

const uniqueNumbers = (values: number[]) =>
  [...new Set(values.map((value) => Math.round(value * 100) / 100))].sort(
    (left, right) => left - right
  );

const createFact = (input: {
  domain: ReferenceDesignFactDomainV1;
  property: string;
  value: string | number;
  sourceKind: ReferenceDesignFactV1["source"]["kind"];
  selector: string;
  sectionId: string | null;
  viewport: { width: number; height: number };
  confidence?: number;
}): ReferenceDesignFactV1 => {
  const evidence = {
    domain: input.domain,
    property: input.property,
    value: input.value,
    source: {
      kind: input.sourceKind,
      selector: input.selector,
      sectionId: input.sectionId,
    },
    viewport: input.viewport,
    state: "default" as const,
  };
  const evidenceDigest = hashReferenceDesignValueV1(evidence);
  return {
    factId: `design-fact-${evidenceDigest.slice(0, 20)}`,
    ...evidence,
    confidence: input.confidence ?? 0.96,
    evidenceDigest,
  };
};

const surfaceDomainFor = (property: string): ReferenceDesignFactDomainV1 =>
  referenceDesignComparableDomainForPropertyV1(property) || "surface";

export const buildReferenceDesignIntelligenceV1 = (input: {
  sourceSnapshotId: string;
  viewport: { width: number; height: number };
  cssVariables: CapturedCssVariableV1[];
  global: {
    colors: string[];
    fonts: string[];
    radii: number[];
  };
  sections: CapturedDesignSectionV1[];
}): ReferenceDesignIntelligenceV1 => {
  const facts: ReferenceDesignFactV1[] = [];
  for (const variable of input.cssVariables.slice(0, 160)) {
    const name = boundedText(variable.name, 120);
    const value = boundedText(variable.value, 240);
    if (!value || !isPublicDesignCssVariableV1({ name, value })) {
      continue;
    }
    facts.push(
      createFact({
        domain: "css_variable",
        property: name,
        value,
        sourceKind: "css_variable",
        selector: boundedText(variable.selector, 240) || ":root",
        sectionId: null,
        viewport: input.viewport,
      })
    );
  }
  input.global.colors.slice(0, 20).forEach((value, index) => {
    const normalized = boundedText(value, 120);
    if (!normalized) return;
    facts.push(
      createFact({
        domain: "color",
        property: `globalColor${index + 1}`,
        value: normalized,
        sourceKind: "computed_style",
        selector: "body *",
        sectionId: null,
        viewport: input.viewport,
      })
    );
  });
  input.global.fonts.slice(0, 12).forEach((value, index) => {
    const normalized = boundedText(value, 160);
    if (!normalized) return;
    facts.push(
      createFact({
        domain: "typography",
        property: `globalFontFamily${index + 1}`,
        value: normalized,
        sourceKind: "computed_style",
        selector: "body *",
        sectionId: null,
        viewport: input.viewport,
      })
    );
  });
  input.global.radii.slice(0, 12).forEach((value) => {
    const normalized = finiteNumber(value);
    if (normalized === null) return;
    facts.push(
      createFact({
        domain: "radius",
        property: "globalRadiusScale",
        value: normalized,
        sourceKind: "derived_scale",
        selector: "body *",
        sectionId: null,
        viewport: input.viewport,
        confidence: 0.92,
      })
    );
  });
  const sectionFactIds = new Map<string, string[]>();
  for (const section of input.sections) {
    const selector = boundedText(section.selector, 240) || `#${section.id}`;
    const appendSectionFact = (
      domain: ReferenceDesignFactDomainV1,
      property: string,
      value: unknown
    ) => {
      const normalized =
        typeof value === "number"
          ? finiteNumber(value)
          : boundedText(value, property === "boxShadow" ? 240 : 160);
      if (normalized === null || normalized === "") return;
      const fact = createFact({
        domain,
        property,
        value: normalized,
        sourceKind: "computed_style",
        selector,
        sectionId: section.id,
        viewport: input.viewport,
      });
      facts.push(fact);
      sectionFactIds.set(section.id, [
        ...(sectionFactIds.get(section.id) || []),
        fact.factId,
      ]);
    };
    Object.entries(section.typography).forEach(([property, value]) =>
      appendSectionFact(
        referenceDesignComparableDomainForPropertyV1(property) || "typography",
        property,
        value
      )
    );
    Object.entries(section.spacing).forEach(([property, value]) =>
      appendSectionFact(
        referenceDesignComparableDomainForPropertyV1(property) || "spacing",
        property,
        value
      )
    );
    Object.entries(section.surface).forEach(([property, value]) =>
      appendSectionFact(surfaceDomainFor(property), property, value)
    );
  }
  const deduplicatedFacts = [
    ...new Map(facts.map((fact) => [fact.factId, fact])).values(),
  ]
    .sort(
      (left, right) =>
        left.domain.localeCompare(right.domain) ||
        left.property.localeCompare(right.property) ||
        left.factId.localeCompare(right.factId)
    )
    .slice(0, 320);
  const retainedFactIds = new Set(
    deduplicatedFacts.map(({ factId }) => factId)
  );
  const sections = input.sections.map((section) => {
    const recipe = {
      sectionId: section.id,
      role: boundedText(section.role, 80) || "unknown",
      selector: boundedText(section.selector, 240) || `#${section.id}`,
      factIds: (sectionFactIds.get(section.id) || []).filter((factId) =>
        retainedFactIds.has(factId)
      ),
    };
    return {
      ...recipe,
      digest: hashReferenceDesignValueV1(recipe),
    };
  });
  const domains = (
    [
      "css_variable",
      "color",
      "typography",
      "spacing",
      "radius",
      "shadow",
      "surface",
    ] as const
  ).flatMap((domain) => {
    const domainFacts = deduplicatedFacts.filter(
      (fact) => fact.domain === domain
    );
    return domainFacts.length
      ? [
          {
            domain,
            factCount: domainFacts.length,
            digest: hashReferenceDesignValueV1(domainFacts),
          },
        ]
      : [];
  });
  const numbers = (property: string) =>
    uniqueNumbers(
      deduplicatedFacts.flatMap((fact) =>
        fact.domain === "typography" &&
        fact.property === property &&
        typeof fact.value === "number"
          ? [fact.value]
          : []
      )
    );
  const documentWithoutDigest = {
    contractVersion: REFERENCE_DESIGN_INTELLIGENCE_CONTRACT_V1,
    sourceSnapshotId: input.sourceSnapshotId,
    viewport: input.viewport,
    states: ["default"] as ["default"],
    facts: deduplicatedFacts,
    domains,
    scales: {
      fontSizes: uniqueNumbers(
        numbers("titleFontSize").concat(numbers("bodyFontSize"))
      ),
      fontWeights: numbers("titleFontWeight"),
      lineHeights: uniqueNumbers(
        numbers("titleLineHeight").concat(numbers("bodyLineHeight"))
      ),
      letterSpacings: numbers("titleLetterSpacing"),
      spacing: uniqueNumbers(
        deduplicatedFacts.flatMap((fact) =>
          fact.domain === "spacing" && typeof fact.value === "number"
            ? [fact.value]
            : []
        )
      ),
      radii: uniqueNumbers(
        deduplicatedFacts.flatMap((fact) =>
          fact.domain === "radius" && typeof fact.value === "number"
            ? [fact.value]
            : []
        )
      ),
      shadows: [
        ...new Set(
          deduplicatedFacts.flatMap((fact) =>
            fact.domain === "shadow" && typeof fact.value === "string"
              ? [fact.value]
              : []
          )
        ),
      ].slice(0, 12),
    },
    sections,
  };
  return {
    ...documentWithoutDigest,
    digest: hashReferenceDesignValueV1(documentWithoutDigest),
  };
};

export const projectReferenceDesignManifestV1 = (
  intelligence: ReferenceDesignIntelligenceV1
) => ({
  contractVersion: intelligence.contractVersion,
  sourceSnapshotId: intelligence.sourceSnapshotId,
  digest: intelligence.digest,
  viewport: intelligence.viewport,
  states: intelligence.states,
  domains: intelligence.domains,
  scales: intelligence.scales,
  cssVariables: intelligence.facts
    .filter(({ domain }) => domain === "css_variable")
    .slice(0, 16)
    .map(({ property, value, evidenceDigest }) => ({
      property,
      value,
      evidenceDigest,
    })),
});

export const projectReferenceSectionDesignV1 = (input: {
  intelligence: ReferenceDesignIntelligenceV1;
  sectionId: string;
}) => {
  const section = input.intelligence.sections.find(
    ({ sectionId }) => sectionId === input.sectionId
  );
  if (!section) return null;
  const factIds = new Set(section.factIds);
  const facts = input.intelligence.facts
    .filter(({ factId }) => factIds.has(factId))
    .slice(0, 24)
    .map((fact) => ({
      factId: fact.factId,
      domain: fact.domain,
      property: fact.property,
      value: fact.value,
      selector: fact.source.selector,
      viewport: fact.viewport,
      state: fact.state,
      confidence: fact.confidence,
      evidenceDigest: fact.evidenceDigest,
    }));
  return {
    contractVersion: "reference-section-design-v1" as const,
    sectionId: section.sectionId,
    recipeDigest: section.digest,
    facts,
    omittedFactCount: Math.max(0, section.factIds.length - facts.length),
  };
};
