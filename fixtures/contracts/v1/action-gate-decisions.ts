import {
  ACTION_GATE_SCHEMA_VERSION,
  type ActionGateDecision,
  type ActionGateRequest,
  type ActionGrant,
} from "../../../packages/tool-runtime/contracts";

export type ActionGateDecisionFixture = Readonly<{
  id: string;
  scenario: string;
  request: ActionGateRequest;
  expectedDecision: ActionGateDecision;
}>;

export const ACTION_GATE_FIXTURE_NOW = "2026-09-10T00:00:00.000Z";

const schemaVersion = ACTION_GATE_SCHEMA_VERSION;
const patchTool = { name: "apply_patch", version: "1.0.0" } as const;

const originalPatchApproval = {
  grantId: "approval-fixture-patch-original",
  kind: "approval",
  principalId: "user-fixture",
  workspaceId: "workspace-fixture",
  runId: "run-action-gate-patch",
  attemptId: "attempt-action-gate-patch-1",
  toolName: patchTool.name,
  toolVersion: patchTool.version,
  catalogHash: "sha256:catalog-fixture-v1",
  policyVersion: "policy-fixture-v1",
  argumentsHash: "sha256:patch-original",
  expiresAt: "2026-09-10T01:00:00.000Z",
} satisfies ActionGrant;

const patchRequestWithoutApproval = {
  schemaVersion,
  principal: { id: "user-fixture", kind: "user" },
  workspaceId: "workspace-fixture",
  runId: "run-action-gate-patch",
  attemptId: "attempt-action-gate-patch-1",
  tool: patchTool,
  effectiveRisk: "L2",
  catalogHash: "sha256:catalog-fixture-v1",
  policyVersion: "policy-fixture-v1",
  argumentsHash: "sha256:patch-original",
  grants: [],
  priorReceiptIds: [],
} satisfies ActionGateRequest;

const approvalId = "approval:run-action-gate-patch:attempt-action-gate-patch-1:apply_patch:sha256:patch-original";
const approvalExpiry = "2026-09-10T00:15:00.000Z";

/**
 * Pure vectors for the gate. Each mismatch retains the original approval while
 * changing exactly one binding component on the request.
 */
export const actionGateDecisionFixtures = {
  allow: {
    id: "action-gate.allow-read-only.v1",
    scenario: "an L0 read-only tool is allowed without an approval grant",
    request: {
      schemaVersion,
      principal: { id: "user-fixture", kind: "user" },
      workspaceId: "workspace-fixture",
      runId: "run-action-gate-allow",
      attemptId: "attempt-action-gate-allow-1",
      tool: { name: "list_files", version: "1.0.0" },
      effectiveRisk: "L0",
      catalogHash: "sha256:catalog-fixture-v1",
      policyVersion: "policy-fixture-v1",
      argumentsHash: "sha256:list-files-root",
      grants: [],
      priorReceiptIds: [],
    },
    expectedDecision: { decision: "allow", reasonCode: "read_only_default_allow" },
  },
  ask: {
    id: "action-gate.ask-patch.v1",
    scenario: "a write asks for approval bound to the current argument hash",
    request: patchRequestWithoutApproval,
    expectedDecision: {
      decision: "ask",
      reasonCode: "approval_required",
      approvalId,
      argumentsHash: "sha256:patch-original",
      expiresAt: approvalExpiry,
    },
  },
  block: {
    id: "action-gate.block-policy.v1",
    scenario: "an L3 command is blocked before an approval can be requested",
    request: {
      schemaVersion,
      principal: { id: "user-fixture", kind: "user" },
      workspaceId: "workspace-fixture",
      runId: "run-action-gate-block",
      attemptId: "attempt-action-gate-block-1",
      tool: { name: "run_command", version: "1.0.0" },
      effectiveRisk: "L3",
      catalogHash: "sha256:catalog-fixture-v1",
      policyVersion: "policy-fixture-v1",
      argumentsHash: "sha256:blocked-command",
      grants: [],
      priorReceiptIds: [],
    },
    expectedDecision: { decision: "block", reasonCode: "command_policy_denied" },
  },
  "l3-with-approval-still-blocks": {
    id: "action-gate.block-l3-with-old-grant.v1",
    scenario: "an old approval cannot override a current L3 policy denial",
    request: {
      schemaVersion,
      principal: { id: "user-fixture", kind: "user" },
      workspaceId: "workspace-fixture",
      runId: "run-action-gate-l3-grant",
      attemptId: "attempt-action-gate-l3-grant-1",
      tool: { name: "run_command", version: "1.0.0" },
      effectiveRisk: "L3",
      catalogHash: "sha256:catalog-fixture-v1",
      policyVersion: "policy-fixture-v1",
      argumentsHash: "sha256:previously-approved-command",
      grants: [
        {
          grantId: "approval-fixture-old-command",
          kind: "approval",
          principalId: "user-fixture",
          workspaceId: "workspace-fixture",
          runId: "run-action-gate-l3-grant",
          attemptId: "attempt-action-gate-l3-grant-1",
          toolName: "run_command",
          toolVersion: "1.0.0",
          catalogHash: "sha256:catalog-fixture-v1",
          policyVersion: "policy-fixture-v1",
          argumentsHash: "sha256:previously-approved-command",
          expiresAt: "2026-09-10T01:00:00.000Z",
        },
      ],
      priorReceiptIds: [],
    },
    expectedDecision: { decision: "block", reasonCode: "command_policy_denied" },
  },
  "approved-allow": {
    id: "action-gate.allow-approved-patch.v1",
    scenario: "a non-expired approval matches every execution binding",
    request: { ...patchRequestWithoutApproval, grants: [originalPatchApproval] },
    expectedDecision: { decision: "allow", reasonCode: "approval_matched" },
  },
  "expired-approval": {
    id: "action-gate.ask-expired-approval.v1",
    scenario: "an otherwise matching approval expires and must be renewed",
    request: {
      ...patchRequestWithoutApproval,
      grants: [{ ...originalPatchApproval, expiresAt: "2026-09-09T23:59:59.999Z" }],
    },
    expectedDecision: {
      decision: "ask",
      reasonCode: "approval_expired",
      approvalId,
      argumentsHash: "sha256:patch-original",
      expiresAt: approvalExpiry,
    },
  },
  "tampered-arguments": {
    id: "action-gate.block-tampered-arguments.v1",
    scenario: "changed arguments invalidate a previously granted approval",
    request: {
      ...patchRequestWithoutApproval,
      argumentsHash: "sha256:patch-tampered",
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_arguments_mismatch" },
  },
  "catalog-mismatch": {
    id: "action-gate.block-catalog-mismatch.v1",
    scenario: "a changed frozen catalog invalidates the approval",
    request: {
      ...patchRequestWithoutApproval,
      catalogHash: "sha256:catalog-fixture-v2",
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_catalog_mismatch" },
  },
  "policy-mismatch": {
    id: "action-gate.block-policy-mismatch.v1",
    scenario: "a grant from an earlier policy version cannot authorize this policy",
    request: {
      ...patchRequestWithoutApproval,
      policyVersion: "policy-fixture-v2",
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_policy_mismatch" },
  },
  "tool-name-mismatch": {
    id: "action-gate.block-tool-name-mismatch.v1",
    scenario: "a grant for apply_patch cannot authorize write_file",
    request: {
      ...patchRequestWithoutApproval,
      tool: { name: "write_file", version: "1.0.0" },
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_tool_name_mismatch" },
  },
  "tool-version-mismatch": {
    id: "action-gate.block-tool-version-mismatch.v1",
    scenario: "a grant for one tool implementation cannot authorize another version",
    request: {
      ...patchRequestWithoutApproval,
      tool: { ...patchTool, version: "2.0.0" },
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_tool_version_mismatch" },
  },
  "principal-mismatch": {
    id: "action-gate.block-principal-mismatch.v1",
    scenario: "an approval cannot move between principals",
    request: {
      ...patchRequestWithoutApproval,
      principal: { id: "another-user", kind: "user" },
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_principal_mismatch" },
  },
  "workspace-mismatch": {
    id: "action-gate.block-workspace-mismatch.v1",
    scenario: "an approval cannot move between workspaces",
    request: {
      ...patchRequestWithoutApproval,
      workspaceId: "another-workspace",
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_workspace_mismatch" },
  },
  "run-mismatch": {
    id: "action-gate.block-run-mismatch.v1",
    scenario: "an approval is scoped to one run",
    request: {
      ...patchRequestWithoutApproval,
      runId: "another-run",
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_run_mismatch" },
  },
  "attempt-mismatch": {
    id: "action-gate.block-attempt-mismatch.v1",
    scenario: "a recovered attempt requires a fresh approval",
    request: {
      ...patchRequestWithoutApproval,
      attemptId: "attempt-action-gate-patch-2",
      grants: [originalPatchApproval],
    },
    expectedDecision: { decision: "block", reasonCode: "approval_attempt_mismatch" },
  },
} satisfies Record<string, ActionGateDecisionFixture>;
