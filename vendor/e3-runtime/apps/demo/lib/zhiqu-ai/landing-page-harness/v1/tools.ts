import { createHash } from "node:crypto";
import type {
  PlanStepV1,
  ToolInvocationReceiptV1,
  ToolInvocationStatusV1,
  ToolRetryDispositionV1,
} from "./contracts";
import { LANDING_PAGE_HARNESS_V1, createToolReceiptIdV1 } from "./contracts";
import {
  FINAL_CLAIM_EFFECTS_V1,
  LANDING_PAGE_GOVERNANCE_V1,
  TURN_DELIVERY_OUTCOMES_V1,
  decodeGoalContractV1,
  decodeTurnOutcomeProposalV1,
} from "./governance-contracts";
import type { RunExecutionClaimV1 } from "./conversation-store";
import { NodePublicWebReaderV1, PublicWebReadErrorV1, type PublicWebReaderPortV1 } from "./public-web";
import { hashCanonicalJsonV1, strictRecordV1 } from "./strict-json";

export type ToolDescriptorV1 = Readonly<{
  toolId: string;
  version: string;
  description: string;
  inputSchema: Readonly<Record<string, unknown>>;
  effect: "runtime_state" | "read_only" | "capability_read";
}>;

export type ToolExecutionContextV1 = Readonly<{
  runId: string;
  callId: string;
  abortSignal?: AbortSignal;
}>;

export type ToolExecutionResultV1 = Readonly<{
  status: ToolInvocationStatusV1;
  retryDisposition: ToolRetryDispositionV1;
  observation: string;
}>;

export type ToolExecutorInputV1 = Readonly<{
  workspaceId: string;
  documentId?: string;
  sessionId: string;
  threadId: string;
  turnId: string;
  runId: string;
  callId: string;
  toolId: string;
  argumentsJson: string;
  /**
   * Trusted-Kernel scheduling fence. It is never model-visible and does not
   * replace an operation-bound authority commit lease. H1 data-plane tools
   * require it so a worker that lost its Run claim cannot consume private
   * read budget while its eventual Receipt settlement is already fenced out.
   */
  executionClaim?: RunExecutionClaimV1;
  abortSignal?: AbortSignal;
}>;

export interface ToolExecutorPortV1 {
  listDescriptors(): ToolDescriptorV1[];
  execute(input: ToolExecutorInputV1): Promise<ToolInvocationReceiptV1>;
  canReconcile?(toolId: string): boolean;
  reconcile?(input: ToolExecutorInputV1): Promise<ToolInvocationReceiptV1>;
}

type ToolHandlerV1 = (
  argumentsValue: unknown,
  context: ToolExecutionContextV1
) => Promise<ToolExecutionResultV1>;

const sha = (value: string) =>
  createHash("sha256").update(value, "utf8").digest("hex");

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value as Record<string, unknown>)
    .sort()
    .map(
      (key) =>
        `${JSON.stringify(key)}:${stableStringify(
          (value as Record<string, unknown>)[key]
        )}`
    )
    .join(",")}}`;
};

const parseArguments = (value: string) => {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed) ||
      Object.getPrototypeOf(parsed) !== Object.prototype
    ) {
      throw new Error("not_plain_object");
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
};

const resources = Object.freeze({
  "landing-page-playbook": Object.freeze({
    version: "2026-08-28.1",
    text: [
      "落地页先明确单一转化目标，再组织信息层级。",
      "首屏需要回答面向谁、解决什么问题、为什么可信、下一步做什么。",
      "证据应区分事实、推断和建议；不可把未知数据写成已验证结果。",
      "CTA 文案应具体，表单字段数量要与线索价值和用户意愿匹配。",
      "移动端优先检查标题换行、首屏高度、按钮可触达性和表单输入体验。",
    ].join("\n"),
  }),
});

const terminalIdSchema = Object.freeze({
  type: "string",
  minLength: 1,
  maxLength: 128,
});

export const SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1 = Object.freeze({
  type: "object",
  additionalProperties: false,
  required: ["goal", "proposal"],
  properties: {
    goal: { $ref: "#/$defs/goal" },
    proposal: { $ref: "#/$defs/proposal" },
  },
  $defs: {
    requirement: {
      type: "object",
      additionalProperties: false,
      required: ["requirementId", "description", "requiredEffects"],
      properties: {
        requirementId: terminalIdSchema,
        description: { type: "string", minLength: 1, maxLength: 1000 },
        requiredEffects: {
          type: "array",
          minItems: 1,
          maxItems: FINAL_CLAIM_EFFECTS_V1.length,
          uniqueItems: true,
          items: { type: "string", enum: FINAL_CLAIM_EFFECTS_V1 },
        },
      },
    },
    amendment: {
      type: "object",
      additionalProperties: false,
      required: ["contractVersion", "amendmentId", "revision", "instruction"],
      properties: {
        contractVersion: {
          type: "string",
          const: LANDING_PAGE_GOVERNANCE_V1.amendment,
        },
        amendmentId: terminalIdSchema,
        revision: { type: "integer", minimum: 2 },
        instruction: { type: "string", minLength: 1, maxLength: 20000 },
      },
    },
    goal: {
      type: "object",
      additionalProperties: false,
      required: [
        "contractVersion",
        "goalId",
        "originalIntent",
        "intentRevision",
        "requirements",
        "amendments",
      ],
      properties: {
        contractVersion: {
          type: "string",
          const: LANDING_PAGE_GOVERNANCE_V1.goal,
        },
        goalId: terminalIdSchema,
        originalIntent: { type: "string", minLength: 1, maxLength: 20000 },
        intentRevision: { type: "integer", minimum: 1 },
        requirements: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          items: { $ref: "#/$defs/requirement" },
        },
        amendments: {
          type: "array",
          maxItems: 32,
          items: { $ref: "#/$defs/amendment" },
        },
      },
    },
    alternativePath: {
      type: "object",
      additionalProperties: false,
      required: ["pathId", "description", "disposition"],
      properties: {
        pathId: terminalIdSchema,
        description: { type: "string", minLength: 1, maxLength: 500 },
        disposition: {
          type: "string",
          enum: ["selected", "declined", "unavailable"],
        },
      },
    },
    capabilityGap: {
      type: "object",
      additionalProperties: false,
      required: [
        "contractVersion",
        "gapId",
        "goalId",
        "requirementIds",
        "capabilityFactId",
        "unfulfilledEffects",
        "alternativePaths",
        "resolutionOwner",
        "retryCondition",
      ],
      properties: {
        contractVersion: {
          type: "string",
          const: LANDING_PAGE_GOVERNANCE_V1.capabilityGap,
        },
        gapId: terminalIdSchema,
        goalId: terminalIdSchema,
        requirementIds: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          uniqueItems: true,
          items: terminalIdSchema,
        },
        capabilityFactId: terminalIdSchema,
        unfulfilledEffects: {
          type: "array",
          minItems: 1,
          maxItems: FINAL_CLAIM_EFFECTS_V1.length,
          uniqueItems: true,
          items: { type: "string", enum: FINAL_CLAIM_EFFECTS_V1 },
        },
        alternativePaths: {
          type: "array",
          maxItems: 16,
          items: { $ref: "#/$defs/alternativePath" },
        },
        resolutionOwner: {
          type: "string",
          enum: ["actor", "user", "technical_owner", "policy_owner"],
        },
        retryCondition: {
          oneOf: [
            { type: "null" },
            { type: "string", minLength: 1, maxLength: 500 },
          ],
        },
      },
    },
    finalClaim: {
      type: "object",
      additionalProperties: false,
      required: [
        "contractVersion",
        "claimId",
        "requirementIds",
        "effect",
        "state",
        "evidenceRefs",
      ],
      properties: {
        contractVersion: {
          type: "string",
          const: LANDING_PAGE_GOVERNANCE_V1.finalClaim,
        },
        claimId: terminalIdSchema,
        requirementIds: {
          type: "array",
          minItems: 1,
          maxItems: 64,
          uniqueItems: true,
          items: terminalIdSchema,
        },
        effect: { type: "string", enum: FINAL_CLAIM_EFFECTS_V1 },
        state: { type: "string", enum: ["completed", "not_completed"] },
        evidenceRefs: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: terminalIdSchema,
        },
      },
    },
    proposal: {
      type: "object",
      additionalProperties: false,
      required: [
        "contractVersion",
        "proposalId",
        "goalId",
        "outcome",
        "summary",
        "completedRequirementIds",
        "unresolvedRequirementIds",
        "capabilityGaps",
        "finalClaims",
        "actorDraftText",
      ],
      properties: {
        contractVersion: {
          type: "string",
          const: LANDING_PAGE_GOVERNANCE_V1.turnOutcome,
        },
        proposalId: terminalIdSchema,
        goalId: terminalIdSchema,
        outcome: { type: "string", enum: TURN_DELIVERY_OUTCOMES_V1 },
        summary: { type: "string", minLength: 1, maxLength: 4000 },
        completedRequirementIds: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: terminalIdSchema,
        },
        unresolvedRequirementIds: {
          type: "array",
          maxItems: 64,
          uniqueItems: true,
          items: terminalIdSchema,
        },
        capabilityGaps: {
          type: "array",
          maxItems: 32,
          items: { $ref: "#/$defs/capabilityGap" },
        },
        finalClaims: {
          type: "array",
          maxItems: 64,
          items: { $ref: "#/$defs/finalClaim" },
        },
        actorDraftText: { type: "string", minLength: 1, maxLength: 16000 },
      },
    },
  },
});

const descriptors: readonly ToolDescriptorV1[] = Object.freeze([
  {
    toolId: "read_public_web",
    version: "1.0.0",
    description:
      "Read a public HTTP(S) webpage as untrusted source material. Use when the user asks to inspect or summarize a webpage. Private networks, credential URLs, unsafe redirects, oversized bodies, and non-text responses are denied.",
    effect: "read_only",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["url"],
      properties: {
        url: { type: "string", minLength: 8, maxLength: 2_048 },
      },
    },
  },
  {
    toolId: "update_plan",
    version: "1.0.0",
    description:
      "Create or update the current landing-page task plan. Call this tool whenever the user explicitly asks to split, create, or update a plan, and for other multi-step work.",
    effect: "runtime_state",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          minItems: 1,
          maxItems: 12,
          items: {
            type: "object",
            additionalProperties: false,
            required: ["description", "status"],
            properties: {
              description: { type: "string", minLength: 1, maxLength: 240 },
              status: {
                type: "string",
                enum: ["pending", "in_progress", "completed"],
              },
            },
          },
        },
      },
    },
  },
  {
    toolId: "read_resource_range",
    version: "1.0.0",
    description:
      "Read a bounded range from a trusted landing-page resource. This is read-only.",
    effect: "read_only",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: ["resourceId", "start", "end"],
      properties: {
        resourceId: { type: "string", enum: ["landing-page-playbook"] },
        start: { type: "integer", minimum: 0 },
        end: { type: "integer", minimum: 1 },
      },
    },
  },
  {
    toolId: "inspect_ux_capability",
    version: "1.0.0",
    description:
      "Inspect whether the current editor supports direct canvas changes. It does not change the page.",
    effect: "capability_read",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      required: [],
      properties: {},
    },
  },
  {
    toolId: "submit_turn_outcome",
    version: "1.0.0",
    description:
      "Privately submit the current Goal and typed Turn Outcome for Host admission. This tool never publishes Actor text and never performs a page change. Use it instead of ending with a raw natural-language stop.",
    effect: "runtime_state",
    inputSchema: {
      ...SUBMIT_TURN_OUTCOME_INPUT_SCHEMA_V1,
    },
  },
]);

const handlers: Readonly<Record<string, ToolHandlerV1>> = {
  update_plan: async (value, context) => {
    let record: Record<string, unknown>;
    try { record = strictRecordV1(value, ["steps"], "update_plan.arguments"); }
    catch { return { status: "schema_invalid", retryDisposition: "revise_input", observation: "update_plan accepts only the steps field." }; }
    if (!Array.isArray(record.steps) || !record.steps.length || record.steps.length > 12) {
      return {
        status: "schema_invalid",
        retryDisposition: "revise_input",
        observation: "steps must contain 1-12 plan steps.",
      };
    }
    const steps: PlanStepV1[] = [];
    let inProgress = 0;
    for (let index = 0; index < record.steps.length; index += 1) {
      const item = record.steps[index];
      let stepRecord: Record<string, unknown>;
      try { stepRecord = strictRecordV1(item, ["description", "status"], `update_plan.steps[${index}]`); }
      catch {
        return {
          status: "schema_invalid",
          retryDisposition: "revise_input",
          observation: `steps[${index}] must be an object.`,
        };
      }
      const description = stepRecord.description;
      const status = stepRecord.status;
      if (
        typeof description !== "string" ||
        !description.trim() ||
        description.length > 240 ||
        !["pending", "in_progress", "completed"].includes(String(status))
      ) {
        return {
          status: "schema_invalid",
          retryDisposition: "revise_input",
          observation: `steps[${index}] has invalid description or status.`,
        };
      }
      if (status === "in_progress") inProgress += 1;
      steps.push({
        stepId: `step-${index + 1}`,
        description: description.trim(),
        status: status as PlanStepV1["status"],
      });
    }
    if (inProgress > 1) {
      return {
        status: "schema_invalid",
        retryDisposition: "revise_input",
        observation: "At most one plan step may be in progress.",
      };
    }
    return {
      status: "completed",
      retryDisposition: "do_not_retry",
      observation: JSON.stringify({ kind: "plan_proposal", steps }),
    };
  },
  read_resource_range: async (value) => {
    let record: Record<string, unknown>;
    try { record = strictRecordV1(value, ["resourceId", "start", "end"], "read_resource_range.arguments"); }
    catch { return { status: "schema_invalid", retryDisposition: "revise_input", observation: "read_resource_range accepts only resourceId/start/end." }; }
    const resourceId = record.resourceId;
    const start = record.start;
    const end = record.end;
    if (
      resourceId !== "landing-page-playbook" ||
      !Number.isInteger(start) ||
      !Number.isInteger(end) ||
      (start as number) < 0 ||
      (end as number) <= (start as number)
    ) {
      return {
        status: "schema_invalid",
        retryDisposition: "revise_input",
        observation: "resourceId/start/end are invalid.",
      };
    }
    const resource = resources[resourceId];
    if ((end as number) > resource.text.length || (end as number) - (start as number) > 4_000) {
      return {
        status: "schema_invalid",
        retryDisposition: "revise_input",
        observation: `Requested range exceeds resource length ${resource.text.length} or 4000 characters.`,
      };
    }
    const text = resource.text.slice(start as number, end as number);
    return {
      status: "completed",
      retryDisposition: "do_not_retry",
      observation: JSON.stringify({
        pointer: resourceId,
        version: resource.version,
        range: { start, end },
        contentHash: sha(text),
        text,
      }),
    };
  },
  inspect_ux_capability: async (value) => {
    try { strictRecordV1(value, [], "inspect_ux_capability.arguments"); }
    catch { return { status: "schema_invalid", retryDisposition: "revise_input", observation: "inspect_ux_capability accepts no fields." }; }
    return {
      status: "unavailable",
      retryDisposition: "do_not_retry",
      observation: JSON.stringify({
        capability: "canvasMutation",
        state: "unavailable",
        reason: "ux_provider_unavailable",
        truthfulNextStep:
          "Continue with landing-page advice, content, research, or planning without claiming a page change.",
      }),
    };
  },
  submit_turn_outcome: async (value) => {
    try {
      const record = strictRecordV1(
        value,
        ["goal", "proposal"],
        "submit_turn_outcome.arguments"
      );
      const goal = decodeGoalContractV1(
        typeof record.goal === "string"
          ? (JSON.parse(record.goal) as unknown)
          : record.goal
      );
      const proposal = decodeTurnOutcomeProposalV1(
        typeof record.proposal === "string"
          ? (JSON.parse(record.proposal) as unknown)
          : record.proposal
      );
      if (goal.goalId !== proposal.goalId) {
        throw new Error("terminal_goal_identity_mismatch");
      }
      return {
        status: "completed",
        retryDisposition: "do_not_retry",
        observation: JSON.stringify({
          kind: "turn_outcome_proposal",
          goalId: goal.goalId,
          outcome: proposal.outcome,
          proposalHash: hashCanonicalJsonV1({ goal, proposal }),
          publicDeliveryAuthorized: false,
        }),
      };
    } catch {
      return {
        status: "schema_invalid",
        retryDisposition: "revise_input",
        observation:
          "submit_turn_outcome requires strict GoalContractV1 and TurnOutcomeProposalV1 values with the same goalId.",
      };
    }
  },
};

export class GeneralToolExecutorV1 implements ToolExecutorPortV1 {
  private readonly receiptsByInvocation = new Map<string, ToolInvocationReceiptV1>();

  constructor(private readonly publicWeb: PublicWebReaderPortV1 = new NodePublicWebReaderV1()) {}

  listDescriptors() {
    return descriptors.map((descriptor) => structuredClone(descriptor));
  }

  async execute(input: ToolExecutorInputV1): Promise<ToolInvocationReceiptV1> {
    const descriptor = descriptors.find((item) => item.toolId === input.toolId);
    const argumentsValue = parseArguments(input.argumentsJson);
    const argumentsHash = sha(
      argumentsValue ? stableStringify(argumentsValue) : input.argumentsJson
    );
    const invocationKey = `${input.workspaceId}\u0000${input.sessionId}\u0000${input.threadId}\u0000${input.turnId}\u0000${input.runId}\u0000${input.callId}`;
    const previous = this.receiptsByInvocation.get(invocationKey);
    if (previous) {
      if (
        previous.workspaceId !== input.workspaceId ||
        previous.sessionId !== input.sessionId ||
        previous.threadId !== input.threadId ||
        previous.turnId !== input.turnId ||
        previous.runId !== input.runId ||
        previous.toolId !== input.toolId ||
        previous.toolVersion !== (descriptor?.version || "unavailable") ||
        previous.argumentsHash !== argumentsHash
      ) {
        throw new Error("tool_call_identity_mismatch");
      }
      return structuredClone(previous);
    }
    let result: ToolExecutionResultV1 | null = null;
    if (!descriptor || (!handlers[input.toolId] && input.toolId !== "read_public_web")) {
      result = {
        status: "unavailable",
        retryDisposition: "revise_input",
        observation: `Tool ${input.toolId} is unavailable.`,
      };
    } else if (!argumentsValue) {
      result = {
        status: "schema_invalid",
        retryDisposition: "revise_input",
        observation: "Tool arguments must be a JSON object.",
      };
    } else if (input.abortSignal?.aborted) {
      throw input.abortSignal.reason || new Error("run_cancelled");
    } else if (input.toolId === "read_public_web") {
      let record: Record<string, unknown> | null;
      try { record = strictRecordV1(argumentsValue, ["url"], "read_public_web.arguments"); }
      catch { result = { status: "schema_invalid", retryDisposition: "revise_input", observation: "read_public_web accepts only the url field." }; record = null; }
      if (record) {
        if (typeof record.url !== "string" || record.url.length < 8 || record.url.length > 2_048) {
          result = { status: "schema_invalid", retryDisposition: "revise_input", observation: "url must contain 8-2048 characters." };
        } else {
          try {
            const observation = await this.publicWeb.read(record.url, input.abortSignal);
            result = { status: "completed", retryDisposition: "do_not_retry", observation: JSON.stringify({ kind: "public_web_observation", trust: "untrusted_external_content", ...observation }) };
          } catch (error) {
            const code = error instanceof PublicWebReadErrorV1 ? error.code : "public_web_request_failed";
            const denied = /(?:denied|protocol|credentials|address|redirect_downgrade)/u.test(code);
            result = { status: denied ? "denied" : "failed", retryDisposition: denied ? "do_not_retry" : "revise_input", observation: JSON.stringify({ kind: "public_web_error", code }) };
          }
        }
      }
    } else {
      result = await handlers[input.toolId](argumentsValue, {
        runId: input.runId,
        callId: input.callId,
        abortSignal: input.abortSignal,
      });
    }
    if (!result) throw new Error("tool_result_missing");
    const createdAt = new Date().toISOString();
    const resultHash = sha(result.observation);
    const receiptProjection: Omit<ToolInvocationReceiptV1, "contractVersion" | "receiptId" | "observation"> = {
      workspaceId: input.workspaceId,
      sessionId: input.sessionId,
      threadId: input.threadId,
      turnId: input.turnId,
      runId: input.runId,
      callId: input.callId,
      toolId: input.toolId,
      toolVersion: descriptor?.version || "unavailable",
      argumentsHash,
      resultHash,
      resultRef: `tool-observation:sha256:${resultHash}`,
      writeCertainty: "not_applicable",
      status: result.status,
      retryDisposition: result.retryDisposition,
      createdAt,
    };
    const receipt: ToolInvocationReceiptV1 = {
      contractVersion: LANDING_PAGE_HARNESS_V1.toolReceipt,
      receiptId: createToolReceiptIdV1(receiptProjection),
      ...receiptProjection,
      observation: result.observation,
    };
    this.receiptsByInvocation.set(invocationKey, receipt);
    return structuredClone(receipt);
  }
}
