import assert from "node:assert/strict";

import { createE3MinimumIntegrationData } from "../config/fixtures/e3-minimum-integration";
import {
  ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
  ATOMIC_AI_SAAS_SECTION_PROFILE_V1,
  compileRestrictedAiSaasSectionsV1,
} from "../config/blocks/editor-kernel/atomic-ai-saas-section-profile";
import {
  createAtomicDocumentSnapshot,
} from "../config/blocks/editor-kernel/atomic-document-version";
import {
  applyAtomicUpdatePropsOperations,
  commitAtomicCommandPreview,
  previewAtomicCommandBatch,
} from "../config/blocks/editor-kernel/atomic-command-transaction";
import { projectAtomicDocumentGraph } from "../config/blocks/editor-kernel/atomic-document-graph";

const snapshot = createAtomicDocumentSnapshot(
  structuredClone(createE3MinimumIntegrationData()),
  0
);
const authority = {
  actorId: "e3-s1-test-actor",
  sessionId: "e3-s1-test-session",
  capabilityFingerprint: "a".repeat(64),
  evidenceRefs: ["lease:e3-s1-test"],
};
const expectedAuthority = {
  actorId: authority.actorId,
  sessionId: authority.sessionId,
  capabilityFingerprint: authority.capabilityFingerprint,
};
const request = (sectionKind: "header" | "hero" | "cta") => ({
  commandId: `saas-section:${sectionKind}`,
  sectionKind,
  slots: {
    heading: `${sectionKind} heading`,
    body: `${sectionKind} body`,
    action: `${sectionKind} action`,
  },
});

assert.match(ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1, /^atomic-fnv128-v1:/u);
assert.equal(ATOMIC_AI_SAAS_SECTION_PROFILE_V1.status, "installed_host_runtime");

for (const sectionKind of ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder) {
  const batch = compileRestrictedAiSaasSectionsV1({
    batchId: `single-${sectionKind}`,
    idempotencyKey: `single-${sectionKind}`,
    base: snapshot.pointer,
    requests: [request(sectionKind)],
    current: snapshot,
    authority,
    expectedAuthority,
  });
  assert.equal(batch.commands.length, 1);
  assert.equal(batch.registryBinding?.source, "ai-adapter");
  const preview = previewAtomicCommandBatch(snapshot, batch);
  assert.equal(preview.hasChanges, true);
  const committed = commitAtomicCommandPreview(snapshot, preview);
  assert.equal(committed.kind, "committed");
  if (committed.kind === "committed") {
    assert.equal(committed.snapshot.pointer.revision, 1);
    assert.equal(committed.transaction.validationReceipt.commandCount, 1);
    assert.equal(committed.transaction.validationReceipt.topology.createdIds.length, 1);
    assert.deepEqual(
      applyAtomicUpdatePropsOperations(
        committed.snapshot.data,
        committed.transaction.inverse
      ),
      snapshot.data
    );
  }
}

const pageBatch = compileRestrictedAiSaasSectionsV1({
  batchId: "fixed-page",
  idempotencyKey: "fixed-page",
  base: snapshot.pointer,
  requests: [request("header"), request("hero"), request("cta")],
  current: snapshot,
  authority,
  expectedAuthority,
});
const pagePreview = previewAtomicCommandBatch(snapshot, pageBatch);
assert.equal(pagePreview.validationReceipt.commandCount, 3);
assert.equal(pagePreview.validationReceipt.topology.createdIds.length, 3);
const pageCommit = commitAtomicCommandPreview(snapshot, pagePreview);
assert.equal(pageCommit.kind, "committed");
if (pageCommit.kind === "committed") {
  const graph = projectAtomicDocumentGraph(pageCommit.snapshot.data);
  const root = graph.getNode(graph.rootId)!;
  assert.deepEqual(
    root.childIds.slice(-3).map((id) => graph.getNode(id)?.props.editorName),
    ["E3 SaaS header", "E3 SaaS hero", "E3 SaaS cta"]
  );
  assert.equal(pageCommit.snapshot.pointer.revision, 1);
  assert.deepEqual(
    applyAtomicUpdatePropsOperations(pageCommit.snapshot.data, pageCommit.transaction.inverse),
    snapshot.data
  );
}

const unchanged = structuredClone(snapshot.data);
assert.throws(
  () =>
    compileRestrictedAiSaasSectionsV1({
      batchId: "wrong-order",
      idempotencyKey: "wrong-order",
      base: snapshot.pointer,
      requests: [request("hero"), request("header")],
      current: snapshot,
      authority,
      expectedAuthority,
    }),
  /Sections must follow/
);
assert.throws(
  () =>
    compileRestrictedAiSaasSectionsV1({
      batchId: "forged-authority",
      idempotencyKey: "forged-authority",
      base: snapshot.pointer,
      requests: [request("header")],
      current: snapshot,
      authority: { ...authority, actorId: "forged" },
      expectedAuthority,
    }),
  /Authority differs/
);
assert.throws(
  () =>
    compileRestrictedAiSaasSectionsV1({
      batchId: "invalid-slot",
      idempotencyKey: "invalid-slot",
      base: snapshot.pointer,
      requests: [
        {
          ...request("cta"),
          slots: { ...request("cta").slots, heading: "x".repeat(241) },
        },
      ],
      current: snapshot,
      authority,
      expectedAuthority,
    }),
  /fixed text-slot contract/
);
assert.deepEqual(snapshot.data, unchanged, "all rejected preflight paths must be zero-write");

console.log(
  JSON.stringify({
    gate: "e3-s1-fixed-saas-profile",
    status: "PASS",
    singleCommandProfiles: ["header", "hero", "cta"],
    genericTreeInput: false,
    hostOwnedIds: true,
    batchCommandCount: 3,
    singleRevision: true,
    rejectedPathsZeroWrite: true,
    profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
  })
);
