import type { E3S0AdmissionInputV1 } from "./e3-s0-skill-admission-service";
import type { E3S0SkillDriverV1 } from "./e3-s0-skill-driver";
import { requiredIdV1 } from "./strict-json";

export const runDirectedE3S0SkillWorkerEntryV1 = (input: Readonly<{
  driver: E3S0SkillDriverV1;
  runId: string;
  request: E3S0AdmissionInputV1;
  revisionBinding: string;
  abortSignal?: AbortSignal;
}>) => {
  const runId = requiredIdV1(input.runId, "e3SkillWorkerEntry.runId");
  if (runId !== input.request.runId) throw new Error("e3_skill_worker_run_mismatch");
  return input.driver.run({
    request: input.request,
    revisionBinding: input.revisionBinding,
    ...(input.abortSignal ? { abortSignal: input.abortSignal } : {}),
  });
};
