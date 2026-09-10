import assert from "node:assert/strict";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  E3_S0_SKILL_PACKAGE_V1,
  assertTrustedE3S0SkillPackageV1,
  loadE3S0SkillPackageV1,
} from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-package";
import { E3_S0_SKILL_PROFILE_V1 } from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-profile";
import {
  E3_S0_LOADED_SKILL_PACKAGE_V1,
  E3_S0_SKILL_AUTHORITY_COMPILER_V1,
  E3_S0_SKILL_CATALOG_V1,
  E3_S0_SKILL_CONFLICT_REGISTRY_V1,
  compileE3S0SkillResolutionCandidateV1,
} from "../lib/zhiqu-ai/landing-page-harness/v1/e3-s0-skill-runtime-authority";

const expectCode = (code: string, action: () => unknown) => {
  assert.throws(action, (error: unknown) => {
    assert.equal((error as { code?: string }).code, code);
    return true;
  });
};

const profile = {
  modelIdentity: E3_S0_SKILL_PROFILE_V1.modelIdentity,
  ...E3_S0_SKILL_PROFILE_V1.principal,
  ...E3_S0_SKILL_PROFILE_V1.target,
};
const base = {
  runId: "run-e3-s0-a1",
  turnId: "turn-e3-s0-a1",
  requestId: "request-e3-s0-a1",
  principalHash: "a".repeat(64),
  aclSnapshotHash: "b".repeat(64),
  source: "user_explicit" as const,
  availableCapabilities: [E3_S0_SKILL_PROFILE_V1.requiredCapability],
  issuedAt: "2026-09-06T02:00:00.000Z",
  profile,
};

const userExplicit = compileE3S0SkillResolutionCandidateV1(base);
assert.equal(userExplicit.status, "resolved_not_activated");
assert.equal(
  userExplicit.claimCeiling,
  "declarative_skill_runtime_contract_candidate"
);
assert.equal(userExplicit.resolutionPlan.orderedClosures.length, 1);
assert.equal(userExplicit.resolutionPlan.unavailable.length, 0);
assert.equal(
  userExplicit.resolutionPlan.requestedSkills[0]?.source,
  "user_explicit"
);
assert.deepEqual(
  userExplicit.resolutionPlan.orderedClosures[0]?.tools.map((tool) => ({
    toolId: tool.toolId,
    toolVersion: tool.toolVersion,
    effect: tool.requiredEffect,
  })),
  [
    {
      toolId: "canvas_inspect",
      toolVersion: "h1-effective-facts-inspect-v1",
      effect: "private_read",
    },
  ]
);
assert.equal(E3_S0_SKILL_PROFILE_V1.runtimeInstalled, false);
assert.equal(
  E3_S0_SKILL_CATALOG_V1.catalogHash,
  E3_S0_SKILL_AUTHORITY_COMPILER_V1.frozenSkillCatalogHash
);
assert.equal(
  E3_S0_SKILL_CONFLICT_REGISTRY_V1.snapshotHash,
  E3_S0_SKILL_AUTHORITY_COMPILER_V1.frozenConflictRegistrySnapshotHash
);
assert.ok(
  !E3_S0_SKILL_CATALOG_V1.packages.some((pkg) =>
    pkg.definition.requiredTools.some(
      (tool) =>
        tool.requiredEffect === "durable_write" ||
        tool.requiredEffect === "external_write"
    )
  )
);

const actorSelected = compileE3S0SkillResolutionCandidateV1({
  ...base,
  runId: "run-e3-s0-a1-actor",
  turnId: "turn-e3-s0-a1-actor",
  requestId: "request-e3-s0-a1-actor",
  source: "actor_selected",
});
assert.equal(actorSelected.status, "resolved_not_activated");
assert.equal(
  actorSelected.resolutionPlan.requestedSkills[0]?.source,
  "actor_selected"
);

const unavailable = compileE3S0SkillResolutionCandidateV1({
  ...base,
  runId: "run-e3-s0-a1-unavailable",
  turnId: "turn-e3-s0-a1-unavailable",
  requestId: "request-e3-s0-a1-unavailable",
  availableCapabilities: [],
});
assert.equal(unavailable.status, "skill_unavailable");
assert.equal(unavailable.resolutionPlan.orderedClosures.length, 0);
assert.equal(unavailable.resolutionPlan.unavailable.length, 1);
assert.equal(
  unavailable.resolutionPlan.unavailable[0]?.canonicalDeliveryTemplateId,
  "skill-capability-unavailable"
);
assert.deepEqual(unavailable.resolutionPlan.unavailable[0]?.missingCapabilities, [
  E3_S0_SKILL_PROFILE_V1.requiredCapability,
]);

expectCode("e3_s0_skill_package_untrusted", () =>
  assertTrustedE3S0SkillPackageV1({ ...E3_S0_LOADED_SKILL_PACKAGE_V1 })
);
expectCode("e3_s0_skill_profile_authority_mismatch", () =>
  compileE3S0SkillResolutionCandidateV1({
    ...base,
    profile: { ...profile, routePath: "/edit" },
  })
);
expectCode("e3_s0_skill_profile_authority_mismatch", () =>
  compileE3S0SkillResolutionCandidateV1({
    ...base,
    profile: { ...profile, modelIdentity: "other:model" },
  })
);
expectCode("e3_s0_skill_capability_set_outside_profile", () =>
  compileE3S0SkillResolutionCandidateV1({
    ...base,
    availableCapabilities: [
      E3_S0_SKILL_PROFILE_V1.requiredCapability,
      "canvas.write.unadmitted",
    ],
  })
);

const fixtureRoot = join(
  process.cwd(),
  "fixtures/landing-page-harness/v1/e3-skills/saas-demo-page-plan/v1"
);
const tempRoot = mkdtempSync(join(tmpdir(), "e3-s0-a1-"));
try {
  const manifestPath = join(tempRoot, "manifest.json");
  const resourcePath = join(tempRoot, "SKILL.md");
  copyFileSync(join(fixtureRoot, "manifest.json"), manifestPath);
  copyFileSync(join(fixtureRoot, "SKILL.md"), resourcePath);

  writeFileSync(resourcePath, `${readFileSync(resourcePath, "utf8")}\nDRIFT\n`);
  expectCode("e3_s0_skill_resource_binding_mismatch", () =>
    loadE3S0SkillPackageV1({ manifestPath, resourcePath })
  );

  copyFileSync(join(fixtureRoot, "SKILL.md"), resourcePath);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >;
  manifest.untrusted = true;
  writeFileSync(manifestPath, JSON.stringify(manifest));
  expectCode("exact_keys_mismatch", () =>
    loadE3S0SkillPackageV1({ manifestPath, resourcePath })
  );

  copyFileSync(join(fixtureRoot, "manifest.json"), manifestPath);
  writeFileSync(resourcePath, Buffer.from([0xff, 0xfe, 0xfd]));
  expectCode("e3_s0_skill_source_not_utf8", () =>
    loadE3S0SkillPackageV1({ manifestPath, resourcePath })
  );
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

console.log(
  JSON.stringify({
    gate: "e3-s0-a1-skill-package-resolution",
    status: "PASS",
    claimCeiling: E3_S0_SKILL_AUTHORITY_COMPILER_V1.claimCeiling,
    runtimeInstalled: E3_S0_SKILL_PROFILE_V1.runtimeInstalled,
    packageHash: E3_S0_SKILL_PACKAGE_V1.frozenPackageHash,
    profileHash: E3_S0_SKILL_PROFILE_V1.frozenProfileHash,
    catalogHash: E3_S0_SKILL_CATALOG_V1.catalogHash,
    conflictRegistryHash: E3_S0_SKILL_CONFLICT_REGISTRY_V1.snapshotHash,
    userExplicit: userExplicit.status,
    actorSelected: actorSelected.status,
    unavailable: unavailable.status,
    admittedTools: ["canvas_inspect"],
    canvasWrite: false,
  })
);
