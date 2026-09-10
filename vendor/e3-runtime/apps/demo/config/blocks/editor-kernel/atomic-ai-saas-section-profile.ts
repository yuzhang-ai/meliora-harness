import {
  ATOMIC_COMMAND_REGISTRY_HASH,
  ATOMIC_COMMAND_REGISTRY_VERSION,
  AtomicCommandRegistryError,
  compileRegisteredAtomicEnvelope,
} from "./atomic-command-registry";
import type {
  AtomicCommandBatch,
  AtomicRegistryBinding,
} from "./atomic-command-transaction";
import {
  assertAtomicDocumentPointer,
  assertAtomicDocumentSnapshotIntegrity,
  browserAtomicFingerprintPort,
  cloneAndDeepFreeze,
  type AtomicDocumentPointer,
  type AtomicDocumentSnapshot,
} from "./atomic-document-version";
import { projectAtomicDocumentGraph } from "./atomic-document-graph";

export const ATOMIC_AI_SAAS_SECTION_PROFILE_V1 = Object.freeze({
  contractVersion: "editor-ux-ai-saas-section-profile-v1",
  profileId: "saas-demo-fixed-sections-v1",
  status: "installed_host_runtime",
  source: "ai-adapter",
  mode: "commit",
  permission: "atomic.structure.write",
  registryVersion: ATOMIC_COMMAND_REGISTRY_VERSION,
  registryHash: ATOMIC_COMMAND_REGISTRY_HASH,
  commandKind: "insert-atomic-tree",
  maxCommandsPerBatch: 3,
  sectionOrder: ["header", "hero", "cta"] as const,
  allowedComponentTypes: ["TextBox"] as const,
  maximumSlotChars: 240,
  maximumSectionNodes: 1,
  maximumSectionDepth: 1,
} as const);

export type AtomicAiSaasSectionKindV1 =
  (typeof ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder)[number];

export type AtomicAiSaasSectionSlotsV1 = Readonly<{
  heading: string;
  body: string;
  action: string;
}>;

export type AtomicAiSaasSectionRequestV1 = Readonly<{
  commandId: string;
  sectionKind: AtomicAiSaasSectionKindV1;
  slots: AtomicAiSaasSectionSlotsV1;
}>;

export type AtomicAiSaasAuthorityV1 = Readonly<{
  actorId: string;
  sessionId: string;
  capabilityFingerprint: string;
  evidenceRefs: readonly string[];
}>;

const fail = (code: string, message: string): never => {
  throw new AtomicCommandRegistryError(code, message);
};

const boundedText = (value: unknown, field: string): string => {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value !== value.trim() ||
    value.length > ATOMIC_AI_SAAS_SECTION_PROFILE_V1.maximumSlotChars ||
    /[\u0000-\u001f\u007f-\u009f]/u.test(value)
  ) {
    fail("ai_saas_slot_invalid", `${field} is outside the fixed text-slot contract.`);
  }
  return value as string;
};

const fixedFrame = (sectionKind: AtomicAiSaasSectionKindV1) => {
  const geometry = {
    header: { y: 0, height: 80 },
    hero: { y: 96, height: 360 },
    cta: { y: 472, height: 216 },
  }[sectionKind];
  return {
    desktop: { x: 40, y: geometry.y, width: 1120, height: geometry.height, zIndex: 100 },
    tablet: { x: 24, y: geometry.y, width: 720, height: geometry.height, zIndex: 100 },
    mobile: { x: 16, y: geometry.y, width: 328, height: geometry.height, zIndex: 100 },
  };
};

const transform = () => ({
  desktop: { flipHorizontal: false, flipVertical: false, rotation: 0 },
  tablet: { rotation: 0 },
  mobile: { rotation: 0 },
});

const fill = (enabled: boolean, color: string) => ({
  color,
  enabled,
  gradientAngle: 135,
  gradientFrom: color,
  gradientMirror: false,
  gradientTo: color,
  imageFit: "cover",
  imageOverlay: { color: "#000000", opacity: 0 },
  imagePositionX: 50,
  imagePositionY: 50,
  imageUrl: "",
  mode: "solid",
  opacity: 100,
  stops: [
    { color, id: "start", opacity: 100, position: 0 },
    { color, id: "end", opacity: 100, position: 100 },
  ],
});

const fixedLayoutItem = (widthMode: "fixed" | "fill" | "hug" = "fixed", heightMode: "fixed" | "fill" | "hug" = "fixed") => ({
  detached: false,
  heightMode,
  widthMode,
  tablet: { heightMode, widthMode },
  mobile: { heightMode, widthMode },
});

const stableNodeId = (
  idempotencyKey: string,
  sectionKind: AtomicAiSaasSectionKindV1,
  slot: "root" | "heading" | "body" | "action"
) =>
  `e3-${sectionKind}-${slot}-${browserAtomicFingerprintPort
    .fingerprint({ idempotencyKey, sectionKind, slot })
    .slice(0, 20)}`;

const textNode = (
  id: string,
  editorName: string,
  text: string,
  fontSize: number,
  sectionKind: AtomicAiSaasSectionKindV1,
  slot: "heading" | "body" | "action",
  semanticTag: "h1" | "h2" | "p" = "p"
) => ({
  type: "TextBox",
  props: {
    id,
    editorName,
    text,
    semanticTag,
    frame: (() => {
      const y = {
        header: { heading: 12, body: 42, action: 60 },
        hero: { heading: 48, body: 164, action: 236 },
        cta: { heading: 28, body: 92, action: 148 },
      }[sectionKind][slot];
      const height = slot === "heading" ? (sectionKind === "hero" ? 112 : 48) : 44;
      return {
        desktop: { x: sectionKind === "hero" ? 64 : 28, y, width: sectionKind === "hero" ? 992 : 1064, height, zIndex: 101 },
        tablet: { x: 32, y, width: 656, height, zIndex: 101 },
        mobile: { x: 18, y, width: 292, height, zIndex: 101 },
      };
    })(),
    layoutItem: fixedLayoutItem("fixed", "fixed"),
    transform: transform(),
    hidden: false,
    locked: false,
    backgroundColor: "transparent",
    backgroundFill: fill(false, "#FFFFFF"),
    fill: fill(true, "#17212B"),
    textFillVersion: 1,
    borderColor: "#E5E7EB",
    borderWidth: 0,
    borderPosition: "center",
    borderStyle: "solid",
    shadow: "none",
    opacity: 100,
    overflow: "visible",
    fontFamily: 'InterVariable, Inter, "PingFang SC", "Microsoft YaHei", sans-serif',
    fontSize,
    fontWeight: fontSize >= 24 ? 700 : 500,
    fontStyle: "normal",
    lineHeight: fontSize >= 40 ? 1.12 : 1.5,
    letterSpacing: 0,
    color: "#17212B",
    textDecoration: "none",
    textAlign: "left",
    verticalAlign: "top",
  },
});

export const materializeAtomicAiSaasSectionTreeV1 = (input: Readonly<{
  idempotencyKey: string;
  request: AtomicAiSaasSectionRequestV1;
}>) => {
  if (!ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder.includes(input.request.sectionKind)) {
    fail("ai_saas_section_invalid", "Section is outside the fixed SaaS profile.");
  }
  if (input.request.commandId !== `saas-section:${input.request.sectionKind}`) {
    fail("ai_saas_command_invalid", "Command ID must match its fixed section profile.");
  }
  const slots = {
    heading: boundedText(input.request.slots.heading, "heading"),
    body: boundedText(input.request.slots.body, "body"),
    action: boundedText(input.request.slots.action, "action"),
  };
  const kind = input.request.sectionKind;
  const section = textNode(
    stableNodeId(input.idempotencyKey, kind, "root"),
    `E3 SaaS ${kind}`,
    `${slots.heading}\n${slots.body}\n${slots.action}`,
    kind === "hero" ? 36 : 20,
    kind,
    "heading",
    kind === "hero" ? "h1" : "h2"
  );
  return cloneAndDeepFreeze({
    ...section,
    props: {
      ...section.props,
      frame: fixedFrame(kind),
      layoutItem: fixedLayoutItem(),
      backgroundColor: kind === "hero" ? "#FFF4EF" : "#FFFFFF",
      backgroundFill: fill(true, kind === "hero" ? "#FFF4EF" : "#FFFFFF"),
      borderWidth: 1,
      overflow: "hidden",
      verticalAlign: "center",
      lineHeight: 1.45,
    },
  });
};

export const ATOMIC_AI_SAAS_SECTION_TEMPLATE_HASHES_V1 = Object.freeze(
  Object.fromEntries(
    ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder.map((sectionKind) => [
      sectionKind,
      browserAtomicFingerprintPort.fingerprint(
        materializeAtomicAiSaasSectionTreeV1({
          idempotencyKey: "template-hash-placeholder",
          request: {
            commandId: `saas-section:${sectionKind}`,
            sectionKind,
            slots: { heading: "{{heading}}", body: "{{body}}", action: "{{action}}" },
          },
        })
      ),
    ])
  ) as Record<AtomicAiSaasSectionKindV1, string>
);

export const ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1 =
  browserAtomicFingerprintPort.fingerprint({
    ...ATOMIC_AI_SAAS_SECTION_PROFILE_V1,
    templateHashes: ATOMIC_AI_SAAS_SECTION_TEMPLATE_HASHES_V1,
  });

/**
 * Dedicated UX compiler for the E3 profile.  Callers never provide a generic
 * tree, parent, index or node ID.  Those facts are generated here from the
 * frozen profile after Host authority has already been admitted.
 */
export const compileRestrictedAiSaasSectionsV1 = (input: Readonly<{
  batchId: string;
  idempotencyKey: string;
  base: AtomicDocumentPointer;
  requests: readonly AtomicAiSaasSectionRequestV1[];
  current: AtomicDocumentSnapshot<unknown>;
  authority: AtomicAiSaasAuthorityV1;
  expectedAuthority: Omit<AtomicAiSaasAuthorityV1, "evidenceRefs">;
}>): AtomicCommandBatch => {
  assertAtomicDocumentSnapshotIntegrity(input.current, browserAtomicFingerprintPort);
  assertAtomicDocumentPointer(input.base, input.current.pointer);
  if (
    input.authority.actorId !== input.expectedAuthority.actorId ||
    input.authority.sessionId !== input.expectedAuthority.sessionId ||
    input.authority.capabilityFingerprint !== input.expectedAuthority.capabilityFingerprint
  ) fail("ai_saas_authority_mismatch", "Authority differs from the Host-issued lease.");
  if (input.requests.length < 1 || input.requests.length > 3) {
    fail("ai_saas_command_count_invalid", "The fixed profile accepts one through three commands.");
  }
  const kinds = input.requests.map(({ sectionKind }) => sectionKind);
  if (new Set(kinds).size !== kinds.length) {
    fail("ai_saas_duplicate_section", "Each fixed section may appear only once.");
  }
  const expectedOrder = ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder.filter((kind) =>
    kinds.includes(kind)
  );
  if (kinds.join(",") !== expectedOrder.join(",")) {
    fail("ai_saas_section_order_invalid", "Sections must follow the frozen header, hero, CTA order.");
  }
  const graph = projectAtomicDocumentGraph(input.current.data);
  const root = graph.getNode(graph.rootId);
  if (!root || root.type !== "BlankCanvas") {
    fail("ai_saas_root_invalid", "The fixed SaaS profile requires the canonical BlankCanvas root.");
  }
  const appendIndex = root!.childIds.length;
  // Inserting each subtree at the same append boundary in reverse command
  // order yields the declared header/hero/CTA topology in one transaction.
  const commands = [...input.requests].reverse().map((request) => ({
    commandId: request.commandId,
    kind: "insert-atomic-tree" as const,
    parentId: graph.rootId,
    index: appendIndex,
    tree: materializeAtomicAiSaasSectionTreeV1({
      idempotencyKey: input.idempotencyKey,
      request,
    }),
  }));
  const compiled = compileRegisteredAtomicEnvelope(
    {
      contractVersion: ATOMIC_COMMAND_REGISTRY_VERSION,
      registryHash: ATOMIC_COMMAND_REGISTRY_HASH,
      batchId: input.batchId,
      idempotencyKey: input.idempotencyKey,
      label: input.requests.length === 1 ? "AI insert fixed SaaS section" : "AI build fixed SaaS page",
      mode: "commit",
      source: "ai-adapter",
      base: input.base,
      authority: {
        actorId: input.authority.actorId,
        sessionId: input.authority.sessionId,
        capabilityFingerprint: input.authority.capabilityFingerprint,
        permissions: [ATOMIC_AI_SAAS_SECTION_PROFILE_V1.permission],
      },
      scope: { rootId: graph.rootId, nodeIds: [graph.rootId] },
      commands,
      coalesceKey: null,
      interactionId: null,
    },
    input.current.data
  );
  const registryBinding: AtomicRegistryBinding = {
    ...compiled.registryBinding!,
    evidenceRefs: [...input.authority.evidenceRefs],
    authorityHash: browserAtomicFingerprintPort.fingerprint({
      actorId: input.authority.actorId,
      sessionId: input.authority.sessionId,
      capabilityFingerprint: input.authority.capabilityFingerprint,
      permissions: [ATOMIC_AI_SAAS_SECTION_PROFILE_V1.permission],
    }),
  };
  return cloneAndDeepFreeze({ ...compiled, registryBinding });
};
