import {
  ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
  ATOMIC_AI_SAAS_SECTION_PROFILE_V1,
} from "../../../../config/blocks/editor-kernel/atomic-ai-saas-section-profile";
import { hashCanonicalJsonV1 } from "./strict-json";

export const e3PrincipalHashV1 = (actorId: string, sessionId: string) =>
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-e3-principal-binding-v1",
    actorId,
    sessionId,
  });

export const e3S0AclSnapshotHashV1 = (actorId: string, sessionId: string) =>
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-e3-effect-authority-profile-v1",
    profile: "read_only",
    actorId,
    sessionId,
    permissions: ["canvas.read.effective-facts.h1"],
  });

export const e3S1AclSnapshotHashV1 = (actorId: string, sessionId: string) =>
  hashCanonicalJsonV1({
    contractVersion: "formal-r3-e3-effect-authority-profile-v1",
    profile: "fixed_saas_write",
    actorId,
    sessionId,
    profileHash: ATOMIC_AI_SAAS_SECTION_PROFILE_HASH_V1,
    effects: ATOMIC_AI_SAAS_SECTION_PROFILE_V1.sectionOrder,
    batchEffect: "fixed_page_batch",
    permission: ATOMIC_AI_SAAS_SECTION_PROFILE_V1.permission,
  });
