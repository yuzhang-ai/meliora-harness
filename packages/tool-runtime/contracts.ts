import type { JsonObject } from "../model-protocol/contracts";

export const TOOL_CONTRACT_SCHEMA_VERSION = "meliora.tool.v1" as const;

export type ToolRisk = "L0" | "L1" | "L2" | "L3";
export type ToolCancellation = "cooperative" | "process-tree" | "none";

export type ToolDefinition = Readonly<{
  schemaVersion: typeof TOOL_CONTRACT_SCHEMA_VERSION;
  name: string;
  version: string;
  description: string;
  inputSchema: JsonObject;
  schemaDialect: "https://json-schema.org/draft/2020-12/schema";
  risk: ToolRisk;
  timeoutMs: number;
  outputLimit: number;
  capabilities: readonly string[];
  cancellation: ToolCancellation;
  projector: string;
}>;

export type ToolCatalogSnapshot = Readonly<{
  schemaVersion: "meliora.tool-catalog.v1";
  catalogVersion: string;
  catalogHash: string;
  definitions: readonly ToolDefinition[];
}>;

export const ACTION_GATE_SCHEMA_VERSION = "meliora.action-gate.v1" as const;

/** The human or service on whose authority a tool call is evaluated. */
export type ActionGatePrincipal = Readonly<{
  id: string;
  kind: "user" | "service" | "system";
}>;

/**
 * Tool identity is versioned independently from its display name so that a grant
 * for one implementation cannot authorize another implementation with the same
 * name.
 */
export type ActionGateToolIdentity = Readonly<{
  name: string;
  version: string;
}>;

/**
 * A durable grant made available to the gate for this request. Approval grants
 * are parameter-bound; their argumentsHash must match the request exactly.
 */
export type ActionGrant = Readonly<{
  grantId: string;
  kind: "tool" | "approval";
  principalId: string;
  workspaceId: string;
  runId: string;
  attemptId: string;
  toolName: string;
  toolVersion: string;
  catalogHash: string;
  policyVersion: string;
  argumentsHash: string;
  expiresAt: string;
}>;

export type ActionGateRequest = Readonly<{
  schemaVersion: typeof ACTION_GATE_SCHEMA_VERSION;
  principal: ActionGatePrincipal;
  workspaceId: string;
  runId: string;
  attemptId: string;
  tool: ActionGateToolIdentity;
  /** Policy-resolved risk; dynamic tools must be upgraded before gate evaluation. */
  effectiveRisk: ToolRisk;
  catalogHash: string;
  policyVersion: string;
  argumentsHash: string;
  grants: readonly ActionGrant[];
  priorReceiptIds: readonly string[];
}>;

export type ActionGateDecision =
  | Readonly<{
      decision: "allow";
      reasonCode: string;
    }>
  | Readonly<{
      decision: "block";
      reasonCode: string;
    }>
  | Readonly<{
      decision: "ask";
      reasonCode: string;
      approvalId: string;
      argumentsHash: string;
      expiresAt: string;
    }>;

export type ToolInvocationStatus =
  | "reserved"
  | "awaiting_approval"
  | "executing"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "outcome_unknown";

export type NormalizedToolInvocation = Readonly<{
  schemaVersion: "meliora.tool-invocation.v1";
  invocationId: string;
  runId: string;
  attemptId: string;
  toolName: string;
  toolVersion: string;
  arguments: JsonObject;
  argumentsHash: string;
  catalogHash: string;
  idempotencyKey: string;
  status: ToolInvocationStatus;
}>;

export type ToolReceipt = Readonly<{
  schemaVersion: "meliora.tool-receipt.v1";
  receiptId: string;
  invocationId: string;
  runId: string;
  attemptId: string;
  toolName: string;
  toolVersion: string;
  argumentsHash: string;
  catalogHash: string;
  decision: "allow" | "approved";
  startedAt: string;
  endedAt: string;
  status: "succeeded" | "failed" | "cancelled";
  effectSummary: string;
  outputArtifactId?: string;
  verificationArtifactIds: readonly string[];
  redactions: readonly string[];
  beforeHash?: string;
  afterHash?: string;
}>;
