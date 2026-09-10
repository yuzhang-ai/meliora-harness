import type { E3S0SkillSelectionSourceV1 } from "./e3-s0-skill-profile";
import { E3_S0_SKILL_PACKAGE_V1 } from "./e3-s0-skill-package";

export const E3_S0_SKILL_SELECTION_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-skill-selection-v1",
  phase: "E3-A3",
  selectedSkillId: E3_S0_SKILL_PACKAGE_V1.skillId,
  selectedSkillVersion: E3_S0_SKILL_PACKAGE_V1.skillVersion,
  canvasWrite: false,
} as const);

export const resolveE3S0SkillSelectionV1 = (input: Readonly<{
  source: E3S0SkillSelectionSourceV1;
  skillId: string;
  skillVersion: string;
}>) => {
  if (
    input.skillId !== E3_S0_SKILL_PACKAGE_V1.skillId ||
    input.skillVersion !== E3_S0_SKILL_PACKAGE_V1.skillVersion ||
    !(["user_explicit", "actor_selected"] as const).includes(input.source)
  ) throw new Error("e3_skill_selection_outside_frozen_profile");
  return Object.freeze({
    source: input.source,
    skillId: E3_S0_SKILL_PACKAGE_V1.skillId,
    skillVersion: E3_S0_SKILL_PACKAGE_V1.skillVersion,
    packageHash: E3_S0_SKILL_PACKAGE_V1.frozenPackageHash,
  });
};
