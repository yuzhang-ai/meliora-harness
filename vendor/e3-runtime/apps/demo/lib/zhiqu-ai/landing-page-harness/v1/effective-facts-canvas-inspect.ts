import { createHash } from "node:crypto";
import type { RunBoundCanvasReadIdentityV1 } from "../../canvas-runtime/v1/canvas-context-read-port";
import { hashCanonicalV1 } from "../../canvas-runtime/v1/store-contracts";
import type {
  EffectiveFactsHostReceiptV1,
} from "../../editor-canvas/v1/effective-facts-turn-registry";
import type {
  UxEffectiveFactsAtomTypeV1,
  UxEffectiveFactsSnapshotV1,
} from "../../editor-canvas/v1/effective-facts-read-contract";
import {
  LANDING_PAGE_HARNESS_V1,
  createToolReceiptIdV1,
  decodeToolInvocationReceiptV1,
  type ToolInvocationReceiptV1,
  type ToolInvocationStatusV1,
  type ToolRetryDispositionV1,
} from "./contracts";
import type {
  ToolDescriptorV1,
  ToolExecutorInputV1,
  ToolExecutorPortV1,
} from "./tools";
import type { RunExecutionClaimV1 } from "./conversation-store";

export const EFFECTIVE_FACTS_CANVAS_INSPECT_V1 = Object.freeze({
  toolId: "canvas_inspect",
  toolVersion: "h1-effective-facts-inspect-v1",
  requestVersion: "h1-effective-facts-canvas-inspect-request-v1",
  resultVersion: "h1-effective-facts-canvas-inspect-result-v1",
  authority: "grant_bound_h1_turn_snapshot",
  freshness: "captured_at_turn_submit",
  maxNodeRefs: 4,
  maxObservationBytes: 32_768,
  maxCachedReceipts: 128,
} as const);

export type EffectiveFactsInspectGrantAuditV1 = Readonly<{
  grantAuditRef: string;
  authorizationDecisionRef: string;
  aclRevisionRef: string;
  grantExpiresAt: string;
  executionExpiresAt: string;
}>;

export type GrantedEffectiveFactsReadV1 = Readonly<{
  identity: RunBoundCanvasReadIdentityV1;
  snapshot: UxEffectiveFactsSnapshotV1;
  hostReceipt: EffectiveFactsHostReceiptV1;
  grantAudit: EffectiveFactsInspectGrantAuditV1;
  readBudget: Readonly<{ before: number; after: number; maximum: number }>;
}>;

export interface GrantedEffectiveFactsReadPortV1 {
  /**
   * Implementations are a server-owned security boundary: every read must
   * prove the immutable Run was admitted by one consumed Capture Grant, then
   * reauthorize the current execution, Host and principal/document ACL before
   * returning any snapshot bytes. The consumed admission Grant may have
   * expired; it is audit provenance, not the active execution clock. A Host
   * Registry read by itself does not satisfy this port.
   */
  read(input: Omit<RunBoundCanvasReadIdentityV1, "mountId"> & Readonly<{
    /** Store-backed active Runtime readers require this current fence. Pure
     * contract fixtures may omit it because they own no mutable Store budget. */
    executionClaim?: RunExecutionClaimV1;
    abortSignal?: AbortSignal;
  }>): Promise<GrantedEffectiveFactsReadV1>;
}

type InspectRequestV1 =
  | Readonly<{
      contractVersion: typeof EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion;
      scope: "summary";
    }>
  | Readonly<{
      contractVersion: typeof EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion;
      scope: "selection";
    }>
  | Readonly<{
      contractVersion: typeof EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion;
      scope: "nodes";
      nodeRefs: readonly string[];
    }>;

const idPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const sha = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");
const byteLength = (value: string) => new TextEncoder().encode(value).byteLength;

const argumentsHash = (value: string) => {
  try {
    return hashCanonicalV1(JSON.parse(value));
  } catch {
    return sha(value);
  }
};

const decodeRequest = (value: string): InspectRequestV1 | null => {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    return null;
  }
  if (
    parsed === null ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.getPrototypeOf(parsed) !== Object.prototype
  ) {
    return null;
  }
  const input = parsed as Record<string, unknown>;
  const exact = (keys: readonly string[]) =>
    Object.keys(input).length === keys.length &&
    keys.every((key) => Object.hasOwn(input, key));
  if (
    input.contractVersion !==
    EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion
  ) {
    return null;
  }
  if (
    (input.scope === "summary" || input.scope === "selection") &&
    exact(["contractVersion", "scope"])
  ) {
    return {
      contractVersion: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion,
      scope: input.scope,
    };
  }
  if (
    input.scope === "nodes" &&
    exact(["contractVersion", "scope", "nodeRefs"]) &&
    Array.isArray(input.nodeRefs) &&
    Object.getPrototypeOf(input.nodeRefs) === Array.prototype &&
    input.nodeRefs.length >= 1 &&
    input.nodeRefs.length <= EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxNodeRefs &&
    input.nodeRefs.every(
      (item) => typeof item === "string" && idPattern.test(item)
    ) &&
    new Set(input.nodeRefs).size === input.nodeRefs.length
  ) {
    return {
      contractVersion: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion,
      scope: "nodes",
      nodeRefs: input.nodeRefs as string[],
    };
  }
  return null;
};

const descriptor: ToolDescriptorV1 = Object.freeze({
  toolId: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId,
  version: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion,
  description:
    "Read bounded submission-time Effective Facts for the current grant-bound H1 Run. Call this Tool at most once per Run: one completed Receipt exhausts the H1 read budget, so use the returned facts and submit_turn_outcome without another canvas_inspect call. Only summary, selection, and up to four exact node references are supported. This is not a live Canvas read and cannot modify, save, publish, preview, or undo the page.",
  effect: "read_only",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["contractVersion", "scope"],
    properties: {
      contractVersion: {
        type: "string",
        const: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.requestVersion,
      },
      scope: {
        type: "string",
        enum: ["summary", "selection", "nodes"],
      },
      nodeRefs: {
        type: "array",
        minItems: 1,
        maxItems: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxNodeRefs,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 128 },
      },
    },
  },
});

const receipt = (
  input: ToolExecutorInputV1,
  status: ToolInvocationStatusV1,
  retryDisposition: ToolRetryDispositionV1,
  observation: string,
  createdAt: string
): ToolInvocationReceiptV1 => {
  const resultHash = sha(observation);
  const projection: Omit<
    ToolInvocationReceiptV1,
    "contractVersion" | "receiptId" | "observation"
  > = {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    threadId: input.threadId,
    turnId: input.turnId,
    runId: input.runId,
    callId: input.callId,
    toolId: input.toolId,
    toolVersion: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolVersion,
    argumentsHash: argumentsHash(input.argumentsJson),
    resultHash,
    resultRef: `tool-observation:sha256:${resultHash}`,
    writeCertainty: "not_applicable",
    status,
    retryDisposition,
    createdAt,
  };
  return decodeToolInvocationReceiptV1({
    contractVersion: LANDING_PAGE_HARNESS_V1.toolReceipt,
    receiptId: createToolReceiptIdV1(projection),
    ...projection,
    observation,
  });
};

const unavailable = (code: string) =>
  JSON.stringify({
    kind: "h1_effective_facts_inspect_unavailable",
    authority: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.authority,
    code,
    truthfulNextStep:
      "Continue without claiming a Canvas fact, or obtain a fresh authorized H1 capture grant.",
  });

const provenance = (read: GrantedEffectiveFactsReadV1) => ({
  authority: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.authority,
  freshness: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.freshness,
  routePath: read.hostReceipt.routePath,
  captureProfile: read.hostReceipt.captureProfile,
  documentId: read.hostReceipt.documentId,
  mountId: read.hostReceipt.mountId,
  viewport: read.hostReceipt.viewport,
  observedAt: read.hostReceipt.observedAt,
  expiresAt: read.grantAudit.executionExpiresAt,
  hostBindingHash: read.hostReceipt.hostBindingHash,
  revisionFingerprint: read.hostReceipt.revisionFingerprint,
  snapshotFingerprint: read.hostReceipt.snapshotFingerprint,
  grantAuditRef: read.grantAudit.grantAuditRef,
  authorizationDecisionRef: read.grantAudit.authorizationDecisionRef,
  aclRevisionRef: read.grantAudit.aclRevisionRef,
  readBudget: read.readBudget,
});

const assertReadClosure = (
  input: ToolExecutorInputV1,
  read: GrantedEffectiveFactsReadV1,
  now: number
) => {
  const expected = {
    workspaceId: input.workspaceId,
    sessionId: input.sessionId,
    documentId: input.documentId ?? "",
    threadId: input.threadId,
    turnId: input.turnId,
    runId: input.runId,
  };
  for (const [key, value] of Object.entries(expected)) {
    if (read.identity[key as keyof typeof expected] !== value) {
      throw new Error("h1_effective_facts_read_identity_mismatch");
    }
  }
  if (
    read.identity.mountId !== read.hostReceipt.mountId ||
    read.snapshot.documentId !== read.hostReceipt.documentId ||
    read.snapshot.mountId !== read.hostReceipt.mountId ||
    read.snapshot.routePath !== read.hostReceipt.routePath ||
    read.snapshot.captureProfile !== read.hostReceipt.captureProfile ||
    read.snapshot.effectiveFactsFingerprint !==
      read.hostReceipt.snapshotFingerprint ||
    read.snapshot.rawDataFingerprint !== read.hostReceipt.rawDataFingerprint ||
    !Number.isFinite(Date.parse(read.hostReceipt.expiresAt)) ||
    !Number.isFinite(Date.parse(read.grantAudit.grantExpiresAt)) ||
    !Number.isFinite(Date.parse(read.grantAudit.executionExpiresAt)) ||
    Date.parse(read.hostReceipt.expiresAt) <= now ||
    Date.parse(read.grantAudit.executionExpiresAt) <= now ||
    Date.parse(read.grantAudit.executionExpiresAt) >
      Date.parse(read.hostReceipt.expiresAt) ||
    !/^grant-audit:sha256:[a-f0-9]{64}$/u.test(
      read.grantAudit.grantAuditRef
    ) ||
    !/^acl-decision:sha256:[a-f0-9]{64}$/u.test(
      read.grantAudit.authorizationDecisionRef
    ) ||
    !/^acl-revision:sha256:[a-f0-9]{64}$/u.test(
      read.grantAudit.aclRevisionRef
    ) ||
    read.readBudget.after !== read.readBudget.before + 1 ||
    read.readBudget.after > read.readBudget.maximum
  ) {
    throw new Error("h1_effective_facts_read_closure_mismatch");
  }
};

const atomCounts = (snapshot: UxEffectiveFactsSnapshotV1) => {
  const counts = Object.create(null) as Record<UxEffectiveFactsAtomTypeV1, number>;
  for (const node of snapshot.nodes) {
    counts[node.atomType] = (counts[node.atomType] ?? 0) + 1;
  }
  return Object.fromEntries(
    Object.entries(counts).sort(([left], [right]) =>
      left < right ? -1 : left > right ? 1 : 0
    )
  );
};

/**
 * H1-only read executor. A canvas_inspect miss or invalid H1 binding never
 * falls through to the legacy C6A projector/executor. Other non-canvas tools
 * may still be delegated to the ordinary Harness fallback.
 */
export class EffectiveFactsCanvasInspectExecutorV1
  implements ToolExecutorPortV1
{
  private readonly receipts = new Map<
    string,
    Readonly<{ argumentsHash: string; receipt: ToolInvocationReceiptV1 }>
  >();
  private readonly inflight = new Map<
    string,
    Readonly<{
      argumentsHash: string;
      promise: Promise<ToolInvocationReceiptV1>;
    }>
  >();

  constructor(
    private readonly reads: GrantedEffectiveFactsReadPortV1,
    private readonly fallback?: ToolExecutorPortV1,
    private readonly clock: () => number = Date.now
  ) {}

  listDescriptors() {
    return [
      ...(this.fallback
        ? this.fallback
            .listDescriptors()
            .filter(
              (item) => item.toolId !== EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId
            )
        : []),
      structuredClone(descriptor),
    ];
  }

  async execute(input: ToolExecutorInputV1): Promise<ToolInvocationReceiptV1> {
    if (input.toolId !== EFFECTIVE_FACTS_CANVAS_INSPECT_V1.toolId) {
      if (this.fallback) return this.fallback.execute(input);
      throw new Error("h1_non_canvas_tool_forbidden");
    }
    const cacheKey = [
      input.workspaceId,
      input.sessionId,
      input.documentId ?? "",
      input.threadId,
      input.turnId,
      input.runId,
      input.callId,
    ].join("\u0000");
    const nextArgumentsHash = argumentsHash(input.argumentsJson);
    const cached = this.receipts.get(cacheKey);
    if (cached) {
      if (cached.argumentsHash !== nextArgumentsHash) {
        throw new Error("h1_tool_call_identity_conflict");
      }
      return structuredClone(cached.receipt);
    }
    const active = this.inflight.get(cacheKey);
    if (active) {
      if (active.argumentsHash !== nextArgumentsHash) {
        throw new Error("h1_tool_call_identity_conflict");
      }
      return structuredClone(await active.promise);
    }
    if (this.receipts.size + this.inflight.size >=
      EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxCachedReceipts) {
      return receipt(
        input,
        "unavailable",
        "do_not_retry",
        unavailable("h1_receipt_cache_capacity_exceeded"),
        new Date(0).toISOString()
      );
    }
    const promise = this.executeOnce(input);
    this.inflight.set(cacheKey, {
      argumentsHash: nextArgumentsHash,
      promise,
    });
    try {
      const output = await promise;
      this.receipts.set(cacheKey, {
        argumentsHash: nextArgumentsHash,
        receipt: output,
      });
      return structuredClone(output);
    } finally {
      this.inflight.delete(cacheKey);
    }
  }

  private async executeOnce(input: ToolExecutorInputV1) {
    const createdAt = new Date(this.clock()).toISOString();
    const request = decodeRequest(input.argumentsJson);
    if (!request) {
      return receipt(
        input,
        "schema_invalid",
        "revise_input",
        JSON.stringify({
          kind: "h1_effective_facts_inspect_error",
          code: "inspect_request_invalid",
        }),
        createdAt
      );
    }
    if (!input.documentId) {
      return receipt(
        input,
        "denied",
        "do_not_retry",
        unavailable("document_scope_missing"),
        createdAt
      );
    }
    let read: GrantedEffectiveFactsReadV1;
    try {
      read = await this.reads.read({
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        documentId: input.documentId,
        threadId: input.threadId,
        turnId: input.turnId,
        runId: input.runId,
        executionClaim: input.executionClaim,
        abortSignal: input.abortSignal,
      });
      assertReadClosure(input, read, this.clock());
    } catch {
      return receipt(
        input,
        "unavailable",
        "do_not_retry",
        unavailable("grant_bound_turn_snapshot_unavailable"),
        createdAt
      );
    }
    const common = {
      contractVersion: EFFECTIVE_FACTS_CANVAS_INSPECT_V1.resultVersion,
      provenance: provenance(read),
      scope: request.scope,
    };
    let payload: unknown;
    if (request.scope === "summary") {
      payload = {
        rootNodeRefs: read.snapshot.rootNodeRefs,
        nodeCount: read.snapshot.nodes.length,
        atomTypeCounts: atomCounts(read.snapshot),
      };
    } else if (request.scope === "selection") {
      const nodeRefs = read.snapshot.selection.nodeRefs.slice(
        0,
        EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxNodeRefs
      );
      const byRef = new Map(
        read.snapshot.nodes.map((node) => [node.nodeRef, node] as const)
      );
      const nodes = nodeRefs
        .map((nodeRef) => byRef.get(nodeRef))
        .filter((node): node is NonNullable<typeof node> => Boolean(node));
      payload = {
        nodeRefs,
        nodes,
        truncated:
          read.snapshot.selection.nodeRefs.length >
          EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxNodeRefs,
      };
    } else {
      const byRef = new Map(
        read.snapshot.nodes.map((node) => [node.nodeRef, node] as const)
      );
      const nodes = request.nodeRefs.map((nodeRef) => byRef.get(nodeRef));
      if (nodes.some((node) => !node)) {
        return receipt(
          input,
          "schema_invalid",
          "revise_input",
          JSON.stringify({
            kind: "h1_effective_facts_inspect_error",
            code: "node_not_found",
          }),
          createdAt
        );
      }
      payload = { nodes };
    }
    const observation = JSON.stringify({
      kind: "h1_effective_facts_inspect_result",
      ...common,
      payload,
    });
    if (
      byteLength(observation) >
      EFFECTIVE_FACTS_CANVAS_INSPECT_V1.maxObservationBytes
    ) {
      return receipt(
        input,
        "unavailable",
        "do_not_retry",
        unavailable("inspect_result_budget_exceeded"),
        createdAt
      );
    }
    return receipt(input, "completed", "do_not_retry", observation, createdAt);
  }
}
