import type {
  ActionGateDecision,
  ActionGateRequest,
  ActionGrant,
} from "./contracts";

const APPROVAL_TTL_MS = 15 * 60 * 1000;

const approvalIdFor = (request: ActionGateRequest): string =>
  `approval:${request.runId}:${request.attemptId}:${request.tool.name}:${request.argumentsHash}`;

const askForApproval = (request: ActionGateRequest, now: Date, reasonCode: string): ActionGateDecision => ({
  decision: "ask",
  reasonCode,
  approvalId: approvalIdFor(request),
  argumentsHash: request.argumentsHash,
  expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
});

type GrantMismatch = Readonly<{
  field:
    | "principal"
    | "workspace"
    | "run"
    | "attempt"
    | "tool_name"
    | "tool_version"
    | "catalog"
    | "policy"
    | "arguments";
}>;

const grantMismatch = (request: ActionGateRequest, grant: ActionGrant): GrantMismatch | null => {
  if (grant.principalId !== request.principal.id) return { field: "principal" };
  if (grant.workspaceId !== request.workspaceId) return { field: "workspace" };
  if (grant.runId !== request.runId) return { field: "run" };
  if (grant.attemptId !== request.attemptId) return { field: "attempt" };
  if (grant.toolName !== request.tool.name) return { field: "tool_name" };
  if (grant.toolVersion !== request.tool.version) return { field: "tool_version" };
  if (grant.catalogHash !== request.catalogHash) return { field: "catalog" };
  if (grant.policyVersion !== request.policyVersion) return { field: "policy" };
  if (grant.argumentsHash !== request.argumentsHash) return { field: "arguments" };
  return null;
};

const grantPrefix = (grant: ActionGrant): "approval" | "tool_grant" =>
  grant.kind === "approval" ? "approval" : "tool_grant";

/**
 * Deterministic M0 gate evaluator. Runtime policy resolution supplies
 * `effectiveRisk`; this function only applies the frozen default policy and
 * verifies that any existing grant is bound to this exact execution identity.
 */
export const evaluateActionGate = (request: ActionGateRequest, now: Date): ActionGateDecision => {
  // A deny is absolute. Historical grants cannot lower a policy-resolved L3 risk.
  if (request.effectiveRisk === "L3") {
    return {
      decision: "block",
      reasonCode: request.tool.name === "run_command" ? "command_policy_denied" : "risk_l3_default_block",
    };
  }

  const grants = request.grants;

  for (const grant of grants) {
    const mismatch = grantMismatch(request, grant);
    if (!mismatch && Date.parse(grant.expiresAt) > now.getTime()) {
      return {
        decision: "allow",
        reasonCode: `${grantPrefix(grant)}_matched`,
      };
    }
  }

  for (const grant of grants) {
    if (grantMismatch(request, grant) === null && Date.parse(grant.expiresAt) <= now.getTime()) {
      return askForApproval(request, now, `${grantPrefix(grant)}_expired`);
    }
  }

  const firstMismatchedGrant = grants.find((grant) => grantMismatch(request, grant) !== null);
  if (firstMismatchedGrant) {
    const mismatch = grantMismatch(request, firstMismatchedGrant);
    if (mismatch) {
      return {
        decision: "block",
        reasonCode: `${grantPrefix(firstMismatchedGrant)}_${mismatch.field}_mismatch`,
      };
    }
  }

  if (request.effectiveRisk === "L0") {
    return { decision: "allow", reasonCode: "read_only_default_allow" };
  }

  return askForApproval(request, now, "approval_required");
};
