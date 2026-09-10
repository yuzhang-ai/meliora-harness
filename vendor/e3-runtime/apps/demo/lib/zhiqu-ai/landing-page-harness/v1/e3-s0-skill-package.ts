import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";

import type {
  SkillDefinitionV1,
  SkillPackageDefinitionV1,
} from "./authority-fabric-contracts";
import { decodeCanonicalStringSetV1 } from "./authority-fabric-codecs";
import {
  createSkillPackageDefinitionV1,
  decodeSkillDefinitionV1,
  decodeSkillPackageDefinitionV1,
} from "./authority-skill-compiler";
import {
  StrictJsonErrorV1,
  hashCanonicalJsonV1,
  requiredHashV1,
  requiredIdV1,
  requiredStringV1,
  strictRecordV1,
} from "./strict-json";

export const E3_S0_SKILL_PACKAGE_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-package-manifest-v1",
  packageId: "repo-saas-demo-page-plan",
  packageVersion: "1.0.0",
  skillId: "saas-demo-page-plan",
  skillVersion: "1.0.0",
  resourceId: "saas-demo-page-plan-recipe",
  resourceRelativePath: "SKILL.md",
  resourceMediaType: "text/markdown; charset=utf-8",
  frozenManifestHash:
    "13a0b30787de075d12153cfbb6fe6f24e8137f2cb3ba2590d8a57bc550b280ad",
  frozenResourceHash:
    "79f4528b0ccdbd736c69e592d5480695a9c34961a997d562aa6f34b59b56bb19",
  frozenDefinitionHash:
    "f4fbd506e5efe57a947bf8c6e2b2e214c403e75c71fcec63df286c8594585154",
  frozenRubricHash:
    "ffe0562250d2eb2237454362791addb00336ca953ea36dadcdb9969a310c5daa",
  frozenPackageHash:
    "7cdeffd8167327b868a7a19e0a7fbb21b810a61c06a5b53618260d12333dc851",
  frozenSourceHash:
    "6ebbfcbdacefdeefccaf18e4acb3bede70b47cb9d36b0d8dd07e5ff41f39ee17",
} as const);

const defaultManifestPath = resolve(
  process.cwd(),
  "fixtures/landing-page-harness/v1/e3-skills/saas-demo-page-plan/v1/manifest.json"
);

type E3S0SkillRubricV1 = Readonly<{
  rubricId: string;
  version: string;
  requirements: readonly string[];
}>;

type E3S0SkillPackageManifestV1 = Readonly<{
  contractVersion: typeof E3_S0_SKILL_PACKAGE_V1.contractVersion;
  packageId: typeof E3_S0_SKILL_PACKAGE_V1.packageId;
  packageVersion: typeof E3_S0_SKILL_PACKAGE_V1.packageVersion;
  resource: Readonly<{
    resourceId: typeof E3_S0_SKILL_PACKAGE_V1.resourceId;
    relativePath: typeof E3_S0_SKILL_PACKAGE_V1.resourceRelativePath;
    mediaType: typeof E3_S0_SKILL_PACKAGE_V1.resourceMediaType;
    contentHash: string;
  }>;
  definition: SkillDefinitionV1;
  rubric: E3S0SkillRubricV1;
}>;

export type LoadedE3S0SkillPackageV1 = Readonly<{
  manifest: E3S0SkillPackageManifestV1;
  packageDefinition: SkillPackageDefinitionV1;
  promptText: string;
  manifestHash: string;
  resourceHash: string;
  definitionHash: string;
  rubricHash: string;
  packageHash: string;
  sourceHash: string;
}>;

const loadedPackages = new WeakSet<object>();

const readExactUtf8 = (path: string, sourcePath: string) => {
  const bytes = readFileSync(path);
  try {
    return {
      bytes,
      text: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    };
  } catch {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_source_not_utf8",
      sourcePath,
      "E3 S0 Skill source must be valid UTF-8 text."
    );
  }
};

const hashBytes = (bytes: ReturnType<typeof readFileSync>) =>
  createHash("sha256").update(bytes.toString("latin1"), "latin1").digest("hex");

const exactLiteral = <T extends string>(
  value: unknown,
  expected: T,
  path: string
): T => {
  const decoded = requiredStringV1(value, path, 240);
  if (decoded !== expected) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_manifest_identity_mismatch",
      path,
      "E3 S0 Skill package identity differs from the frozen profile."
    );
  }
  return expected;
};

const decodeRubric = (value: unknown): E3S0SkillRubricV1 => {
  const record = strictRecordV1(
    value,
    ["rubricId", "version", "requirements"],
    "e3S0SkillManifest.rubric"
  );
  return {
    rubricId: requiredIdV1(
      record.rubricId,
      "e3S0SkillManifest.rubric.rubricId"
    ),
    version: exactLiteral(
      record.version,
      "1.0.0",
      "e3S0SkillManifest.rubric.version"
    ),
    requirements: decodeCanonicalStringSetV1(
      record.requirements,
      "e3S0SkillManifest.rubric.requirements",
      { kind: "string", requireCanonical: true }
    ),
  };
};

const decodeManifest = (value: unknown): E3S0SkillPackageManifestV1 => {
  const record = strictRecordV1(
    value,
    [
      "contractVersion",
      "packageId",
      "packageVersion",
      "resource",
      "definition",
      "rubric",
    ],
    "e3S0SkillManifest"
  );
  const resource = strictRecordV1(
    record.resource,
    ["resourceId", "relativePath", "mediaType", "contentHash"],
    "e3S0SkillManifest.resource"
  );
  const definition = decodeSkillDefinitionV1(record.definition);
  if (
    definition.skillId !== E3_S0_SKILL_PACKAGE_V1.skillId ||
    definition.skillVersion !== E3_S0_SKILL_PACKAGE_V1.skillVersion ||
    definition.mode !== "prompt_recipe"
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_definition_identity_mismatch",
      "e3S0SkillManifest.definition",
      "E3 S0 Skill Definition differs from the frozen prompt recipe identity."
    );
  }
  return {
    contractVersion: exactLiteral(
      record.contractVersion,
      E3_S0_SKILL_PACKAGE_V1.contractVersion,
      "e3S0SkillManifest.contractVersion"
    ),
    packageId: exactLiteral(
      record.packageId,
      E3_S0_SKILL_PACKAGE_V1.packageId,
      "e3S0SkillManifest.packageId"
    ),
    packageVersion: exactLiteral(
      record.packageVersion,
      E3_S0_SKILL_PACKAGE_V1.packageVersion,
      "e3S0SkillManifest.packageVersion"
    ),
    resource: {
      resourceId: exactLiteral(
        resource.resourceId,
        E3_S0_SKILL_PACKAGE_V1.resourceId,
        "e3S0SkillManifest.resource.resourceId"
      ),
      relativePath: exactLiteral(
        resource.relativePath,
        E3_S0_SKILL_PACKAGE_V1.resourceRelativePath,
        "e3S0SkillManifest.resource.relativePath"
      ),
      mediaType: exactLiteral(
        resource.mediaType,
        E3_S0_SKILL_PACKAGE_V1.resourceMediaType,
        "e3S0SkillManifest.resource.mediaType"
      ),
      contentHash: requiredHashV1(
        resource.contentHash,
        "e3S0SkillManifest.resource.contentHash"
      ),
    },
    definition,
    rubric: decodeRubric(record.rubric),
  };
};

export const loadE3S0SkillPackageV1 = (
  paths: Readonly<{
    manifestPath?: string;
    resourcePath?: string;
  }> = {}
): LoadedE3S0SkillPackageV1 => {
  const manifestPath = paths.manifestPath ?? defaultManifestPath;
  const resourcePath =
    paths.resourcePath ??
    resolve(dirname(manifestPath), E3_S0_SKILL_PACKAGE_V1.resourceRelativePath);
  const manifestFile = readExactUtf8(
    manifestPath,
    "e3S0SkillManifest.source"
  );
  const resourceFile = readExactUtf8(
    resourcePath,
    "e3S0SkillResource.source"
  );
  const manifestSource = manifestFile.text;
  const promptText = resourceFile.text;
  let manifestValue: unknown;
  try {
    manifestValue = JSON.parse(manifestSource) as unknown;
  } catch {
    throw new StrictJsonErrorV1(
      "invalid_json",
      "e3S0SkillManifest",
      "E3 S0 Skill manifest is not valid JSON."
    );
  }
  const manifest = decodeManifest(manifestValue);
  const manifestHash = hashBytes(manifestFile.bytes);
  const resourceHash = hashBytes(resourceFile.bytes);
  if (
    manifest.resource.contentHash !== resourceHash ||
    manifest.definition.promptFragments.length !== 1 ||
    manifest.definition.promptFragments[0]!.resourceId !==
      manifest.resource.resourceId ||
    manifest.definition.promptFragments[0]!.contentHash !== resourceHash
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_resource_binding_mismatch",
      "e3S0SkillManifest.resource",
      "Prompt resource bytes do not match the exact Skill Definition binding."
    );
  }
  const rubricHash = hashCanonicalJsonV1(manifest.rubric);
  const packageDefinition = createSkillPackageDefinitionV1({
    packageId: manifest.packageId,
    packageVersion: manifest.packageVersion,
    definition: manifest.definition,
    promptResourceHashes: [resourceHash],
    rubricHash,
  });
  const definitionHash = packageDefinition.definitionHash;
  const packageHash = packageDefinition.packageHash;
  const sourceHash = hashCanonicalJsonV1({ manifestHash, resourceHash });
  if (
    manifestHash !== E3_S0_SKILL_PACKAGE_V1.frozenManifestHash ||
    resourceHash !== E3_S0_SKILL_PACKAGE_V1.frozenResourceHash ||
    definitionHash !== E3_S0_SKILL_PACKAGE_V1.frozenDefinitionHash ||
    rubricHash !== E3_S0_SKILL_PACKAGE_V1.frozenRubricHash ||
    packageHash !== E3_S0_SKILL_PACKAGE_V1.frozenPackageHash ||
    sourceHash !== E3_S0_SKILL_PACKAGE_V1.frozenSourceHash
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_package_source_mismatch",
      "e3S0SkillManifest",
      "E3 S0 Skill package differs from the exact frozen repo-owned source."
    );
  }
  const loaded = Object.freeze({
    manifest,
    packageDefinition,
    promptText,
    manifestHash,
    resourceHash,
    definitionHash,
    rubricHash,
    packageHash,
    sourceHash,
  });
  loadedPackages.add(loaded);
  return loaded;
};

export const assertTrustedE3S0SkillPackageV1 = (
  loaded: LoadedE3S0SkillPackageV1
) => {
  if (
    !loadedPackages.has(loaded) ||
    loaded.manifestHash !== E3_S0_SKILL_PACKAGE_V1.frozenManifestHash ||
    loaded.resourceHash !== E3_S0_SKILL_PACKAGE_V1.frozenResourceHash ||
    loaded.definitionHash !== E3_S0_SKILL_PACKAGE_V1.frozenDefinitionHash ||
    loaded.rubricHash !== E3_S0_SKILL_PACKAGE_V1.frozenRubricHash ||
    loaded.packageHash !== E3_S0_SKILL_PACKAGE_V1.frozenPackageHash ||
    loaded.sourceHash !== E3_S0_SKILL_PACKAGE_V1.frozenSourceHash ||
    decodeSkillPackageDefinitionV1(loaded.packageDefinition).packageHash !==
      loaded.packageHash
  ) {
    throw new StrictJsonErrorV1(
      "e3_s0_skill_package_untrusted",
      "e3S0SkillPackage",
      "E3 S0 Skill package was not loaded from the exact frozen Host source."
    );
  }
  return loaded;
};
