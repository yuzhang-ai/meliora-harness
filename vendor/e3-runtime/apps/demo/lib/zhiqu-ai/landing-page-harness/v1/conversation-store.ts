import { randomUUID } from "node:crypto";
import {
  LANDING_PAGE_HARNESS_V1,
  LANDING_PAGE_HARNESS_LIMITS_V1,
  createRuntimeCapabilitySnapshotV1,
  decodeAgentRunV1,
  decodeAgentTurnV1,
  decodeConversationThreadV1,
  decodeEventCursorV1,
  decodePublicRuntimeEventV1,
  decodeResumeRunInputV1,
  decodeRunRecoveryCheckpointV1,
  decodeToolInvocationReceiptV1,
  hashPublicRuntimeEventV1,
  validatePublicRuntimeEventChainV1,
  type AgentRunStatusV1,
  type AgentRunV1,
  type HostDeliveryProvenanceV1,
  type AgentTurnV1,
  type ConversationMessageV1,
  type ConversationThreadV1,
  type EventCursorV1,
  type PlanStepV1,
  type PublicRuntimeEventV1,
  type ResumeRunInputV1,
  type RunPublicErrorCodeV1,
  type RunRecoveryCheckpointV1,
  type RunSnapshotV1,
  type RuntimeEventCategoryV1,
  type ThreadSnapshotV1,
  type ToolCallV1,
  type ToolInvocationReceiptV1,
} from "./contracts";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredModelIdentityV1,
  requiredTimestampV1,
} from "./strict-json";
import {
  H1_RUNTIME_AUTHORITY_V1,
} from "./h1-runtime-authority";
import {
  CANONICAL_CAPABILITY_DEGRADED_DELIVERY_V1,
  isUnavailableCapabilityReceiptV1,
  CANONICAL_REPEATED_TOOL_FAILURE_DELIVERY_V1,
  admitTerminalProposalV1,
  classifyH1TriggerIntentV1,
  decodeTerminalProposalArgumentsV1,
  toolDescriptorFingerprintV1,
} from "./terminal-admission";
import type { ToolDescriptorV1 } from "./tools";
import type { ActorMessageV1 } from "./model-port";
import type {
  R2SelectionC0FinalDeliveryMemoryClosureV1,
} from "./r2-selection-c0-b3-final-delivery";
import {
  GENERAL_RUNTIME_CATALOG_BINDING_SEED_V1,
  H1_RUNTIME_CATALOG_BINDING_SEED_V1,
} from "./production-authority-tool-catalogs";
import {
  assertH1StoreCommitLeaseIssuedForStoreV1,
  consumeH1StoreCommitLeaseForStoreV1,
  h1AdmissionActivationMutationBindingV1,
  h1AdmissionRejectMutationBindingV1,
  h1AdmissionReserveMutationBindingV1,
  hashH1StoreMutationBindingV1,
  type H1CommitLeaseTargetV1,
  type H1StoreCommitLeaseV1,
  type H1StoreMutationOperationV1,
} from "./h1-runtime-commit-lease";
import { createRunContextManifestV1 } from "./authority-prompt-composition";
import {
  createAuthoritativePublicLifecycleEventV1,
  createToolModelObservationEnvelopeV1,
  type PublicLifecycleSourceV1,
} from "./authority-fabric-public-projection";
import {
  LANDING_PAGE_GOVERNANCE_FACTS_V1,
  decodeCanonicalDeliveryV1,
  decodeConversationStoreMigrationRecordV2,
  decodeRunFingerprintRecordV1,
  decodeRunGoalBindingV1,
  decodeTerminalAdmissionRecordV1,
  type CanonicalDeliveryV1,
  type ConversationStoreMigrationRecordV2,
  type RunFingerprintRecordV1,
  type RunGoalBindingV1,
  type TerminalAdmissionRecordV1,
} from "./governance-ledger";
import type {
  EffectiveFactsCaptureGrantReceiptV1,
} from "../../editor-canvas/v1/effective-facts-capture-grant";
import type { EffectiveFactsHostReceiptV1 } from "../../editor-canvas/v1/effective-facts-turn-registry";
import {
  activateH1RuntimeAdmissionV1,
  appendH1ActorCallBindingV1,
  consumeH1RuntimeAdmissionReadV1,
  createH1RuntimePendingAdmissionV1,
  decodeH1ActorCallBindingV1,
  decodeH1RuntimeAdmissionRecordV1,
  decodeH1RuntimeAdmissionSeedV1,
  h1RuntimeGrantNonceHashV1,
  rejectH1RuntimeAdmissionV1,
  type H1RuntimeAdmissionActiveV1,
  type H1ActorCallBindingV1,
  type H1RuntimeAdmissionRecordV1,
  type H1RuntimeAdmissionSeedV1,
  type H1RuntimeAuthorityMaterialV1,
} from "./h1-runtime-admission";
import {
  RUN_TOOL_CATALOG_BINDING_V1,
  createRunToolCatalogBindingV1,
  createStoreCatalogMigrationRecordV1,
  decodeRunToolCatalogBindingSeedV1,
  decodeRunToolCatalogBindingV1,
  decodeStoreCatalogMigrationRecordV1,
  type RunToolCatalogBindingSeedV1,
  type RunToolCatalogBindingV1,
  type StoreCatalogMigrationRecordV1,
} from "./run-tool-catalog-binding";
import type { TestAuthorityToolCatalogRegistryV1 } from "./authority-tool-catalog-registry";
import { PRODUCTION_AUTHORITY_TOOL_CATALOG_REGISTRY_V1 } from "./production-authority-tool-catalogs";
import {
  R2_SELECTION_C0_B3_AUTHORITY_V1,
  R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1,
  R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1,
} from "./r2-selection-c0-b3-authority";
import { R2_SELECTION_C0_B3_STORE_V1 } from "./r2-selection-c0-b3-store-contract";
import { R2_SELECTION_C0_V1 } from "./r2-selection-c0-profile";
import {
  assertH1DurableSubmitEnvelopeMatchesV1,
  type H1DurableSubmitEnvelopeV1,
} from "./durable-submit-admission";

export class ConversationStoreErrorV1 extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ConversationStoreErrorV1";
  }
}

export type StoreCountersV1 = {
  conversationWrite: number;
  eventAppend: number;
  runWrite: number;
  checkpointWrite: number;
  receiptWrite: number;
  planWrite: number;
};
export type RuntimeAuthorityKindV1 =
  | "legacy"
  | "h1-runtime-admission-v1"
  | "e1-local-selection-read-admission-v1"
  | "r2-selection-runtime-admission-v1";

const isSelectionReadMechanicalAuthorityV1 = (
  value: RuntimeAuthorityKindV1 | undefined
) =>
  value === R2_SELECTION_C0_B3_AUTHORITY_V1.runtimeAuthorityKind ||
  value === "e1-local-selection-read-admission-v1";
type PersistedRequestReservationV1 = {
  inputHash: string;
  inputHashVersion?: "legacy-v1" | "catalog-v1" | "submit-envelope-v1";
  envelopeId?: string;
  envelopeHash?: string;
  requestedThreadId?: string | null;
  threadId: string;
  turnId: string;
  runId: string;
  catalogBindingId?: string;
  canvasObservationBindingHash?: string;
  runtimeAuthorityKind?: RuntimeAuthorityKindV1;
};
type RequestReservationV1 = PersistedRequestReservationV1 & {
  runtimeAuthorityKind: RuntimeAuthorityKindV1;
};
type ResumeReservationV1 = { inputHash: string; run: AgentRunV1 };
export type RunExecutionClaimV1 = Readonly<{ runId: string; ownerId: string; fencingToken: number }>;
export type RunStartMetadataV1 = Readonly<{ modelIdentity: string }>;
export type GovernedRunCompletionV1 = Readonly<{
  goalBinding: RunGoalBindingV1 | null;
  terminalAdmission: TerminalAdmissionRecordV1 | null;
  canonicalDelivery: Omit<CanonicalDeliveryV1, "messageId" | "finalOutputHash" | "createdAt">;
  toolDescriptors: readonly ToolDescriptorV1[];
}>;
export type PendingToolInvocationV1 = Readonly<{ call: ToolCallV1; toolVersion: string; invocationStarted: boolean }>;
type RunLeaseV1 = { ownerId: string; fencingToken: number; expiresAt: number; authorityCeilingEpoch: number | null };
const TERMINAL_DELIVERY_TEMPLATE_BY_OUTCOME_V1 = {
  fulfilled: "terminal-fulfilled-v1",
  fulfilled_with_limitations: "terminal-fulfilled-with-limitations-v1",
  advisory_only: "terminal-advisory-only-v1",
  awaiting_user: "terminal-awaiting-user-v1",
  blocked_capability: "terminal-blocked-capability-v1",
  blocked_policy: "terminal-blocked-policy-v1",
  recoverable_failure: "terminal-recoverable-failure-v1",
} as const;
type ToolReservationV1 = { inputHash: string; call: ToolCallV1; toolVersion: string; receipt: ToolInvocationReceiptV1 | null };
type AssistantToolBatchReservationV1 = { inputHash: string; messageId: string; callIds: readonly string[]; versions: readonly { callId: string; toolVersion: string }[] };
type H1ConsumedGrantNonceV1 = Readonly<{
  requestId: string;
  seedHash: string;
  runId: string;
}>;
export type H1RuntimeReadConsumptionV1 = Readonly<{
  admission: H1RuntimeAdmissionActiveV1;
  before: number;
  after: number;
}>;
export type H1StoreMutationCommitV1 = Readonly<{
  lease?: H1StoreCommitLeaseV1;
  operation: H1StoreMutationOperationV1;
  target: H1CommitLeaseTargetV1;
  mutation?: unknown;
}>;

export type PersistentConversationStoreStateV1 = Readonly<{
  version: "landing-page-conversation-store-state-v1" | "landing-page-conversation-store-state-v2" | "landing-page-conversation-store-state-v3" | "landing-page-conversation-store-state-v4";
  threads: readonly ConversationThreadV1[];
  runs: readonly AgentRunV1[];
  turns: readonly AgentTurnV1[];
  events: readonly (readonly [string, readonly PublicRuntimeEventV1[]])[];
  checkpoints: readonly RunRecoveryCheckpointV1[];
  requestReservations: readonly (readonly [string, PersistedRequestReservationV1])[];
  resumeReservations: readonly (readonly [string, ResumeReservationV1])[];
  failureOccurrences: readonly (readonly [string, number])[];
  assistantToolBatchReservations: readonly (readonly [string, AssistantToolBatchReservationV1])[];
  toolReservations: readonly (readonly [string, ToolReservationV1])[];
  leases: readonly (readonly [string, RunLeaseV1])[];
  counters: StoreCountersV1;
  runGoalBindings?: readonly RunGoalBindingV1[];
  terminalAdmissions?: readonly TerminalAdmissionRecordV1[];
  canonicalDeliveries?: readonly CanonicalDeliveryV1[];
  runFingerprints?: readonly RunFingerprintRecordV1[];
  migrations?: readonly ConversationStoreMigrationRecordV2[];
  preGovernanceRunIds?: readonly string[];
  migrationRequiredRunIds?: readonly string[];
  h1RuntimeAdmissions?: readonly H1RuntimeAdmissionRecordV1[];
  h1ConsumedGrantNonces?: readonly (readonly [string, H1ConsumedGrantNonceV1])[];
  runToolCatalogBindings?: readonly RunToolCatalogBindingV1[];
  catalogCompatibilityOnlyRunIds?: readonly string[];
  catalogMigrations?: readonly StoreCatalogMigrationRecordV1[];
}>;

type ReserveTurnInputV1 = Readonly<{
  requestId: string;
  envelopeId?: string;
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId?: string;
  message: string;
  canvasObservationBindingHash?: string;
  catalogBindingSeed?: RunToolCatalogBindingSeedV1;
  durableSubmitEnvelope?: H1DurableSubmitEnvelopeV1;
}>;

export interface ConversationStorePortV1 {
  h1CommitAuthorityIdentity(): object;
  reserveTurn(input: ReserveTurnInputV1): { thread: ConversationThreadV1; turn: AgentTurnV1; run: AgentRunV1; replayed: boolean };
  reserveH1Turn(input: ReserveTurnInputV1 & { admissionSeed: H1RuntimeAdmissionSeedV1; catalogBindingSeed: RunToolCatalogBindingSeedV1 }, lease?: H1StoreCommitLeaseV1): { thread: ConversationThreadV1; turn: AgentTurnV1; run: AgentRunV1; admission: H1RuntimeAdmissionRecordV1; replayed: boolean };
  activateH1RuntimeAdmission(input: { runId: string; grantReceipt: EffectiveFactsCaptureGrantReceiptV1; hostReceipt: EffectiveFactsHostReceiptV1; authority: H1RuntimeAuthorityMaterialV1; activatedAt: string }, lease?: H1StoreCommitLeaseV1): H1RuntimeAdmissionActiveV1;
  rejectH1RuntimeAdmission(input: { runId: string; rejectionCode: string; rejectedAt: string }, lease?: H1StoreCommitLeaseV1): H1RuntimeAdmissionRecordV1;
  getH1RuntimeAdmission(runId: string): H1RuntimeAdmissionRecordV1 | null;
  getH1RuntimeAdmissionByRequestId(requestId: string): H1RuntimeAdmissionRecordV1 | null;
  getSubmissionEnvelopeIdByRequestId(requestId: string): string | null;
  consumeH1RuntimeRead(input: { runId: string; workspaceId: string; sessionId: string; documentId: string; threadId: string; turnId: string; claim: RunExecutionClaimV1; principalHash: string; policyId: string; policyRevision: string; readAt?: string }, lease?: H1StoreCommitLeaseV1): H1RuntimeReadConsumptionV1;
  appendH1ActorCallBinding(input: { runId: string; binding: H1ActorCallBindingV1; claim: RunExecutionClaimV1 }, lease?: H1StoreCommitLeaseV1): H1RuntimeAdmissionActiveV1;
  listThreads(input: { workspaceId: string; sessionId: string; documentId: string; limit: number }): readonly ConversationThreadV1[];
  renameThread(input: { threadId: string; workspaceId: string; sessionId: string; documentId: string; title: string }, lease?: H1StoreCommitLeaseV1): ConversationThreadV1;
  getThread(threadId: string): ThreadSnapshotV1 | null;
  getTurn(turnId: string): AgentTurnV1 | null;
  getRun(runId: string): RunSnapshotV1 | null;
  getRunRuntimeAuthorityKind(runId: string): RuntimeAuthorityKindV1;
  getRunToolCatalogBinding(runId: string): RunToolCatalogBindingV1 | null;
  isCatalogCompatibilityOnlyRun(runId: string): boolean;
  getCanvasObservationBindingHash(runId: string): string | null;
  startRun(runId: string, claim?: RunExecutionClaimV1, metadata?: RunStartMetadataV1, lease?: H1StoreCommitLeaseV1): AgentRunV1;
  appendAssistantToolCalls(runId: string, content: string, calls: readonly ToolCallV1[], claim: RunExecutionClaimV1 | undefined, toolVersions: Readonly<Record<string, string>>, lease?: H1StoreCommitLeaseV1): ConversationMessageV1;
  beginToolInvocation(runId: string, call: ToolCallV1, toolVersion: string, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1): { receipt: ToolInvocationReceiptV1 | null; event: PublicRuntimeEventV1 | null; replayed: boolean; disposition: "dispatch_now" | "terminal_replay" | "outcome_unknown" };
  settleTool(input: { runId: string; call: ToolCallV1; receipt: ToolInvocationReceiptV1; planProposal?: readonly PlanStepV1[]; claim?: RunExecutionClaimV1 }, lease?: H1StoreCommitLeaseV1): AgentRunV1;
  appendAssistantDelta(runId: string, delta: string, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1): PublicRuntimeEventV1;
  completeRun(runId: string, content: string, claim?: RunExecutionClaimV1, provenance?: HostDeliveryProvenanceV1, governance?: GovernedRunCompletionV1, lease?: H1StoreCommitLeaseV1): AgentRunV1;
  failRun(runId: string, errorCode: RunPublicErrorCodeV1, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1): AgentRunV1;
  stopRun(runId: string, lease?: H1StoreCommitLeaseV1): AgentRunV1;
  resumeRun(input: ResumeRunInputV1, lease?: H1StoreCommitLeaseV1): AgentRunV1;
  replayEvents(cursor: EventCursorV1): readonly PublicRuntimeEventV1[];
  listRunnableRunIds(
    limit: number,
    runtimeAuthorityKind?: RuntimeAuthorityKindV1 | "all"
  ): readonly string[];
  takeRunnableRunIdsForDispatch(
    limit: number,
    runtimeAuthorityKind: RuntimeAuthorityKindV1
  ): readonly string[];
  listPendingToolInvocations(runId: string): readonly PendingToolInvocationV1[];
  claimRun(runId: string, ownerId: string, leaseMs: number, authorityCeilingEpoch?: number | null): RunExecutionClaimV1 | null;
  renewRunClaim(claim: RunExecutionClaimV1, leaseMs: number): boolean;
  releaseRunClaim(claim: RunExecutionClaimV1): void;
  recordFailureOccurrence(runId: string, family: string, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1): number;
  appendRunFingerprint(record: RunFingerprintRecordV1, claim: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1): RunFingerprintRecordV1;
  appendRunGoalBinding(record: RunGoalBindingV1, claim: RunExecutionClaimV1): RunGoalBindingV1;
  appendTerminalAdmission(record: TerminalAdmissionRecordV1, claim: RunExecutionClaimV1): TerminalAdmissionRecordV1;
  appendCanonicalDelivery(record: CanonicalDeliveryV1, claim: RunExecutionClaimV1): CanonicalDeliveryV1;
  getGovernanceFacts(runId: string): Readonly<{ governanceStatus: "current" | "pre_governance" | "migration_required"; runFingerprint: RunFingerprintRecordV1 | null; runGoalBinding: RunGoalBindingV1 | null; terminalAdmissions: readonly TerminalAdmissionRecordV1[]; canonicalDelivery: CanonicalDeliveryV1 | null }>;
}

const clone = <T>(value: T): T => structuredClone(value);
const emptyCounters = (): StoreCountersV1 => ({ conversationWrite: 0, eventAppend: 0, runWrite: 0, checkpointWrite: 0, receiptWrite: 0, planWrite: 0 });
const RUN_CLAIM_LEASE_MIN_MS_V1 = 1_000;
const RUN_CLAIM_LEASE_MAX_MS_V1 = 300_000;
const assertRunClaimLeaseMsV1 = (leaseMs: number) => {
  if (
    !Number.isInteger(leaseMs) ||
    leaseMs < RUN_CLAIM_LEASE_MIN_MS_V1 ||
    leaseMs > RUN_CLAIM_LEASE_MAX_MS_V1
  ) {
    throw new ConversationStoreErrorV1(
      "run_claim_invalid",
      "Run claim lease duration is outside the frozen local bound."
    );
  }
};
const toolArgumentsHashV1 = (argumentsJson: string) => {
  try {
    const parsed = JSON.parse(argumentsJson) as unknown;
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed) && Object.getPrototypeOf(parsed) === Object.prototype) return hashCanonicalJsonV1(parsed);
  } catch { /* Invalid JSON is hashed as the exact raw input by the Tool Executor. */ }
  return hashUtf8V1(argumentsJson);
};
const normalizedThreadTitleV1 = (value: string, limit = 40) => {
  const title = value.replace(/[\u0000-\u001f\u007f]+/gu, " ").replace(/\s+/gu, " ").trim();
  if (!title) throw new ConversationStoreErrorV1("thread_title_invalid", "Thread title is empty.");
  return [...title].slice(0, limit).join("");
};

const expectedH1ActorCallClosureV1 = (input: Readonly<{
  admission: H1RuntimeAdmissionActiveV1;
  run: AgentRunV1;
  thread: ConversationThreadV1;
  binding: H1ActorCallBindingV1;
}>) => {
  const sourceReceiptHashSet = new Set(input.binding.sourceReceiptHashes);
  const receiptByCallId = new Map(
    input.run.receipts.map((receipt) => [receipt.callId, receipt] as const)
  );
  const usedReceiptHashes = new Set<string>();
  const messages: ActorMessageV1[] = [];
  for (const message of input.thread.messages) {
    if (message.runId !== input.run.runId) continue;
    if (message.role === "assistant") {
      if (!message.toolCalls.length) continue;
      const receiptHashes = message.toolCalls.map((call) => {
        const receipt = receiptByCallId.get(call.callId);
        return receipt ? hashCanonicalJsonV1(receipt) : null;
      });
      if (
        receiptHashes.some(
          (hash) => hash === null || !sourceReceiptHashSet.has(hash)
        )
      ) {
        continue;
      }
    }
    const projected: ActorMessageV1 = {
      role: message.role,
      content: message.content,
      ...(message.toolCallId ? { toolCallId: message.toolCallId } : {}),
      ...(message.toolCalls.length
        ? {
            toolCalls: message.toolCalls.map((call) => ({
              callId: call.callId,
              toolId: call.toolId,
              argumentsJson: call.argumentsJson,
            })),
          }
        : {}),
    };
    messages.push(projected);
    for (const call of message.toolCalls) {
      const receipt = receiptByCallId.get(call.callId);
      const tool = input.admission.authority.compiledToolCatalog.tools.find(
        (candidate) =>
          candidate.definition.toolId === receipt?.toolId &&
          candidate.definition.toolVersion === receipt.toolVersion
      );
      if (!receipt || !tool) {
        throw new ConversationStoreErrorV1(
          "h1_actor_call_receipt_projection_invalid",
          "H1 Actor context Receipt is not owned by the compiled Tool Catalog."
        );
      }
      const receiptHash = hashCanonicalJsonV1(receipt);
      usedReceiptHashes.add(receiptHash);
      messages.push({
        role: "tool",
        content: canonicalJsonV1(
          createToolModelObservationEnvelopeV1({ tool, receipt })
        ),
        toolCallId: receipt.callId,
      });
    }
  }
  if (
    usedReceiptHashes.size !== sourceReceiptHashSet.size ||
    [...sourceReceiptHashSet].some((hash) => !usedReceiptHashes.has(hash))
  ) {
    throw new ConversationStoreErrorV1(
      "h1_actor_call_receipt_projection_invalid",
      "H1 Actor context carries an unused or missing Receipt source."
    );
  }
  const contextEntries = messages.map((message, index) => {
    const encoded = canonicalJsonV1(message);
    const toolCallRef = message.toolCallId || message.toolCalls?.[0]?.callId;
    return {
      contextId: `message-${String(index + 1).padStart(4, "0")}`,
      sourceKind:
        message.role === "user"
          ? ("user_goal" as const)
          : ("receipt_evidence" as const),
      sourceRef:
        message.role === "user"
          ? input.run.triggerMessageId
          : toolCallRef ||
            `assistant-${input.binding.sequence}-${index + 1}`,
      contentHash: hashUtf8V1(encoded),
      evidenceLevel:
        message.role === "user" ? "user-authored" : "actual-run-receipt",
      freshness: "actor-call-bound",
      maxBytes: new TextEncoder().encode(encoded).byteLength,
    };
  });
  const contextManifest = createRunContextManifestV1({
    runId: input.run.runId,
    turnId: input.run.turnId,
    uxCapabilityFingerprint:
      input.admission.seed.snapshot.capabilityFingerprint,
    revisionBinding: hashCanonicalJsonV1(
      input.admission.seed.snapshot.revision
    ),
    entries: contextEntries,
  });
  const tools: ToolDescriptorV1[] =
    input.admission.authority.compiledToolCatalog.tools
      .map((tool) => ({
      toolId: tool.modelDescriptor.toolId,
      version: tool.modelDescriptor.toolVersion,
      description: tool.modelDescriptor.description,
      effect:
        tool.modelDescriptor.toolId === "inspect_ux_capability"
          ? "capability_read"
          : tool.modelDescriptor.effect === "presentation_state"
            ? "runtime_state"
            : "read_only",
      inputSchema: structuredClone(tool.modelDescriptor.inputSchema),
      }));
  const actorMessages: ActorMessageV1[] = [
    {
      role: "system",
      content: input.admission.authority.systemPrompt,
    },
    ...messages,
  ];
  return {
    actorRequestHash: hashCanonicalJsonV1({
      messages: actorMessages,
      tools,
    }),
    contextManifestHash: contextManifest.manifestHash,
    toolDescriptorHash: toolDescriptorFingerprintV1(tools),
  } as const;
};

type MemoryConversationStoreControlsV1 = {
  now?: () => string;
  id?: (prefix: string) => string;
  fault?: (point: string) => void;
  initialState?: PersistentConversationStoreStateV1;
  h1CommitAuthorityIdentity?: object;
  deferH1CommitLeaseConsumption?: boolean;
  defaultRunCatalogBindingSeed?: RunToolCatalogBindingSeedV1;
  /** Explicit test seam; production always uses the server-owned registry. */
  testOnlyCatalogRegistry?: TestAuthorityToolCatalogRegistryV1;
  /** SQLite-only verified closure for the dedicated R2 model-final lane. */
  r2FinalDeliveryClosures?: readonly R2SelectionC0FinalDeliveryMemoryClosureV1[];
};

export class MemoryConversationStoreV1 implements ConversationStorePortV1 {
  private readonly threads = new Map<string, ConversationThreadV1>();
  private readonly runs = new Map<string, AgentRunV1>();
  private readonly turns = new Map<string, AgentTurnV1>();
  private readonly events = new Map<string, PublicRuntimeEventV1[]>();
  private readonly checkpoints = new Map<string, RunRecoveryCheckpointV1>();
  private readonly requestReservations = new Map<string, RequestReservationV1>();
  private readonly resumeReservations = new Map<string, ResumeReservationV1>();
  private readonly failureOccurrences = new Map<string, number>();
  private readonly assistantToolBatchReservations = new Map<string, AssistantToolBatchReservationV1>();
  private readonly toolReservations = new Map<string, ToolReservationV1>();
  private readonly leases = new Map<string, RunLeaseV1>();
  private readonly dispatcherCursors = new Map<RuntimeAuthorityKindV1, string>();
  private readonly runGoalBindings = new Map<string, RunGoalBindingV1>();
  private readonly terminalAdmissions = new Map<string, TerminalAdmissionRecordV1>();
  private readonly canonicalDeliveries = new Map<string, CanonicalDeliveryV1>();
  private readonly runFingerprints = new Map<string, RunFingerprintRecordV1>();
  private readonly h1RuntimeAdmissions = new Map<string, H1RuntimeAdmissionRecordV1>();
  private readonly h1ConsumedGrantNonces = new Map<string, H1ConsumedGrantNonceV1>();
  private readonly runToolCatalogBindings = new Map<string, RunToolCatalogBindingV1>();
  private readonly catalogCompatibilityOnlyRunIds = new Set<string>();
  private catalogMigrations: StoreCatalogMigrationRecordV1[] = [];
  private migrations: ConversationStoreMigrationRecordV2[] = [];
  private readonly preGovernanceRunIds = new Set<string>();
  private readonly migrationRequiredRunIds = new Set<string>();
  private readonly counters: StoreCountersV1 = emptyCounters();
  private transactionDepth = 0;
  private governedCompletionDepth = 0;
  private readonly catalogRegistry;

  constructor(private readonly controls: MemoryConversationStoreControlsV1 = {}) {
    if (
      process.env.NODE_ENV === "production" &&
      controls.testOnlyCatalogRegistry
    ) {
      throw new ConversationStoreErrorV1(
        "test_only_catalog_registry_forbidden",
        "Production Memory Store cannot accept a test-only Tool Catalog Registry."
      );
    }
    this.catalogRegistry =
      controls.testOnlyCatalogRegistry ||
      PRODUCTION_AUTHORITY_TOOL_CATALOG_REGISTRY_V1;
    if (controls.initialState) this.restorePersistentStateV1(controls.initialState);
  }
  h1CommitAuthorityIdentity() {
    return this.controls.h1CommitAuthorityIdentity || this;
  }
  private now() { return this.controls.now?.() || new Date().toISOString(); }
  private nowEpoch() { const value = Date.parse(this.now()); return Number.isFinite(value) ? value : Date.now(); }
  private id(prefix: string) { return this.controls.id?.(prefix) || `${prefix}-${randomUUID()}`; }
  private fault(point: string) { this.controls.fault?.(point); }
  private run(runId: string) { const run = this.runs.get(runId); if (!run) throw new ConversationStoreErrorV1("run_not_found", "Run was not found."); return run; }
  private thread(threadId: string) { const thread = this.threads.get(threadId); if (!thread) throw new ConversationStoreErrorV1("thread_not_found", "Thread was not found."); return thread; }
  private assertRunThread(run: AgentRunV1, thread: ConversationThreadV1) { if (run.threadId !== thread.threadId || run.workspaceId !== thread.workspaceId || run.sessionId !== thread.sessionId || run.documentId !== thread.documentId) throw new ConversationStoreErrorV1("identity_mismatch", "Run and Thread identities differ."); }
  private assertCurrentCatalogBindingV1(runId: string) {
    this.run(runId);
    if (this.catalogCompatibilityOnlyRunIds.has(runId)) {
      throw new ConversationStoreErrorV1(
        "run_catalog_compatibility_only",
        "A pre-R1 Run is readable history only and cannot be executed, resumed, or mutated. Submit a new Run."
      );
    }
    const binding = this.runToolCatalogBindings.get(runId);
    if (!binding) {
      throw new ConversationStoreErrorV1(
        "run_tool_catalog_binding_missing",
        "A current Run requires one immutable Tool Catalog binding."
      );
    }
    return binding;
  }
  private assertCatalogExecutionWritableV1(runId: string) {
    const binding = this.assertCurrentCatalogBindingV1(runId);
    if (
      this.authorityKindForRunV1(runId) ===
      R2_SELECTION_C0_B3_AUTHORITY_V1.runtimeAuthorityKind
    ) {
      throw new ConversationStoreErrorV1(
        R2_SELECTION_C0_B3_STORE_V1.runtimeNotInstalledCode,
        "R2 B3-A has a durable main Store reservation, but its Runtime lane is not installed."
      );
    }
    if (
      binding.catalogProfileId ===
      RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
    ) {
      throw new ConversationStoreErrorV1(
        "fixture_catalog_not_executable",
        "The direct Store fixture Catalog is persistence-only test data and cannot authorize Run execution."
      );
    }
    return binding;
  }
  private catalogBindingSeedForReservationV1(input: ReserveTurnInputV1) {
    const seed = input.catalogBindingSeed || this.controls.defaultRunCatalogBindingSeed;
    if (!seed) {
      throw new ConversationStoreErrorV1(
        "run_tool_catalog_binding_required",
        "A new Run requires an explicit Tool Catalog binding seed."
      );
    }
    const decoded = decodeRunToolCatalogBindingSeedV1(seed);
    if (
      decoded.catalogProfileId !==
      RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
    ) {
      this.catalogRegistry.resolveExact(decoded);
    }
    return decoded;
  }
  private assertRuntimeAuthorityCatalogProfileV1(
    runtimeAuthorityKind: RuntimeAuthorityKindV1,
    binding: RunToolCatalogBindingSeedV1
  ) {
    if (
      runtimeAuthorityKind === "legacy" &&
      binding.catalogProfileId ===
        RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
    ) return;
    const expected =
      runtimeAuthorityKind === "h1-runtime-admission-v1"
        ? H1_RUNTIME_CATALOG_BINDING_SEED_V1
        : runtimeAuthorityKind ===
              R2_SELECTION_C0_B3_AUTHORITY_V1.runtimeAuthorityKind ||
            runtimeAuthorityKind === "e1-local-selection-read-admission-v1"
          ? R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1
          : GENERAL_RUNTIME_CATALOG_BINDING_SEED_V1;
    const isCustomLegacyTestProfile =
      runtimeAuthorityKind === "legacy" &&
      Boolean(this.controls.testOnlyCatalogRegistry) &&
      binding.catalogProfileId !==
        H1_RUNTIME_CATALOG_BINDING_SEED_V1.catalogProfileId;
    if (isCustomLegacyTestProfile) return;
    if (
      binding.catalogProfileId !== expected.catalogProfileId ||
      binding.catalogEpoch !== expected.catalogEpoch ||
      binding.catalogHash !== expected.catalogHash ||
      binding.toolDescriptorFingerprint !==
        expected.toolDescriptorFingerprint ||
      binding.eventEnvelopeVersion !== expected.eventEnvelopeVersion
    ) {
      throw new ConversationStoreErrorV1(
        "runtime_authority_catalog_profile_mismatch",
        "Run Runtime authority ownership differs from its exact Tool Catalog profile."
      );
    }
  }
  private createCatalogPublicToolEventV1(
    binding: RunToolCatalogBindingV1,
    receipt: ToolInvocationReceiptV1
  ) {
    const tool = this.catalogRegistry.resolveTool(
      binding,
      receipt.toolId,
      receipt.toolVersion
    );
    const source: Extract<
      PublicLifecycleSourceV1,
      Readonly<{ kind: "tool" }>
    > = { kind: "tool", tool, receipt };
    return createAuthoritativePublicLifecycleEventV1({
      source,
      authority: {
        resolveSource: ({ event }) =>
          event.kind === "tool" && event.receiptId === receipt.receiptId
            ? source
            : null,
        verifyRunContext: ({ source: candidate, runId, turnId }) =>
          candidate.kind === "tool" &&
          candidate.receipt.runId === runId &&
          candidate.receipt.turnId === turnId,
        verifyThreadContext: () => false,
      },
      context: { runId: receipt.runId, turnId: receipt.turnId },
    });
  }
  private terminalToolEventStateV1(receipt: ToolInvocationReceiptV1) {
    return receipt.status === "completed" || receipt.status === "unavailable"
      ? ("tool_completed" as const)
      : ("tool_failed" as const);
  }
  private assertCatalogTerminalToolLifecycleV1(
    binding: RunToolCatalogBindingV1,
    run: AgentRunV1,
    events: readonly PublicRuntimeEventV1[],
    errorCode: string
  ) {
    const terminalEvents = events.filter(
      (event) => event.category === "tool" && event.state !== "tool_started"
    );
    const receiptByCallId = new Map(
      run.receipts.map((receipt) => [receipt.callId, receipt] as const)
    );
    if (
      receiptByCallId.size !== run.receipts.length ||
      terminalEvents.length !== run.receipts.length
    ) {
      throw new ConversationStoreErrorV1(
        errorCode,
        "Current Catalog terminal lifecycle events and Receipts must have exact one-to-one cardinality."
      );
    }
    for (const event of terminalEvents) {
      const receipt = event.callId ? receiptByCallId.get(event.callId) : null;
      if (!receipt || event.state !== this.terminalToolEventStateV1(receipt)) {
        throw new ConversationStoreErrorV1(
          errorCode,
          "Persisted terminal lifecycle event is orphaned or its outer state differs from the Receipt status."
        );
      }
    }
    for (const receipt of run.receipts) {
      const matchingEvents = terminalEvents.filter(
        (event) => event.callId === receipt.callId
      );
      if (matchingEvents.length !== 1) {
        throw new ConversationStoreErrorV1(
          errorCode,
          "Each current Catalog Receipt must own exactly one terminal public lifecycle event."
        );
      }
      try {
        const expected = this.createCatalogPublicToolEventV1(binding, receipt);
        if (
          hashCanonicalJsonV1(matchingEvents[0]!.publicData) !==
          hashCanonicalJsonV1(expected)
        ) {
          throw new Error("public lifecycle drift");
        }
      } catch {
        throw new ConversationStoreErrorV1(
          errorCode,
          "Persisted public lifecycle event differs from its installed Catalog and actual Receipt source."
        );
      }
    }
  }
  private createCatalogStartedPublicToolEventV1(
    binding: RunToolCatalogBindingV1,
    run: AgentRunV1,
    call: ToolCallV1,
    toolVersion: string
  ) {
    const tool = this.catalogRegistry.resolveTool(
      binding,
      call.toolId,
      toolVersion
    );
    const source: Extract<
      PublicLifecycleSourceV1,
      Readonly<{ kind: "tool_started" }>
    > = {
      kind: "tool_started",
      tool,
      invocation: {
        runId: run.runId,
        turnId: run.turnId,
        callId: call.callId,
        catalogBindingHash: binding.bindingHash,
        toolId: call.toolId,
        toolVersion,
        argumentsHash: toolArgumentsHashV1(call.argumentsJson),
      },
    };
    return createAuthoritativePublicLifecycleEventV1({
      source,
      authority: {
        resolveSource: ({ event }) =>
          event.kind === "tool" &&
          event.status === "started" &&
          event.toolId === call.toolId &&
          event.toolVersion === toolVersion
            ? source
            : null,
        verifyRunContext: ({ source: candidate, runId, turnId }) =>
          candidate.kind === "tool_started" &&
          candidate.invocation.runId === runId &&
          candidate.invocation.turnId === turnId,
        verifyThreadContext: () => false,
      },
      context: { runId: run.runId, turnId: run.turnId },
    });
  }
  private assertCatalogEpochClosureV1(
    seed: RunToolCatalogBindingSeedV1,
    bindings: Iterable<RunToolCatalogBindingV1> = this.runToolCatalogBindings.values()
  ) {
    for (const binding of bindings) {
      if (
        binding.catalogProfileId !== seed.catalogProfileId ||
        binding.catalogEpoch !== seed.catalogEpoch
      ) continue;
      if (
        binding.catalogHash !== seed.catalogHash ||
        binding.toolDescriptorFingerprint !== seed.toolDescriptorFingerprint ||
        binding.eventEnvelopeVersion !== seed.eventEnvelopeVersion
      ) throw new ConversationStoreErrorV1(
        "run_tool_catalog_epoch_conflict",
        "One Catalog profile epoch must resolve to exactly one immutable closure."
      );
    }
  }
  protected assertClaim(runId: string, claim?: RunExecutionClaimV1) {
    this.assertCatalogExecutionWritableV1(runId);
    if (!claim) {
      if (
        this.authorityKindForRunV1(runId) === "h1-runtime-admission-v1"
      ) {
        throw new ConversationStoreErrorV1(
          "run_claim_required",
          "An H1 execution mutation requires a fenced Run claim."
        );
      }
      return;
    }
    const lease = this.leases.get(runId);
    if (
      claim.runId !== runId ||
      !lease ||
      lease.ownerId !== claim.ownerId ||
      lease.fencingToken !== claim.fencingToken ||
      lease.expiresAt <= this.nowEpoch()
    ) {
      throw new ConversationStoreErrorV1(
        "run_claim_lost",
        "Run execution claim is no longer authoritative."
      );
    }
  }
  private assertRequiredClaim(runId: string, claim?: RunExecutionClaimV1) { if (!claim) throw new ConversationStoreErrorV1("run_claim_required", "A fenced Run execution claim is required."); this.assertClaim(runId, claim); }
  private authorityKindForRunV1(runId: string) {
    const reservation = [...this.requestReservations.values()].find(
      (item) => item.runId === runId
    );
    if (!reservation) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Run is detached from its immutable Runtime authority ownership."
      );
    }
    return reservation.runtimeAuthorityKind;
  }
  protected assertH1StoreCommitV1(commit?: H1StoreMutationCommitV1) {
    if (!commit) return;
    const isAdmissionTransition = commit.operation.startsWith("h1_admission.");
    const target = commit.target;
    const runIds = target.kind === "run"
      ? [target.runId]
      : target.kind === "thread"
        ? [...this.runs.values()]
            .filter((run) => run.threadId === target.threadId)
            .map((run) => run.runId)
            .sort()
        : [];
    const h1RunIds = runIds.filter(
      (runId) => this.authorityKindForRunV1(runId) === "h1-runtime-admission-v1"
    );
    if (!isAdmissionTransition && !h1RunIds.length) {
      if (commit.lease) {
        throw new ConversationStoreErrorV1(
          "h1_store_commit_scope_invalid",
          "An H1 Store commit lease cannot authorize a legacy mutation."
        );
      }
      return;
    }
    const lease = commit.lease;
    if (!lease) {
      throw new ConversationStoreErrorV1(
        "h1_store_commit_lease_required",
        "H1-owned Store mutation requires a current local commit lease."
      );
    }
    assertH1StoreCommitLeaseIssuedForStoreV1(
      lease,
      this.h1CommitAuthorityIdentity()
    );
    const expectedPurpose =
      commit.operation === "h1_admission.reserve"
        ? "admission:reserve"
        : commit.operation === "h1_admission.activate"
          ? "admission:activate"
          : commit.operation === "h1_admission.reject"
            ? "admission:reject"
            : commit.operation === "run.stop"
              ? "api:run.stop"
              : commit.operation === "run.resume"
                ? "api:run.resume"
                : commit.operation === "thread.rename"
                  ? "api:thread.rename"
                  : "runtime:execution";
    if (
      lease.material.operation !== commit.operation ||
      lease.material.purpose !== expectedPurpose ||
      JSON.stringify(lease.material.target) !== JSON.stringify(commit.target) ||
      lease.material.mutationBindingHash !==
        hashH1StoreMutationBindingV1({
          operation: commit.operation,
          target: commit.target,
          mutation: commit.mutation,
        })
    ) {
      throw new ConversationStoreErrorV1(
        "h1_store_commit_scope_invalid",
        "H1 Store commit lease operation or target differs from the mutation."
      );
    }
    let expectedBindings: typeof lease.material.authorityBindings;
    if (commit.operation === "h1_admission.reserve") {
      if (target.kind !== "request") {
        throw new ConversationStoreErrorV1(
          "h1_store_commit_scope_invalid",
          "H1 admission reservation requires a request target."
        );
      }
      const admission = [...this.h1RuntimeAdmissions.values()].find(
        (item) => item.requestId === target.requestId
      );
      if (!admission || admission.status !== "pending") {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_not_pending",
          "H1 admission reservation did not produce one pending authority record."
        );
      }
      expectedBindings = [{
        requestId: admission.requestId,
        runId: null,
        seedHash: admission.seed.seedHash,
        aclSnapshotHash: admission.seed.aclSnapshotHash,
      }];
      if (admission.seed.principalHash !== lease.material.principalHash) {
        throw new ConversationStoreErrorV1(
          "h1_store_commit_scope_invalid",
          "H1 admission principal differs from the reservation authority."
        );
      }
    } else {
      expectedBindings = h1RunIds.map((runId) => {
        const admission = this.h1RuntimeAdmissions.get(runId);
        const expectedStatus =
          commit.operation === "h1_admission.reject" ? "rejected" : "active";
        if (!admission || admission.status !== expectedStatus) {
          throw new ConversationStoreErrorV1(
            commit.operation === "h1_admission.reject"
              ? "h1_runtime_admission_not_rejected"
              : "h1_runtime_admission_not_active",
            "H1 Store commit does not match the required admission state."
          );
        }
        if (admission.seed.principalHash !== lease.material.principalHash) {
          throw new ConversationStoreErrorV1(
            "h1_store_commit_scope_invalid",
            "H1 Store commit principal differs from persisted authority."
          );
        }
        return {
          requestId: admission.requestId,
          runId,
          seedHash: admission.seed.seedHash,
          aclSnapshotHash: admission.seed.aclSnapshotHash,
        };
      });
    }
    if (
      JSON.stringify(lease.material.authorityBindings) !==
      JSON.stringify(expectedBindings)
    ) {
      throw new ConversationStoreErrorV1(
        "h1_store_commit_scope_invalid",
        "H1 Store commit bindings differ from current persisted authority."
      );
    }
    if (this.controls.deferH1CommitLeaseConsumption) {
      assertH1StoreCommitLeaseIssuedForStoreV1(
        lease,
        this.h1CommitAuthorityIdentity()
      );
    } else {
      consumeH1StoreCommitLeaseForStoreV1(
        lease,
        this.h1CommitAuthorityIdentity()
      );
    }
  }
  private assertGovernanceWritable(runId: string) { this.assertCatalogExecutionWritableV1(runId); if (this.preGovernanceRunIds.has(runId)) throw new ConversationStoreErrorV1("pre_governance_run_immutable", "Historical PRE_GOVERNANCE Run cannot be upgraded in place."); }
  private assertRunFingerprintCatalogClosureV1(record: RunFingerprintRecordV1, catalogBinding: RunToolCatalogBindingV1) {
    if (
      record.contractVersion === LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprint &&
      catalogBinding.catalogProfileId === RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
    ) return;
    if (
      record.contractVersion !== LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2 ||
      record.catalogBindingId !== catalogBinding.bindingId ||
      record.catalogBindingHash !== catalogBinding.bindingHash ||
      record.catalogProfileId !== catalogBinding.catalogProfileId ||
      record.catalogEpoch !== catalogBinding.catalogEpoch ||
      record.catalogHash !== catalogBinding.catalogHash ||
      record.eventEnvelopeVersion !== catalogBinding.eventEnvelopeVersion ||
      record.toolDescriptorFingerprint !== catalogBinding.toolDescriptorFingerprint
    ) throw new ConversationStoreErrorV1(
      "run_fingerprint_catalog_binding_mismatch",
      "Run fingerprint differs from its immutable Tool Catalog binding."
    );
  }
  private assertToolCatalogMembershipV1(
    runId: string,
    identities: readonly Readonly<{ toolId: string; toolVersion: string }>[]
  ) {
    const catalogBinding = this.assertCatalogExecutionWritableV1(runId);
    if (
      catalogBinding.catalogProfileId ===
      RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
    ) return;
    const fingerprint = [...this.runFingerprints.values()].find(
      (candidate) => candidate.runId === runId
    );
    if (
      !fingerprint ||
      fingerprint.contractVersion !==
        LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2 ||
      !fingerprint.toolDescriptorIdentities
    ) throw new ConversationStoreErrorV1(
      "run_tool_catalog_membership_unavailable",
      "Current Run Tool calls require an immutable Catalog-bound descriptor set."
    );
    for (const identity of identities) {
      if (!fingerprint.toolDescriptorIdentities.some(
        (descriptor) =>
          descriptor.toolId === identity.toolId &&
          descriptor.version === identity.toolVersion
      )) throw new ConversationStoreErrorV1(
        "run_tool_catalog_membership_mismatch",
        "Tool call identity is not admitted by the Run-bound Catalog."
      );
    }
  }
  private assertGoalBindingRuntimeClosure(record: RunGoalBindingV1) {
    const run = this.run(record.runId);
    const thread = this.thread(run.threadId);
    const trigger = thread.messages.find((message) => message.messageId === record.source.triggerMessageId);
    const terminalCall = thread.messages.filter((message) => message.runId === run.runId && message.role === "assistant").flatMap((message) => message.toolCalls).find((call) => call.callId === record.boundBy.toolCallId);
    if (!trigger || trigger.role !== "user" || trigger.runId !== run.runId || !terminalCall || terminalCall.toolId !== "submit_turn_outcome") throw new ConversationStoreErrorV1("governance_closure_invalid", "Goal binding is detached from the trigger message or terminal Tool Call.");
    try {
      const parsed = decodeTerminalProposalArgumentsV1(
        terminalCall.argumentsJson
      );
      if (hashCanonicalJsonV1(parsed.goal) !== record.goalHash || parsed.proposal.proposalId !== record.boundBy.terminalProposalId) throw new Error("terminal identity mismatch");
    } catch { throw new ConversationStoreErrorV1("governance_closure_invalid", "Goal binding terminal arguments do not match the frozen Goal."); }
  }
  private assertTerminalAdmissionRuntimeClosure(record: TerminalAdmissionRecordV1, descriptors: readonly ToolDescriptorV1[]) {
    const run = this.run(record.runId);
    const thread = this.thread(run.threadId);
    const triggerMessage = thread.messages.find(
      (message) => message.messageId === run.triggerMessageId
    );
    const binding = this.runGoalBindings.get(record.runGoalBindingId);
    const terminalCall = thread.messages
      .filter((message) => message.runId === run.runId && message.role === "assistant")
      .flatMap((message) => message.toolCalls)
      .find((call) => call.callId === record.terminalToolCallId);
    const receipt = run.receipts.find((item) => item.callId === record.terminalToolCallId);
    if (!binding || binding.boundBy.toolCallId !== record.terminalToolCallId || binding.boundBy.terminalProposalId !== record.terminalProposalId || !terminalCall || !receipt || receipt.toolId !== "submit_turn_outcome" || receipt.status !== "completed" || receipt.argumentsHash !== record.terminalArgumentsHash || toolArgumentsHashV1(terminalCall.argumentsJson) !== record.terminalArgumentsHash || toolDescriptorFingerprintV1(descriptors) !== record.toolDescriptorFingerprint) throw new ConversationStoreErrorV1("governance_closure_invalid", "Terminal admission is detached from its completed Tool Call, Receipt, or descriptor facts.");
    const admission = admitTerminalProposalV1({ argumentsJson: terminalCall.argumentsJson, terminalReceipt: receipt, receipts: run.receipts, descriptors, triggerMessageContent: triggerMessage?.content });
    if (!admission.accepted || record.decision !== "admitted" || admission.proposal.proposalId !== record.terminalProposalId || admission.outcome !== record.proposedOutcome || hashCanonicalJsonV1(admission.goal) !== record.goalHash || admission.claimGateAssessmentHash !== record.claimGateAssessmentHash || hashCanonicalJsonV1(admission.evidenceReceiptCallIds) !== hashCanonicalJsonV1(record.evidenceReceiptCallIds)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Terminal admission differs from the Host-recomputed claim-gate assessment.");
  }
  private assertCanonicalDeliveryRuntimeClosure(record: CanonicalDeliveryV1, content: string, descriptors: readonly ToolDescriptorV1[]) {
    const run = this.run(record.runId);
    const fingerprint = this.runFingerprints.get(record.runFingerprintId);
    if (!fingerprint || fingerprint.runId !== record.runId || fingerprint.fingerprintHash !== record.runFingerprintHash || fingerprint.toolDescriptorFingerprint !== toolDescriptorFingerprintV1(descriptors) || record.finalOutputHash !== hashUtf8V1(content)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Canonical delivery fingerprint, descriptor, or output closure is invalid.");
    if (record.kind === "admitted_terminal_proposal") {
      const binding = record.runGoalBindingId ? this.runGoalBindings.get(record.runGoalBindingId) : null;
      const admission = record.terminalAdmissionId ? this.terminalAdmissions.get(record.terminalAdmissionId) : null;
      const expectedTemplate = admission ? TERMINAL_DELIVERY_TEMPLATE_BY_OUTCOME_V1[admission.proposedOutcome] : null;
      if (!binding || !admission || admission.decision !== "admitted" || admission.runGoalBindingId !== binding.runGoalBindingId || admission.runFingerprintId !== fingerprint.runFingerprintId || record.deliveryTemplateId !== expectedTemplate || hashCanonicalJsonV1(record.evidenceReceiptCallIds) !== hashCanonicalJsonV1(admission.evidenceReceiptCallIds)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Canonical terminal delivery is detached from its admitted Goal and evidence.");
      const terminalCall = this.thread(run.threadId).messages.flatMap((message) => message.runId === run.runId && message.role === "assistant" ? message.toolCalls : []).find((call) => call.callId === admission.terminalToolCallId);
      const receipt = run.receipts.find((item) => item.callId === admission.terminalToolCallId);
      const triggerMessage = this.thread(run.threadId).messages.find(
        (message) => message.messageId === run.triggerMessageId
      );
      const recomputed = terminalCall && receipt ? admitTerminalProposalV1({ argumentsJson: terminalCall.argumentsJson, terminalReceipt: receipt, receipts: run.receipts, descriptors, triggerMessageContent: triggerMessage?.content }) : null;
      if (!recomputed?.accepted || recomputed.canonicalOutput !== content) throw new ConversationStoreErrorV1("governance_closure_invalid", "Canonical terminal output differs from the Host template.");
      return;
    }
    const evidence = record.evidenceReceiptCallIds.map((callId) => run.receipts.find((item) => item.callId === callId));
    if (evidence.some((item) => !item)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Canonical degraded delivery references missing Receipt evidence.");
    if (record.kind === "capability_unavailable_degraded") {
      const receipt = evidence[0];
      const triggerMessage = this.thread(run.threadId).messages.find(
        (message) => message.messageId === run.triggerMessageId
      );
      const h1Runtime =
        this.getRunRuntimeAuthorityKind(run.runId) ===
        "h1-runtime-admission-v1";
      if (record.deliveryTemplateId !== "capability-unavailable-degraded-v1" || record.evidenceReceiptCallIds.length !== 1 || !receipt || !isUnavailableCapabilityReceiptV1(receipt, descriptors) || content !== CANONICAL_CAPABILITY_DEGRADED_DELIVERY_V1 || (h1Runtime && (!triggerMessage || classifyH1TriggerIntentV1(triggerMessage.content) === "read_only"))) throw new ConversationStoreErrorV1("governance_closure_invalid", "Capability-degraded delivery is not closed by the unavailable capability Receipt and immutable non-read H1 trigger.");
      return;
    }
    const first = evidence[0];
    if (record.deliveryTemplateId !== "repeated-tool-failure-degraded-v1" || evidence.length < 2 || !first || first.status === "completed" || first.status === "unavailable" || evidence.some((item) => !item || item.toolId !== first.toolId || item.status !== first.status) || content !== CANONICAL_REPEATED_TOOL_FAILURE_DELIVERY_V1) throw new ConversationStoreErrorV1("governance_closure_invalid", "Repeated-failure delivery is not closed by one repeated failure family.");
  }

  private atomic<T>(label: string, action: () => T, commit?: H1StoreMutationCommitV1): T {
    if (this.transactionDepth > 0) return action();
    const before = this.exportPersistentStateV1();
    this.transactionDepth += 1;
    try { const result = action(); this.fault(`${label}:before_commit`); this.assertH1StoreCommitV1(commit); return result; }
    catch (error) { this.restorePersistentStateV1(before); throw error; }
    finally { this.transactionDepth -= 1; }
  }

  private event(run: AgentRunV1, category: RuntimeEventCategoryV1, state: string, publicData: Record<string, unknown>, callId: string | null = null) {
    const catalogBinding = this.assertCurrentCatalogBindingV1(run.runId);
    if (
      catalogBinding.eventEnvelopeVersion !== LANDING_PAGE_HARNESS_V1.event
    ) {
      throw new ConversationStoreErrorV1(
        "run_event_envelope_binding_mismatch",
        "Run event append differs from its immutable Catalog envelope version."
      );
    }
    const list = this.events.get(run.runId) || [];
    if (list.length >= LANDING_PAGE_HARNESS_LIMITS_V1.maxPublicEventsPerRun) throw new ConversationStoreErrorV1("event_budget_exceeded", "Run event budget was exceeded.");
    const terminalOverflow = (category === "run" && ["run_stopped", "run_recoverable_failed", "run_completed"].includes(state)) || (category === "delivery" && state === "turn_delivered");
    if (list.length >= LANDING_PAGE_HARNESS_LIMITS_V1.maxSteadyStatePublicEventsPerRun && !terminalOverflow) throw new ConversationStoreErrorV1("event_budget_exceeded", "Run steady-state event budget was exceeded.");
    const projection: Omit<PublicRuntimeEventV1, "eventHash"> = { contractVersion: LANDING_PAGE_HARNESS_V1.event, eventId: this.id("event"), workspaceId: run.workspaceId, sessionId: run.sessionId, threadId: run.threadId, turnId: run.turnId, runId: run.runId, sequence: list.length + 1, category, state, callId, publicData: clone(publicData), previousEventHash: list.at(-1)?.eventHash || "GENESIS", createdAt: this.now() };
    const event: PublicRuntimeEventV1 = { ...projection, eventHash: hashPublicRuntimeEventV1(projection) };
    decodePublicRuntimeEventV1(event); this.events.set(run.runId, [...list, event]); this.counters.eventAppend += 1; return clone(event);
  }

  reserveTurn(input: ReserveTurnInputV1) {
    return this.reserveTurnForAuthorityV1(input, "legacy");
  }

  reserveR2SelectionC0TurnIdentityV1(input: ReserveTurnInputV1) {
    if (input.threadId !== undefined) {
      throw new ConversationStoreErrorV1(
        "r2_fresh_thread_required",
        "R2 B3-A admission requires a fresh Thread."
      );
    }
    return this.reserveTurnForAuthorityV1(
      input,
      R2_SELECTION_C0_B3_AUTHORITY_V1.runtimeAuthorityKind
    );
  }

  reserveE1LocalSelectionReadTurnIdentityV1(input: ReserveTurnInputV1) {
    return this.reserveTurnForAuthorityV1(
      input,
      "e1-local-selection-read-admission-v1"
    );
  }

  private reserveTurnForAuthorityV1(
    input: ReserveTurnInputV1,
    runtimeAuthorityKind: RuntimeAuthorityKindV1
  ) {
    return this.atomic("reserveTurn", () => {
      try {
        requiredIdV1(input.requestId, "requestReservation.requestId");
        if (input.envelopeId !== undefined) {
          requiredIdV1(input.envelopeId, "requestReservation.envelopeId");
        }
        if (input.canvasObservationBindingHash !== undefined) {
          requiredHashV1(
            input.canvasObservationBindingHash,
            "requestReservation.canvasObservationBindingHash"
          );
        }
      } catch {
        throw new ConversationStoreErrorV1(
          "request_reservation_invalid",
          "Request reservation identity or Canvas observation binding hash is invalid."
        );
      }
      const catalogBindingSeed = this.catalogBindingSeedForReservationV1(input);
      this.assertRuntimeAuthorityCatalogProfileV1(
        runtimeAuthorityKind,
        catalogBindingSeed
      );
      const normalizedInput = {
        requestId: input.requestId,
        ...(input.envelopeId !== undefined
          ? { envelopeId: input.envelopeId }
          : {}),
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        documentId: input.documentId,
        threadId: input.threadId ?? null,
        message: input.message,
        ...(input.canvasObservationBindingHash
          ? { canvasObservationBindingHash: input.canvasObservationBindingHash }
          : {}),
        catalogBindingSeed,
        ...(input.durableSubmitEnvelope
          ? { envelopeHash: input.durableSubmitEnvelope.envelopeHash }
          : {}),
      };
      const inputHash = hashCanonicalJsonV1(normalizedInput);
      const legacyInputHash = hashCanonicalJsonV1({
        requestId: input.requestId,
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        documentId: input.documentId,
        threadId: input.threadId ?? null,
        message: input.message,
        ...(input.canvasObservationBindingHash
          ? { canvasObservationBindingHash: input.canvasObservationBindingHash }
          : {}),
      });
      const reserved = this.requestReservations.get(input.requestId);
      if (reserved) {
        const run = this.run(reserved.runId);
        const thread = this.thread(reserved.threadId);
        const triggerMessage = thread.messages.find(
          (message) => message.messageId === run.triggerMessageId
        );
        const expectedInputHash =
          reserved.inputHashVersion === "legacy-v1"
            ? legacyInputHash
            : inputHash;
        if (
          reserved.inputHash !== expectedInputHash ||
          reserved.envelopeId !== input.envelopeId ||
          reserved.envelopeHash !== input.durableSubmitEnvelope?.envelopeHash ||
          reserved.requestedThreadId !== (input.threadId ?? null) ||
          run.workspaceId !== input.workspaceId ||
          run.sessionId !== input.sessionId ||
          run.documentId !== input.documentId ||
          triggerMessage?.content !== input.message
        )
          throw new ConversationStoreErrorV1(
            "request_identity_conflict",
            "Request ID was reused with different input or Tool Catalog binding."
          );
        return { thread: clone(thread), turn: clone(this.turns.get(reserved.turnId)!), run: clone(run), replayed: true };
      }
      if (
        input.envelopeId !== undefined &&
        [...this.requestReservations.values()].some(
          (reservation) => reservation.envelopeId === input.envelopeId
        )
      ) {
        throw new ConversationStoreErrorV1(
          "submission_envelope_conflict",
          "Submission envelope identity is already bound to another Request."
        );
      }
      this.assertCatalogEpochClosureV1(catalogBindingSeed);
      const at = this.now(); const threadId = input.threadId || this.id("thread"); const existing = this.threads.get(threadId);
      if (existing && (existing.workspaceId !== input.workspaceId || existing.sessionId !== input.sessionId || existing.documentId !== input.documentId)) throw new ConversationStoreErrorV1("thread_identity_conflict", "Thread identity differs.");
      if (
        existing &&
        [...this.runs.values()].some(
          (run) =>
            run.threadId === threadId &&
            [...this.requestReservations.values()].some(
              (reservation) =>
                reservation.runId === run.runId &&
                reservation.runtimeAuthorityKind !== runtimeAuthorityKind
            )
        )
      ) {
        throw new ConversationStoreErrorV1(
          "runtime_authority_thread_mixing_forbidden",
          "A durable Thread cannot mix Runtime authority ownership."
        );
      }
      if (
        runtimeAuthorityKind === "e1-local-selection-read-admission-v1" &&
        existing &&
        [...this.runs.values()].some(
          (run) =>
            run.threadId === threadId &&
            ["queued", "running", "recovering", "awaiting_user"].includes(
              run.status
            )
        )
      ) {
        throw new ConversationStoreErrorV1(
          "e1_thread_run_in_progress",
          "An E1 Thread can own only one active Run at a time."
        );
      }
      const turnId = this.id("turn"); const runId = this.id("run"); const messageId = this.id("message");
      const userMessage: ConversationMessageV1 = { contractVersion: LANDING_PAGE_HARNESS_V1.message, messageId, workspaceId: input.workspaceId, sessionId: input.sessionId, threadId, turnId, runId, sequence: (existing?.messages.length || 0) + 1, role: "user", content: input.message, toolCallId: null, toolCalls: [], createdAt: at };
      const thread: ConversationThreadV1 = existing ? { ...existing, updatedAt: at, messages: [...existing.messages, userMessage] } : { contractVersion: LANDING_PAGE_HARNESS_V1.thread, threadId, workspaceId: input.workspaceId, sessionId: input.sessionId, documentId: input.documentId, title: normalizedThreadTitleV1(input.message, 16), createdAt: at, updatedAt: at, messages: [userMessage] };
      const run: AgentRunV1 = { contractVersion: LANDING_PAGE_HARNESS_V1.run, runId, workspaceId: input.workspaceId, sessionId: input.sessionId, documentId: input.documentId, turnId, threadId, triggerMessageId: messageId, runRevision: 1, recoveryCheckpointId: null, status: "queued", plan: [], receipts: [], finalOutput: null, deliveryProvenance: null, errorCode: null, cancellationRequested: false, createdAt: at, updatedAt: at };
      const turn: AgentTurnV1 = { contractVersion: LANDING_PAGE_HARNESS_V1.turn, turnId, workspaceId: input.workspaceId, sessionId: input.sessionId, documentId: input.documentId, runId, threadId, triggerMessageId: messageId, deliveredAt: null, createdAt: at };
      decodeConversationThreadV1(thread); decodeAgentRunV1(run); decodeAgentTurnV1(turn);
      const catalogBinding = createRunToolCatalogBindingV1({
        runId,
        seed: catalogBindingSeed,
        createdAt: at,
      });
      this.threads.set(threadId, thread); this.turns.set(turnId, turn); this.runs.set(runId, run); this.requestReservations.set(input.requestId, { inputHash, inputHashVersion: input.durableSubmitEnvelope ? "submit-envelope-v1" : "catalog-v1", ...(input.envelopeId !== undefined ? { envelopeId: input.envelopeId } : {}), ...(input.durableSubmitEnvelope ? { envelopeHash: input.durableSubmitEnvelope.envelopeHash } : {}), requestedThreadId: input.threadId ?? null, threadId, turnId, runId, catalogBindingId: catalogBinding.bindingId, runtimeAuthorityKind, ...(input.canvasObservationBindingHash ? { canvasObservationBindingHash: input.canvasObservationBindingHash } : {}) }); this.runToolCatalogBindings.set(runId, catalogBinding); this.counters.conversationWrite += 1; this.counters.runWrite += 1;
      this.fault("reserveTurn:after_facts"); this.event(run, "run", "run_queued", { status: "queued" });
      return { thread: clone(thread), turn: clone(turn), run: clone(run), replayed: false };
    });
  }

  reserveH1Turn(input: ReserveTurnInputV1 & { admissionSeed: H1RuntimeAdmissionSeedV1; catalogBindingSeed: RunToolCatalogBindingSeedV1 }, lease?: H1StoreCommitLeaseV1) {
    return this.atomic("reserveH1Turn", () => {
      const seed = decodeH1RuntimeAdmissionSeedV1(input.admissionSeed);
      const durableSubmitEnvelope = input.durableSubmitEnvelope
        ? assertH1DurableSubmitEnvelopeMatchesV1({
            envelope: input.durableSubmitEnvelope,
            requestId: input.requestId,
            workspaceId: input.workspaceId,
            sessionId: input.sessionId,
            documentId: input.documentId,
            message: input.message,
            seed,
            catalogBindingSeed: input.catalogBindingSeed,
          })
        : undefined;
      if (
        durableSubmitEnvelope &&
        durableSubmitEnvelope.envelopeId !== input.envelopeId
      ) {
        throw new ConversationStoreErrorV1(
          "h1_durable_submit_envelope_binding_mismatch",
          "Durable Submit Envelope differs from the submitted Envelope identity."
        );
      }
      if (
        seed.grantReservation.requestId !== input.requestId ||
        seed.grantClaims.workspaceId !== input.workspaceId ||
        seed.grantClaims.sessionId !== input.sessionId ||
        seed.grantClaims.documentId !== input.documentId
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_identity_mismatch",
          "H1 admission seed differs from the requested Turn identity."
        );
      }
      const nonceHash = h1RuntimeGrantNonceHashV1(seed);
      const consumed = this.h1ConsumedGrantNonces.get(nonceHash);
      if (
        consumed &&
        (consumed.requestId !== input.requestId || consumed.seedHash !== seed.seedHash)
      ) {
        throw new ConversationStoreErrorV1(
          "h1_capture_grant_nonce_replay",
          "Capture Grant nonce was already consumed by another H1 admission."
        );
      }
      const reserved = this.reserveTurnForAuthorityV1({
        requestId: input.requestId,
        ...(input.envelopeId !== undefined
          ? { envelopeId: input.envelopeId }
          : {}),
        workspaceId: input.workspaceId,
        sessionId: input.sessionId,
        documentId: input.documentId,
        threadId: input.threadId,
        message: input.message,
        canvasObservationBindingHash: seed.observationBindingHash,
        catalogBindingSeed: input.catalogBindingSeed,
        ...(durableSubmitEnvelope ? { durableSubmitEnvelope } : {}),
      }, "h1-runtime-admission-v1");
      const existing = this.h1RuntimeAdmissions.get(reserved.run.runId);
      if (existing) {
        const reservation = this.requestReservations.get(input.requestId);
        if (
          existing.requestId !== input.requestId ||
          existing.seed.seedHash !== seed.seedHash ||
          consumed?.runId !== reserved.run.runId ||
          reservation?.runtimeAuthorityKind !== "h1-runtime-admission-v1"
        ) {
          throw new ConversationStoreErrorV1(
            "h1_runtime_admission_conflict",
            "H1 Run is already bound to different admission material."
          );
        }
        return {
          ...reserved,
          admission: clone(existing),
          replayed: true,
        };
      }
      if (reserved.replayed || consumed) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_conflict",
          "Request or Capture Grant nonce is detached from its durable H1 admission."
        );
      }
      const reservation = this.requestReservations.get(input.requestId);
      if (!reservation || reservation.runId !== reserved.run.runId) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_closure_invalid",
          "H1 Request reservation disappeared before authority ownership was frozen."
        );
      }
      const admission = createH1RuntimePendingAdmissionV1({
        requestId: input.requestId,
        workspaceId: reserved.run.workspaceId,
        sessionId: reserved.run.sessionId,
        documentId: reserved.run.documentId,
        threadId: reserved.run.threadId,
        turnId: reserved.run.turnId,
        runId: reserved.run.runId,
        seed,
        createdAt: this.now(),
      });
      this.h1RuntimeAdmissions.set(reserved.run.runId, admission);
      this.h1ConsumedGrantNonces.set(nonceHash, {
        requestId: input.requestId,
        seedHash: seed.seedHash,
        runId: reserved.run.runId,
      });
      this.fault("reserveH1Turn:after_admission");
      return { ...reserved, admission: clone(admission), replayed: false };
    }, {
      lease,
      operation: "h1_admission.reserve",
      target: { kind: "request", requestId: input.requestId },
      mutation: h1AdmissionReserveMutationBindingV1(input),
    });
  }

  activateH1RuntimeAdmission(input: { runId: string; grantReceipt: EffectiveFactsCaptureGrantReceiptV1; hostReceipt: EffectiveFactsHostReceiptV1; authority: H1RuntimeAuthorityMaterialV1; activatedAt: string }, lease?: H1StoreCommitLeaseV1): H1RuntimeAdmissionActiveV1 {
    return this.atomic("activateH1RuntimeAdmission", () => {
      const catalogBinding = this.assertCatalogExecutionWritableV1(input.runId);
      this.assertRuntimeAuthorityCatalogProfileV1(
        "h1-runtime-admission-v1",
        catalogBinding
      );
      if (
        input.authority.compiledToolCatalog.catalogHash !==
          catalogBinding.catalogHash ||
        catalogBinding.toolDescriptorFingerprint !==
          H1_RUNTIME_CATALOG_BINDING_SEED_V1.toolDescriptorFingerprint
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_catalog_authority_closure_mismatch",
          "H1 compiled authority differs from the immutable Run Tool Catalog binding."
        );
      }
      const current = this.h1RuntimeAdmissions.get(input.runId);
      if (!current) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_missing",
          "H1 Run admission is missing."
        );
      }
      if (current.status === "active") {
        if (
          hashCanonicalJsonV1(current.grantReceipt) !== hashCanonicalJsonV1(input.grantReceipt) ||
          hashCanonicalJsonV1(current.hostReceipt) !== hashCanonicalJsonV1(input.hostReceipt) ||
          current.authority.materialHash !== input.authority.materialHash
        ) {
          throw new ConversationStoreErrorV1(
            "h1_runtime_admission_conflict",
            "H1 Run is already active with different authority material."
          );
        }
        return clone(current);
      }
      if (current.status !== "pending") {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_rejected",
          "Rejected H1 Run admission cannot be activated."
        );
      }
      const active = activateH1RuntimeAdmissionV1({
        pending: current,
        grantReceipt: input.grantReceipt,
        hostReceipt: input.hostReceipt,
        authority: input.authority,
        activatedAt: input.activatedAt,
      });
      this.h1RuntimeAdmissions.set(input.runId, active);
      this.fault("activateH1RuntimeAdmission:after_activation");
      return clone(active);
    }, {
      lease,
      operation: "h1_admission.activate",
      target: { kind: "run", runId: input.runId },
      mutation: h1AdmissionActivationMutationBindingV1(input),
    });
  }

  rejectH1RuntimeAdmission(input: { runId: string; rejectionCode: string; rejectedAt: string }, lease?: H1StoreCommitLeaseV1): H1RuntimeAdmissionRecordV1 {
    return this.atomic("rejectH1RuntimeAdmission", () => {
      this.assertCatalogExecutionWritableV1(input.runId);
      const current = this.h1RuntimeAdmissions.get(input.runId);
      if (!current) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_missing",
          "H1 Run admission is missing."
        );
      }
      if (current.status === "rejected") {
        if (current.rejectionCode !== input.rejectionCode) {
          throw new ConversationStoreErrorV1(
            "h1_runtime_admission_conflict",
            "H1 Run was rejected for a different reason."
          );
        }
        return clone(current);
      }
      if (current.status === "active") {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_conflict",
          "Active H1 Run admission cannot be rejected in place."
        );
      }
      const rejected = rejectH1RuntimeAdmissionV1({
        pending: current,
        rejectionCode: input.rejectionCode,
        rejectedAt: input.rejectedAt,
      });
      this.h1RuntimeAdmissions.set(input.runId, rejected);
      this.fault("rejectH1RuntimeAdmission:after_rejection");
      return clone(rejected);
    }, {
      lease,
      operation: "h1_admission.reject",
      target: { kind: "run", runId: input.runId },
      mutation: h1AdmissionRejectMutationBindingV1(input),
    });
  }

  getH1RuntimeAdmission(runId: string): H1RuntimeAdmissionRecordV1 | null {
    this.run(runId);
    const admission = this.h1RuntimeAdmissions.get(runId);
    return admission ? clone(admission) : null;
  }

  getH1RuntimeAdmissionByRequestId(requestId: string): H1RuntimeAdmissionRecordV1 | null {
    requiredIdV1(requestId, "h1Admission.requestId");
    const admission = [...this.h1RuntimeAdmissions.values()].find(
      (item) => item.requestId === requestId
    );
    return admission ? clone(admission) : null;
  }
  getSubmissionEnvelopeIdByRequestId(requestId: string): string | null {
    requiredIdV1(requestId, "requestReservation.requestId");
    return this.requestReservations.get(requestId)?.envelopeId ?? null;
  }

  consumeH1RuntimeRead(input: { runId: string; workspaceId: string; sessionId: string; documentId: string; threadId: string; turnId: string; claim: RunExecutionClaimV1; principalHash: string; policyId: string; policyRevision: string; readAt?: string }, lease?: H1StoreCommitLeaseV1): H1RuntimeReadConsumptionV1 {
    return this.atomic("consumeH1RuntimeRead", () => {
      const run = this.run(input.runId);
      this.assertRequiredClaim(input.runId, input.claim);
      if (run.status !== "running") {
        throw new ConversationStoreErrorV1(
          "h1_runtime_read_run_state_invalid",
          "H1 read budget can only be consumed by the current running worker."
        );
      }
      const current = this.h1RuntimeAdmissions.get(input.runId);
      if (!current || current.status !== "active") {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_not_active",
          "H1 Run authority is unavailable or not active."
        );
      }
      if (
        current.workspaceId !== input.workspaceId ||
        current.sessionId !== input.sessionId ||
        current.documentId !== input.documentId ||
        current.threadId !== input.threadId ||
        current.turnId !== input.turnId ||
        current.seed.principalHash !== input.principalHash ||
        current.seed.aclDecision.policyId !== input.policyId ||
        current.seed.aclDecision.policyRevision !== input.policyRevision
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_read_authority_mismatch",
          "H1 read identity or reauthorized ACL revision differs."
        );
      }
      const before = current.readBudget.consumed;
      const next = consumeH1RuntimeAdmissionReadV1(
        current,
        input.readAt || this.now()
      );
      this.h1RuntimeAdmissions.set(input.runId, next);
      this.fault("consumeH1RuntimeRead:after_budget");
      return {
        admission: clone(next),
        before,
        after: next.readBudget.consumed,
      };
    }, { lease, operation: "h1_read.consume", target: { kind: "run", runId: input.runId } });
  }

  appendH1ActorCallBinding(input: { runId: string; binding: H1ActorCallBindingV1; claim: RunExecutionClaimV1 }, lease?: H1StoreCommitLeaseV1): H1RuntimeAdmissionActiveV1 {
    return this.atomic("appendH1ActorCallBinding", () => {
      const run = this.run(input.runId);
      this.assertRequiredClaim(input.runId, input.claim);
      if (run.status !== "running") {
        throw new ConversationStoreErrorV1(
          "h1_actor_call_run_state_invalid",
          "H1 Actor call binding requires a running Run."
        );
      }
      const current = this.h1RuntimeAdmissions.get(input.runId);
      if (!current || current.status !== "active") {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_not_active",
          "H1 Actor call binding requires an active Runtime Admission."
        );
      }
      const binding = decodeH1ActorCallBindingV1(input.binding);
      const events = this.events.get(input.runId) || [];
      const eventHeadHash = events.at(-1)?.eventHash || "GENESIS";
      const governance = [...this.runFingerprints.values()].find(
        (fingerprint) => fingerprint.runId === input.runId
      );
      const receiptHashes = new Set(
        run.receipts.map((receipt) => hashCanonicalJsonV1(receipt))
      );
      const expectedActorCall = expectedH1ActorCallClosureV1({
        admission: current,
        run,
        thread: this.thread(run.threadId),
        binding,
      });
      if (
        binding.runRevision !== run.runRevision ||
        binding.eventHeadHash !== eventHeadHash ||
        !governance ||
        binding.toolDescriptorHash !== governance.toolDescriptorFingerprint ||
        binding.contextManifest.uxCapabilityFingerprint !==
          current.seed.snapshot.capabilityFingerprint ||
        binding.contextManifest.revisionBinding !==
          hashCanonicalJsonV1(current.seed.snapshot.revision) ||
        binding.sourceReceiptHashes.some((hash) => !receiptHashes.has(hash)) ||
        binding.actorRequestHash !== expectedActorCall.actorRequestHash ||
        binding.contextManifest.manifestHash !==
          expectedActorCall.contextManifestHash ||
        binding.toolDescriptorHash !== expectedActorCall.toolDescriptorHash
      ) {
        throw new ConversationStoreErrorV1(
          "h1_actor_call_store_closure_mismatch",
          "H1 Actor call binding differs from current Store facts."
        );
      }
      const next = appendH1ActorCallBindingV1(current, binding);
      this.h1RuntimeAdmissions.set(input.runId, next);
      return clone(next);
    }, { lease, operation: "h1_actor_binding.append", target: { kind: "run", runId: input.runId } });
  }

  listThreads(input: { workspaceId: string; sessionId: string; documentId: string; limit: number }): readonly ConversationThreadV1[] {
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 50) throw new ConversationStoreErrorV1("thread_list_limit_invalid", "Thread list limit is invalid.");
    return [...this.threads.values()]
      .filter((thread) => thread.workspaceId === input.workspaceId && thread.sessionId === input.sessionId && thread.documentId === input.documentId)
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt))
      .slice(0, input.limit)
      .map(clone);
  }
  renameThread(input: { threadId: string; workspaceId: string; sessionId: string; documentId: string; title: string }, lease?: H1StoreCommitLeaseV1): ConversationThreadV1 {
    return this.atomic("renameThread", () => {
      const current = this.thread(input.threadId);
      if (current.workspaceId !== input.workspaceId || current.sessionId !== input.sessionId || current.documentId !== input.documentId) {
        throw new ConversationStoreErrorV1("thread_not_found", "Thread was not found.");
      }
      const threadRunIds = [...this.runs.values()]
        .filter((run) => run.threadId === current.threadId)
        .map((run) => run.runId);
      if (
        threadRunIds.some(
          (runId) => isSelectionReadMechanicalAuthorityV1(
            this.authorityKindForRunV1(runId)
          )
        )
      ) {
        throw new ConversationStoreErrorV1(
          R2_SELECTION_C0_B3_STORE_V1.runtimeNotInstalledCode,
          "R2 B3-B1 keeps Thread metadata immutable until its dedicated Runtime lane is installed."
        );
      }
      if (
        threadRunIds.length > 0 &&
        threadRunIds.every((runId) =>
          this.catalogCompatibilityOnlyRunIds.has(runId)
        )
      ) {
        throw new ConversationStoreErrorV1(
          "run_catalog_compatibility_only",
          "A pre-R1 compatibility-only Thread is immutable history and cannot be renamed."
        );
      }
      const next = { ...current, title: normalizedThreadTitleV1(input.title), updatedAt: this.now() };
      decodeConversationThreadV1(next);
      this.threads.set(next.threadId, next);
      this.counters.conversationWrite += 1;
      return clone(next);
    }, { lease, operation: "thread.rename", target: { kind: "thread", threadId: input.threadId } });
  }
  getThread(threadId: string): ThreadSnapshotV1 | null { const thread = this.threads.get(threadId); if (!thread) return null; return { thread: clone(thread), runs: [...this.runs.values()].filter((run) => run.threadId === threadId).map(clone), capabilities: createRuntimeCapabilitySnapshotV1(this.now()) }; }
  getTurn(turnId: string): AgentTurnV1 | null { const turn = this.turns.get(turnId); return turn ? clone(turn) : null; }
  getRun(runId: string): RunSnapshotV1 | null { const run = this.runs.get(runId); if (!run) return null; return { run: clone(run), thread: clone(this.thread(run.threadId)), events: clone(this.events.get(runId) || []), capabilities: createRuntimeCapabilitySnapshotV1(this.now()) }; }
  getRunRuntimeAuthorityKind(runId: string) {
    this.run(runId);
    return this.authorityKindForRunV1(runId);
  }
  getRunToolCatalogBinding(runId: string) {
    this.run(runId);
    const binding = this.runToolCatalogBindings.get(runId);
    return binding ? clone(binding) : null;
  }
  isCatalogCompatibilityOnlyRun(runId: string) {
    this.run(runId);
    return this.catalogCompatibilityOnlyRunIds.has(runId);
  }
  getCanvasObservationBindingHash(runId: string): string | null {
    this.run(runId);
    for (const reservation of this.requestReservations.values()) {
      if (reservation.runId === runId) {
        return reservation.canvasObservationBindingHash || null;
      }
    }
    throw new ConversationStoreErrorV1(
      "request_reservation_missing",
      "Run is not bound to its durable request reservation."
    );
  }
  private allRunnableRunIdsV1(
    runtimeAuthorityKind: RuntimeAuthorityKindV1 | "all"
  ) {
    const now = this.nowEpoch();
    return [...this.runs.values()].filter((run) => {
      if (this.migrationRequiredRunIds.has(run.runId)) return false;
      if (this.catalogCompatibilityOnlyRunIds.has(run.runId)) return false;
      const authorityKind = this.authorityKindForRunV1(run.runId);
      if (
        runtimeAuthorityKind !== "all" &&
        authorityKind !== runtimeAuthorityKind
      )
        return false;
      if (
        authorityKind ===
        R2_SELECTION_C0_B3_AUTHORITY_V1.runtimeAuthorityKind
      ) return false;
      const h1Admission = this.h1RuntimeAdmissions.get(run.runId);
      if (
        authorityKind === "h1-runtime-admission-v1" &&
        h1Admission?.status !== "active"
      ) return false;
      if (h1Admission?.status === "active") {
        const authorityExpiresAt = Math.min(
          Date.parse(h1Admission.hostReceipt.expiresAt),
          Date.parse(h1Admission.authority.runToolAdmission.expiresAt),
          Date.parse(h1Admission.authority.executionAdmission.expiresAt)
        );
        if (!Number.isFinite(authorityExpiresAt) || now >= authorityExpiresAt)
          return false;
      }
      if (run.status === "queued" || run.status === "recovering") return true;
      if (run.status !== "running") return false;
      const lease = this.leases.get(run.runId);
      return !lease || lease.expiresAt <= now;
    }).map((run) => run.runId);
  }
  listRunnableRunIds(
    limit: number,
    runtimeAuthorityKind: RuntimeAuthorityKindV1 | "all" = "all"
  ) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 10_000) throw new ConversationStoreErrorV1("run_list_limit_invalid", "Runnable Run list limit is invalid.");
    return this.allRunnableRunIdsV1(runtimeAuthorityKind).slice(0, limit);
  }
  takeRunnableRunIdsForDispatch(limit: number, runtimeAuthorityKind: RuntimeAuthorityKindV1) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new ConversationStoreErrorV1("run_list_limit_invalid", "Durable dispatch list limit is invalid.");
    const runnable = [...this.allRunnableRunIdsV1(runtimeAuthorityKind)];
    const cursor = this.dispatcherCursors.get(runtimeAuthorityKind);
    const cursorIndex = cursor ? runnable.indexOf(cursor) : -1;
    const startIndex = cursorIndex >= 0 ? cursorIndex + 1 : 0;
    const selected = Array.from(
      { length: Math.min(limit, runnable.length) },
      (_unused, index) => runnable[(startIndex + index) % runnable.length]!
    );
    if (selected.length) this.dispatcherCursors.set(runtimeAuthorityKind, selected.at(-1)!);
    return selected;
  }
  listPendingToolInvocations(runId: string): readonly PendingToolInvocationV1[] {
    const run = this.run(runId);
    const pending: PendingToolInvocationV1[] = [];
    for (const message of this.thread(run.threadId).messages) {
      if (message.runId !== runId || message.role !== "assistant" || !message.toolCalls.length) continue;
      for (const call of message.toolCalls) {
        if (run.receipts.some((receipt) => receipt.callId === call.callId)) continue;
        const batch = this.assistantToolBatchReservations.get(`${runId}\u0000${call.callId}`);
        const version = batch?.versions.find((item) => item.callId === call.callId)?.toolVersion;
        if (!batch || !version) throw new ConversationStoreErrorV1("tool_recovery_batch_missing", "Pending Tool call is not bound to a durable Assistant batch.");
        this.assertAssistantToolBatchIdentity(run, call, version);
        const invocation = this.toolReservations.get(`${runId}\u0000${call.callId}`);
        if (invocation?.receipt) throw new ConversationStoreErrorV1("tool_recovery_receipt_detached", "Terminal Tool reservation is detached from its Run Receipt.");
        pending.push({ call: clone(call), toolVersion: version, invocationStarted: Boolean(invocation) });
      }
    }
    return pending;
  }
  private transition(runId: string, allowed: readonly AgentRunStatusV1[], status: AgentRunStatusV1, errorCode: RunPublicErrorCodeV1 | null = null) { const current = this.run(runId); if (!allowed.includes(current.status)) throw new ConversationStoreErrorV1("run_transition_invalid", `${current.status} cannot transition to ${status}.`); const next = { ...current, status, errorCode, recoveryCheckpointId: status === "running" ? null : current.recoveryCheckpointId, cancellationRequested: status === "running" ? false : current.cancellationRequested, runRevision: current.runRevision + 1, updatedAt: this.now() }; decodeAgentRunV1(next); this.runs.set(runId, next); this.counters.runWrite += 1; return next; }
  startRun(runId: string, claim?: RunExecutionClaimV1, metadata?: RunStartMetadataV1, lease?: H1StoreCommitLeaseV1) { return this.atomic("startRun", () => { this.assertCatalogExecutionWritableV1(runId); if (this.migrationRequiredRunIds.has(runId)) throw new ConversationStoreErrorV1("run_migration_required", "Historical Run cannot execute without its original Run fingerprint; submit a new Run."); const h1Admission = this.h1RuntimeAdmissions.get(runId); if (h1Admission && h1Admission.status !== "active") throw new ConversationStoreErrorV1("h1_runtime_admission_not_active", "H1 Run cannot start before its authority admission is active."); this.assertClaim(runId, claim); const modelIdentity = metadata?.modelIdentity; if (modelIdentity !== undefined) { try { requiredModelIdentityV1(modelIdentity, "run.modelIdentity"); } catch { throw new ConversationStoreErrorV1("run_model_identity_invalid", "Run model identity must be a trimmed non-empty string up to 160 characters without control characters."); } } const fingerprint = [...this.runFingerprints.values()].find((item) => item.runId === runId); if (!fingerprint) throw new ConversationStoreErrorV1("run_fingerprint_missing", "Current Run cannot start without its immutable fingerprint."); if (modelIdentity !== undefined && fingerprint.modelIdentity !== modelIdentity) throw new ConversationStoreErrorV1("run_fingerprint_mismatch", "Run model identity differs from its immutable fingerprint."); const next = this.transition(runId, ["queued", "recovering"], "running"); this.fault("startRun:after_run"); this.event(next, "run", "run_started", { status: "running", ...(modelIdentity === undefined ? {} : { modelIdentity }) }); return clone(next); }, { lease, operation: "run.start", target: { kind: "run", runId } }); }

  startR2SelectionC0RunV1(input: Readonly<{
    runId: string;
    modelIdentity: string;
    promptManifestHash: string;
    capabilitySnapshotHash: string;
  }>) {
    return this.atomic("startR2SelectionC0Run", () => {
      const normalizedRunId = requiredIdV1(input.runId, "r2Lifecycle.runId");
      const normalizedModelIdentity = requiredModelIdentityV1(
        input.modelIdentity,
        "r2Lifecycle.modelIdentity"
      );
      const promptManifestHash = requiredHashV1(
        input.promptManifestHash,
        "r2Lifecycle.promptManifestHash"
      );
      const capabilitySnapshotHash = requiredHashV1(
        input.capabilitySnapshotHash,
        "r2Lifecycle.capabilitySnapshotHash"
      );
      const reservation = [...this.requestReservations.values()].find(
        (item) => item.runId === normalizedRunId
      );
      if (!isSelectionReadMechanicalAuthorityV1(reservation?.runtimeAuthorityKind)) {
        throw new ConversationStoreErrorV1(
          "r2_lifecycle_authority_mismatch",
          "R2 lifecycle start requires the exact dedicated Runtime authority."
        );
      }
      const current = this.run(normalizedRunId);
      if (current.status !== "queued") {
        throw new ConversationStoreErrorV1(
          "r2_lifecycle_start_state_invalid",
          "R2 lifecycle can start only from queued."
        );
      }
      const catalogBinding = this.runToolCatalogBindings.get(normalizedRunId);
      if (!catalogBinding) {
        throw new ConversationStoreErrorV1(
          "r2_lifecycle_catalog_binding_missing",
          "R2 lifecycle start requires the immutable Run Catalog binding."
        );
      }
      const fingerprintBase = {
        contractVersion: LANDING_PAGE_GOVERNANCE_FACTS_V1.runFingerprintV2,
        runFingerprintId: `fingerprint-r2-${hashCanonicalJsonV1({
          runId: normalizedRunId,
          modelIdentity: normalizedModelIdentity,
          catalogBindingHash: catalogBinding.bindingHash,
          promptManifestHash,
          capabilitySnapshotHash,
        })}`,
        runId: normalizedRunId,
        runtimeContractVersion: LANDING_PAGE_HARNESS_V1.run,
        runtimeBuildRef: "repo:r2-selection-c0-b3-lifecycle-v1",
        modelIdentity: normalizedModelIdentity,
        promptManifestHash,
        capabilitySnapshotHash,
        toolDescriptorFingerprint: toolDescriptorFingerprintV1(
          R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1
        ),
        toolDescriptorIdentities: R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1
          .map(({ toolId, version }) => ({ toolId, version }))
          .sort((left, right) =>
            `${left.toolId}\u0000${left.version}`.localeCompare(
              `${right.toolId}\u0000${right.version}`
            )
          ),
        terminalDescriptorFacts: R2_SELECTION_C0_B3_TOOL_DESCRIPTORS_V1
          .map(({ toolId, version, effect }) => ({ toolId, version, effect }))
          .sort((left, right) =>
            `${left.toolId}\u0000${left.version}`.localeCompare(
              `${right.toolId}\u0000${right.version}`
            )
          ),
        contextSchemaVersion: "formal-r3-r2-selection-c0-context-v1",
        publicProjectionContractVersion:
          "formal-r3-r2-selection-c0-public-projection-v1",
        catalogBindingId: catalogBinding.bindingId,
        catalogBindingHash: catalogBinding.bindingHash,
        catalogProfileId: catalogBinding.catalogProfileId,
        catalogEpoch: catalogBinding.catalogEpoch,
        catalogHash: catalogBinding.catalogHash,
        eventEnvelopeVersion: catalogBinding.eventEnvelopeVersion,
        createdAt: this.now(),
      } as const;
      const fingerprint = decodeRunFingerprintRecordV1({
        ...fingerprintBase,
        fingerprintHash: hashCanonicalJsonV1(fingerprintBase),
      });
      this.assertRunFingerprintCatalogClosureV1(fingerprint, catalogBinding);
      this.runFingerprints.set(fingerprint.runFingerprintId, clone(fingerprint));
      const next = this.transition(normalizedRunId, ["queued"], "running");
      this.fault("startR2SelectionC0Run:after_run");
      this.event(next, "run", "run_started", {
        status: "running",
        modelIdentity: normalizedModelIdentity,
      });
      return clone(next);
    });
  }

  private appendMessage(run: AgentRunV1, role: "assistant" | "tool", content: string, toolCallId: string | null, toolCalls: readonly ToolCallV1[]) { const thread = this.thread(run.threadId); this.assertRunThread(run, thread); const message: ConversationMessageV1 = { contractVersion: LANDING_PAGE_HARNESS_V1.message, messageId: this.id("message"), workspaceId: run.workspaceId, sessionId: run.sessionId, threadId: run.threadId, turnId: run.turnId, runId: run.runId, sequence: thread.messages.length + 1, role, content, toolCallId, toolCalls: clone(toolCalls), createdAt: this.now() }; const next = { ...thread, messages: [...thread.messages, message], updatedAt: message.createdAt }; decodeConversationThreadV1(next); this.threads.set(thread.threadId, next); this.counters.conversationWrite += 1; return clone(message); }
  appendAssistantToolCalls(runId: string, content: string, calls: readonly ToolCallV1[], claim: RunExecutionClaimV1 | undefined, toolVersions: Readonly<Record<string, string>>, lease?: H1StoreCommitLeaseV1) {
    return this.atomic("appendAssistantToolCalls", () => {
      this.assertClaim(runId, claim);
      const run = this.run(runId); if (run.status !== "running") throw new ConversationStoreErrorV1("run_not_running", "Run is not running.");
      const callIds = calls.map((call) => call.callId);
      if (!calls.length || new Set(callIds).size !== callIds.length) throw new ConversationStoreErrorV1("tool_call_batch_invalid", "Assistant Tool call batch must contain unique calls.");
      if (!toolVersions || typeof toolVersions !== "object" || Array.isArray(toolVersions) || Object.getPrototypeOf(toolVersions) !== Object.prototype) throw new ConversationStoreErrorV1("tool_call_batch_version_invalid", "Assistant Tool call batch versions must be a plain object.");
      const versions = calls.map((call) => ({ callId: call.callId, toolVersion: toolVersions[call.callId] || "" }));
      if (Object.keys(toolVersions).length !== calls.length || versions.some((item) => typeof item.toolVersion !== "string" || !item.toolVersion.trim() || item.toolVersion.length > 40)) throw new ConversationStoreErrorV1("tool_call_batch_version_invalid", "Assistant Tool call batch versions must match every call exactly.");
      this.assertToolCatalogMembershipV1(
        runId,
        calls.map((call) => ({
          toolId: call.toolId,
          toolVersion: toolVersions[call.callId]!,
        }))
      );
      const inputHash = hashCanonicalJsonV1({ runId, calls, versions });
      const durableReservations = callIds.map((callId) => this.assistantToolBatchReservations.get(`${runId}\u0000${callId}`));
      if (durableReservations.some(Boolean)) {
        const first = durableReservations.find(Boolean)!;
        if (durableReservations.some((reservation) => !reservation || reservation.inputHash !== inputHash || reservation.messageId !== first.messageId || hashCanonicalJsonV1(reservation.callIds) !== hashCanonicalJsonV1(callIds) || hashCanonicalJsonV1(reservation.versions) !== hashCanonicalJsonV1(versions))) throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Assistant Tool call identity overlaps a different batch.");
        const original = this.thread(run.threadId).messages.find((message) => message.messageId === first.messageId);
        if (!original || hashCanonicalJsonV1(original.toolCalls) !== hashCanonicalJsonV1(calls)) throw new ConversationStoreErrorV1("tool_call_batch_reservation_invalid", "Assistant Tool call batch Message is missing or differs.");
        return clone(original);
      }
      for (const message of this.thread(run.threadId).messages) {
        if (message.runId !== runId || message.role !== "assistant" || !message.toolCalls.length) continue;
        const priorIds = new Set(message.toolCalls.map((call) => call.callId));
        if (!callIds.some((callId) => priorIds.has(callId))) continue;
        if (hashCanonicalJsonV1(message.toolCalls) !== hashCanonicalJsonV1(calls)) throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Assistant Tool call identity overlaps a different batch.");
        const historicalVersions = calls.map((call) => {
          const toolReservation = this.toolReservations.get(`${runId}\u0000${call.callId}`);
          const receipt = run.receipts.find((item) => item.callId === call.callId);
          const startedEvents = (this.events.get(runId) || []).filter((event) => event.state === "tool_started" && event.callId === call.callId);
          const provenVersions: string[] = [];
          if (toolReservation) {
            const reservationHash = hashCanonicalJsonV1({ runId, call: toolReservation.call, toolVersion: toolReservation.toolVersion });
            if (toolReservation.inputHash !== reservationHash || hashCanonicalJsonV1(toolReservation.call) !== hashCanonicalJsonV1(call)) throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Legacy Tool reservation identity differs from the Assistant call.");
            provenVersions.push(toolReservation.toolVersion);
          }
          if (receipt) {
            if (receipt.toolId !== call.toolId || receipt.argumentsHash !== toolArgumentsHashV1(call.argumentsJson)) throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Legacy Tool Receipt identity differs from the Assistant call.");
            provenVersions.push(receipt.toolVersion);
          }
          for (const event of startedEvents) {
            const eventToolId = event.publicData.toolId;
            const eventVersion = event.publicData.toolVersion;
            if (event.category !== "tool" || eventToolId !== call.toolId || typeof eventVersion !== "string") throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Legacy Tool Event identity differs from the Assistant call.");
            provenVersions.push(eventVersion);
          }
          if (!provenVersions.length) throw new ConversationStoreErrorV1("tool_call_batch_recovery_unverifiable", "Legacy Assistant Tool call version cannot be proven.");
          if (new Set(provenVersions).size !== 1) throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Legacy Tool evidence versions disagree.");
          return { callId: call.callId, toolVersion: provenVersions[0]! };
        });
        if (hashCanonicalJsonV1(versions) !== hashCanonicalJsonV1(historicalVersions)) throw new ConversationStoreErrorV1("tool_call_batch_identity_conflict", "Assistant Tool call version differs from the durable history.");
        const migratedInputHash = hashCanonicalJsonV1({ runId, calls, versions: historicalVersions });
        const migratedReservation = { inputHash: migratedInputHash, messageId: message.messageId, callIds: clone(callIds), versions: clone(historicalVersions) };
        callIds.forEach((callId) => this.assistantToolBatchReservations.set(`${runId}\u0000${callId}`, migratedReservation));
        return clone(message);
      }
      const message = this.appendMessage(run, "assistant", content, null, calls);
      this.fault("appendAssistantToolCalls:after_message");
      const reservation = { inputHash, messageId: message.messageId, callIds: clone(callIds), versions: clone(versions) };
      callIds.forEach((callId) => this.assistantToolBatchReservations.set(`${runId}\u0000${callId}`, reservation));
      return message;
    }, { lease, operation: "assistant_tool_batch.append", target: { kind: "run", runId } });
  }
  private assertAssistantToolBatchIdentity(run: AgentRunV1, call: ToolCallV1, toolVersion: string) {
    this.assertToolCatalogMembershipV1(run.runId, [
      { toolId: call.toolId, toolVersion },
    ]);
    const reservation = this.assistantToolBatchReservations.get(`${run.runId}\u0000${call.callId}`);
    if (!reservation) throw new ConversationStoreErrorV1("tool_call_batch_reservation_missing", "Tool invocation requires an Assistant batch reservation.");
    const message = this.thread(run.threadId).messages.find((item) => item.messageId === reservation.messageId);
    const messageCallIds = message?.toolCalls.map((item) => item.callId) || [];
    const reservationVersionIds = reservation.versions.map((item) => item.callId);
    const expectedInputHash = message ? hashCanonicalJsonV1({ runId: run.runId, calls: message.toolCalls, versions: reservation.versions }) : "";
    if (!message || message.runId !== run.runId || message.role !== "assistant" || reservation.inputHash !== expectedInputHash || hashCanonicalJsonV1(reservation.callIds) !== hashCanonicalJsonV1(messageCallIds) || hashCanonicalJsonV1(reservationVersionIds) !== hashCanonicalJsonV1(messageCallIds)) throw new ConversationStoreErrorV1("tool_call_batch_reservation_invalid", "Assistant Tool batch reservation is malformed or detached from its Message.");
    const assistantCall = message?.toolCalls.find((item) => item.callId === call.callId);
    const version = reservation.versions.find((item) => item.callId === call.callId);
    if (!assistantCall || !version || hashCanonicalJsonV1(assistantCall) !== hashCanonicalJsonV1(call) || version.toolVersion !== toolVersion) throw new ConversationStoreErrorV1("tool_call_identity_conflict", "Tool invocation differs from its Assistant batch reservation.");
    return reservation;
  }
  beginToolInvocation(runId: string, call: ToolCallV1, toolVersion: string, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1) {
    return this.atomic("beginToolInvocation", () => {
      this.assertClaim(runId, claim);
      const catalogBinding = this.assertCatalogExecutionWritableV1(runId);
      const run = this.run(runId); if (run.status !== "running") throw new ConversationStoreErrorV1("run_not_running", "Run is not running.");
      this.assertAssistantToolBatchIdentity(run, call, toolVersion);
      const key = `${runId}\u0000${call.callId}`;
      const inputHash = hashCanonicalJsonV1({ runId, call, toolVersion });
      const reservation = this.toolReservations.get(key);
      if (reservation && reservation.inputHash !== inputHash) throw new ConversationStoreErrorV1("tool_call_identity_conflict", "Tool call identity differs from its durable reservation.");
      const existing = run.receipts.find((receipt) => receipt.callId === call.callId);
      if (existing) {
        if (existing.toolId !== call.toolId || existing.toolVersion !== toolVersion || existing.argumentsHash !== toolArgumentsHashV1(call.argumentsJson) || (reservation?.receipt && reservation.receipt.receiptId !== existing.receiptId)) throw new ConversationStoreErrorV1("tool_call_identity_conflict", "Tool call differs from its terminal Receipt.");
        if (!reservation?.receipt) this.toolReservations.set(key, { inputHash, call: clone(call), toolVersion, receipt: clone(existing) });
        return { receipt: clone(existing), event: null, replayed: true, disposition: "terminal_replay" as const };
      }
      if (reservation?.receipt) throw new ConversationStoreErrorV1("tool_call_identity_conflict", "Tool reservation has a terminal Receipt missing from its Run.");
      if (reservation) return { receipt: null, event: null, replayed: false, disposition: "outcome_unknown" as const };
      this.toolReservations.set(key, { inputHash, call: clone(call), toolVersion, receipt: null });
      const publicData = this.createCatalogStartedPublicToolEventV1(
        catalogBinding,
        run,
        call,
        toolVersion
      );
      const event = this.event(
        run,
        "tool",
        "tool_started",
        publicData,
        call.callId
      );
      return { receipt: null, event, replayed: false, disposition: "dispatch_now" as const };
    }, { lease, operation: "tool.begin", target: { kind: "run", runId } });
  }
  settleTool(input: { runId: string; call: ToolCallV1; receipt: ToolInvocationReceiptV1; planProposal?: readonly PlanStepV1[]; claim?: RunExecutionClaimV1 }, lease?: H1StoreCommitLeaseV1) {
    return this.atomic("settleTool", () => {
      this.assertClaim(input.runId, input.claim);
      const current = this.run(input.runId); if (current.status !== "running") throw new ConversationStoreErrorV1("run_not_running", "Late Tool settlement is rejected.");
      const receipt = decodeToolInvocationReceiptV1(input.receipt); if (receipt.runId !== current.runId || receipt.callId !== input.call.callId || receipt.toolId !== input.call.toolId || receipt.argumentsHash !== toolArgumentsHashV1(input.call.argumentsJson) || receipt.workspaceId !== current.workspaceId || receipt.sessionId !== current.sessionId || receipt.threadId !== current.threadId || receipt.turnId !== current.turnId) throw new ConversationStoreErrorV1("tool_receipt_identity_conflict", "Tool Receipt identity differs.");
      this.assertAssistantToolBatchIdentity(current, input.call, receipt.toolVersion);
      const reservationKey = `${current.runId}\u0000${receipt.callId}`;
      const invocationReservation = this.toolReservations.get(reservationKey);
      if (!invocationReservation) throw new ConversationStoreErrorV1("tool_invocation_reservation_missing", "Tool settlement requires a matching invocation reservation.");
      const reservationHash = hashCanonicalJsonV1({ runId: current.runId, call: input.call, toolVersion: receipt.toolVersion });
      if (invocationReservation.inputHash !== reservationHash || hashCanonicalJsonV1(invocationReservation.call) !== hashCanonicalJsonV1(input.call) || invocationReservation.toolVersion !== receipt.toolVersion || (invocationReservation.receipt && invocationReservation.receipt.receiptId !== receipt.receiptId)) throw new ConversationStoreErrorV1("tool_receipt_identity_conflict", "Tool Receipt differs from its invocation reservation.");
      const existing = current.receipts.find((item) => item.callId === receipt.callId); if (existing) { if (existing.receiptId !== receipt.receiptId || invocationReservation.receipt?.receiptId !== existing.receiptId) throw new ConversationStoreErrorV1("tool_receipt_conflict", "Call already settled differently."); return clone(current); }
      if (invocationReservation.receipt) throw new ConversationStoreErrorV1("tool_receipt_conflict", "Invocation reservation is terminal but its Run Receipt is missing.");
      const plan = input.planProposal ? clone(input.planProposal) : current.plan; const next = { ...current, receipts: [...current.receipts, receipt], plan, runRevision: current.runRevision + 1, updatedAt: this.now() }; decodeAgentRunV1(next);
      this.runs.set(current.runId, next); this.counters.runWrite += 1; this.counters.receiptWrite += 1; if (input.planProposal) { this.counters.planWrite += 1; this.event(next, "plan", "plan_updated", { steps: plan }); }
      this.fault("settleTool:after_run");
      if (input.call.toolId === "inspect_ux_capability" && receipt.status === "unavailable") this.event(next, "capability", "capability_unavailable", { capability: "canvasMutation", state: "unavailable", reason: "ux_provider_unavailable", providerIdentity: null }, receipt.callId);
      const catalogBinding = this.assertCatalogExecutionWritableV1(
        current.runId
      );
      const publicToolData = this.createCatalogPublicToolEventV1(
        catalogBinding,
        receipt
      );
      this.fault("settleTool:before_terminal_event"); this.event(next, "tool", this.terminalToolEventStateV1(receipt), publicToolData, receipt.callId);
      this.toolReservations.set(reservationKey, { inputHash: reservationHash, call: clone(input.call), toolVersion: receipt.toolVersion, receipt: clone(receipt) });
      return clone(next);
    }, { lease, operation: "tool.settle", target: { kind: "run", runId: input.runId } });
  }

  /** SQLite-owned R2 recovery projection. This protected seam deliberately
   * does not make the R2 Run claimable or expose any generic mutation port. */
  protected projectVerifiedR2SelectionC0ReceiptV1(input: Readonly<{
    runId: string;
    call: ToolCallV1;
    receipt: ToolInvocationReceiptV1;
  }>) {
    return this.atomic("projectVerifiedR2SelectionC0ReceiptV1", () => {
      if (!isSelectionReadMechanicalAuthorityV1(
        this.authorityKindForRunV1(input.runId)
      )) {
        throw new ConversationStoreErrorV1(
          "r2_main_store_identity_mismatch",
          "The target Run is not owned by the exact R2 authority lane."
        );
      }
      const binding = this.assertCurrentCatalogBindingV1(input.runId);
      if (
        binding.catalogProfileId !==
          R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1.catalogProfileId ||
        binding.catalogEpoch !==
          R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1.catalogEpoch ||
        binding.catalogHash !==
          R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1.catalogHash ||
        binding.toolDescriptorFingerprint !==
          R2_SELECTION_C0_B3_CATALOG_BINDING_SEED_V1.toolDescriptorFingerprint
      ) {
        throw new ConversationStoreErrorV1(
          "r2_main_store_catalog_mismatch",
          "The R2 receipt does not belong to the exact epoch-2 Catalog."
        );
      }
      const run = this.run(input.runId);
      const receipt = decodeToolInvocationReceiptV1(input.receipt);
      if (
        input.call.toolId !== R2_SELECTION_C0_V1.toolId ||
        receipt.status !== "completed" ||
        receipt.runId !== run.runId ||
        receipt.workspaceId !== run.workspaceId ||
        receipt.sessionId !== run.sessionId ||
        receipt.threadId !== run.threadId ||
        receipt.turnId !== run.turnId ||
        receipt.callId !== input.call.callId ||
        receipt.toolId !== input.call.toolId ||
        receipt.toolVersion !== R2_SELECTION_C0_V1.toolVersion ||
        receipt.argumentsHash !== toolArgumentsHashV1(input.call.argumentsJson)
      ) {
        throw new ConversationStoreErrorV1(
          "r2_main_store_receipt_identity_mismatch",
          "The persisted R2 Receipt differs from its exact main Run call tuple."
        );
      }
      const existing = run.receipts.find(
        (candidate) => candidate.callId === receipt.callId
      );
      if (existing) {
        if (hashCanonicalJsonV1(existing) !== hashCanonicalJsonV1(receipt)) {
          throw new ConversationStoreErrorV1(
            "r2_main_store_receipt_conflict",
            "The R2 call is already settled with different Receipt bytes."
          );
        }
        return clone(run);
      }
      if (
        !["queued", "running"].includes(run.status) ||
        run.receipts.length !== 0
      ) {
        throw new ConversationStoreErrorV1(
          "r2_main_store_settlement_state_invalid",
          "R2 B3 can settle only the single Receipt of its admitted active Run."
        );
      }
      this.catalogRegistry.resolveTool(
        binding,
        input.call.toolId,
        receipt.toolVersion
      );
      const callInputHash = hashCanonicalJsonV1({
        runId: input.runId,
        calls: [input.call],
        versions: [{ callId: input.call.callId, toolVersion: receipt.toolVersion }],
      });
      const message = this.appendMessage(run, "assistant", "", null, [input.call]);
      const batch = {
        inputHash: callInputHash,
        messageId: message.messageId,
        callIds: [input.call.callId],
        versions: [{ callId: input.call.callId, toolVersion: receipt.toolVersion }],
      };
      this.assistantToolBatchReservations.set(
        `${input.runId}\u0000${input.call.callId}`,
        batch
      );
      const reservationHash = hashCanonicalJsonV1({
        runId: input.runId,
        call: input.call,
        toolVersion: receipt.toolVersion,
      });
      this.toolReservations.set(`${input.runId}\u0000${input.call.callId}`, {
        inputHash: reservationHash,
        call: clone(input.call),
        toolVersion: receipt.toolVersion,
        receipt: null,
      });
      this.event(
        run,
        "tool",
        "tool_started",
        this.createCatalogStartedPublicToolEventV1(
          binding,
          run,
          input.call,
          receipt.toolVersion
        ),
        input.call.callId
      );
      const next = {
        ...run,
        receipts: [receipt],
        runRevision: run.runRevision + 1,
        updatedAt: this.now(),
      };
      decodeAgentRunV1(next);
      this.runs.set(run.runId, next);
      this.counters.runWrite += 1;
      this.counters.receiptWrite += 1;
      this.fault("projectVerifiedR2SelectionC0ReceiptV1:after_run");
      this.event(
        next,
        "tool",
        this.terminalToolEventStateV1(receipt),
        this.createCatalogPublicToolEventV1(binding, receipt),
        receipt.callId
      );
      this.toolReservations.set(`${input.runId}\u0000${input.call.callId}`, {
        inputHash: reservationHash,
        call: clone(input.call),
        toolVersion: receipt.toolVersion,
        receipt: clone(receipt),
      });
      return clone(next);
    });
  }
  appendAssistantDelta(runId: string, delta: string, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1) { return this.atomic("appendAssistantDelta", () => { this.assertClaim(runId, claim); const run = this.run(runId); if (run.status !== "running") throw new ConversationStoreErrorV1("run_not_running", "Run is not running."); return this.event(run, "assistant", "assistant_delta", { delta }); }, { lease, operation: "assistant_delta.append", target: { kind: "run", runId } }); }
  completeRun(runId: string, content: string, claim?: RunExecutionClaimV1, provenance?: HostDeliveryProvenanceV1, governance?: GovernedRunCompletionV1, lease?: H1StoreCommitLeaseV1) { return this.atomic("completeRun", () => { this.assertClaim(runId, claim); if (!content.trim()) throw new ConversationStoreErrorV1("assistant_content_invalid", "Assistant content must not be empty."); const current = this.run(runId); if (current.status !== "running") throw new ConversationStoreErrorV1("run_not_running", "Run is not running."); const fingerprint = [...this.runFingerprints.values()].find((item) => item.runId === runId); if (!fingerprint) throw new ConversationStoreErrorV1("run_fingerprint_missing", "Current Run completion requires an immutable Run fingerprint."); if (!governance) throw new ConversationStoreErrorV1("canonical_delivery_required", "Governed Run completion requires an atomic Canonical Delivery."); this.assertRequiredClaim(runId, claim); this.governedCompletionDepth += 1; try { if (governance.goalBinding) this.appendRunGoalBinding(governance.goalBinding, claim!); if (governance.terminalAdmission) this.appendTerminalAdmissionInternal(governance.terminalAdmission, claim!, governance.toolDescriptors); } finally { this.governedCompletionDepth -= 1; } const message = this.appendMessage(current, "assistant", content, null, []); this.fault("completeRun:after_message"); this.governedCompletionDepth += 1; try { this.appendCanonicalDeliveryInternal({ ...governance.canonicalDelivery, messageId: message.messageId, finalOutputHash: hashUtf8V1(content), createdAt: this.now() }, claim!, content, governance.toolDescriptors); } finally { this.governedCompletionDepth -= 1; } this.fault("completeRun:after_canonical_delivery"); const next = { ...current, status: "completed" as const, finalOutput: content, deliveryProvenance: provenance ? clone(provenance) : null, errorCode: null, recoveryCheckpointId: null, cancellationRequested: false, runRevision: current.runRevision + 1, updatedAt: this.now() }; decodeAgentRunV1(next); this.runs.set(runId, next); this.counters.runWrite += 1; this.fault("completeRun:after_run"); this.event(next, "delivery", "turn_delivered", { messageId: message.messageId }); this.fault("completeRun:after_delivery_event"); this.event(next, "run", "run_completed", { status: "completed" }); const turn = this.turns.get(next.turnId)!; this.turns.set(next.turnId, { ...turn, deliveredAt: this.now() }); return clone(next); }, { lease, operation: "run.complete", target: { kind: "run", runId } }); }
  private checkpoint(current: AgentRunV1, status: "stopped_recoverable" | "recoverable_failed") { const events = this.events.get(current.runId) || []; const checkpoint: RunRecoveryCheckpointV1 = { contractVersion: LANDING_PAGE_HARNESS_V1.checkpoint, checkpointId: this.id("checkpoint"), workspaceId: current.workspaceId, sessionId: current.sessionId, documentId: current.documentId, threadId: current.threadId, turnId: current.turnId, runId: current.runId, runRevision: current.runRevision + 1, status, eventHeadSequence: events.length, eventHeadHash: events.at(-1)?.eventHash || "GENESIS", receiptIds: current.receipts.map((receipt) => receipt.receiptId), planHash: hashCanonicalJsonV1(current.plan), createdAt: this.now() }; decodeRunRecoveryCheckpointV1(checkpoint); this.checkpoints.set(current.runId, checkpoint); this.counters.checkpointWrite += 1; return checkpoint; }
  failRun(runId: string, errorCode: RunPublicErrorCodeV1, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1) { return this.atomic("failRun", () => { this.assertClaim(runId, claim); const current = this.run(runId); if (!["queued", "running", "recovering"].includes(current.status)) throw new ConversationStoreErrorV1("run_not_running", "Run is not executable."); const checkpoint = this.checkpoint(current, "recoverable_failed"); this.fault("failRun:after_checkpoint"); const next = { ...current, status: "recoverable_failed" as const, errorCode, recoveryCheckpointId: checkpoint.checkpointId, runRevision: checkpoint.runRevision, updatedAt: this.now() }; decodeAgentRunV1(next); this.runs.set(runId, next); this.counters.runWrite += 1; this.fault("failRun:after_run"); this.event(next, "run", "run_recoverable_failed", { status: "recoverable_failed", errorCode, checkpointId: checkpoint.checkpointId }); return clone(next); }, { lease, operation: "run.fail", target: { kind: "run", runId } }); }
  stopRun(runId: string, commitLease?: H1StoreCommitLeaseV1) { return this.atomic("stopRun", () => { this.assertCatalogExecutionWritableV1(runId); const current = this.run(runId); if (current.status === "stopped_recoverable") return clone(current); if (!["queued", "running", "recovering"].includes(current.status)) throw new ConversationStoreErrorV1("run_not_stoppable", "Run cannot be stopped."); const checkpoint = this.checkpoint(current, "stopped_recoverable"); this.fault("stopRun:after_checkpoint"); const next = { ...current, status: "stopped_recoverable" as const, errorCode: "run_stopped" as const, recoveryCheckpointId: checkpoint.checkpointId, cancellationRequested: true, runRevision: checkpoint.runRevision, updatedAt: this.now() }; decodeAgentRunV1(next); this.runs.set(runId, next); this.counters.runWrite += 1; this.fault("stopRun:after_run"); this.event(next, "run", "run_stopped", { status: "stopped_recoverable", errorCode: "run_stopped", checkpointId: checkpoint.checkpointId }); const lease = this.leases.get(runId); if (lease) this.leases.set(runId, { ownerId: "", fencingToken: lease.fencingToken, expiresAt: 0, authorityCeilingEpoch: lease.authorityCeilingEpoch }); return clone(next); }, { lease: commitLease, operation: "run.stop", target: { kind: "run", runId } }); }
  resumeRun(value: ResumeRunInputV1, lease?: H1StoreCommitLeaseV1) { const input = decodeResumeRunInputV1(value); return this.atomic("resumeRun", () => { this.assertCatalogExecutionWritableV1(input.runId); if (this.migrationRequiredRunIds.has(input.runId)) throw new ConversationStoreErrorV1("run_migration_required", "Historical Run cannot resume without its original Run fingerprint; submit a new Run."); const hash = hashCanonicalJsonV1(input); const prior = this.resumeReservations.get(input.idempotencyKey); const current = this.run(input.runId); if (prior) { if (prior.inputHash !== hash) throw new ConversationStoreErrorV1("resume_identity_conflict", "Resume key payload differs."); return clone(current); } const checkpoint = this.checkpoints.get(input.runId); if (!checkpoint || checkpoint.checkpointId !== input.checkpointId || current.recoveryCheckpointId !== input.checkpointId || current.runRevision !== input.expectedRunRevision) throw new ConversationStoreErrorV1("resume_identity_conflict", "Resume identity differs."); if (!["stopped_recoverable", "recoverable_failed"].includes(current.status)) throw new ConversationStoreErrorV1("run_not_resumable", "Run is not recoverable."); const next = { ...current, status: "recovering" as const, cancellationRequested: false, runRevision: current.runRevision + 1, updatedAt: this.now() }; decodeAgentRunV1(next); this.runs.set(input.runId, next); this.counters.runWrite += 1; this.fault("resumeRun:after_run"); this.resumeReservations.set(input.idempotencyKey, { inputHash: hash, run: clone(next) }); this.fault("resumeRun:after_reservation"); this.event(next, "run", "run_recovering", { status: "recovering", checkpointId: checkpoint.checkpointId }); return clone(next); }, { lease, operation: "run.resume", target: { kind: "run", runId: input.runId } }); }
  replayEvents(value: EventCursorV1) { const cursor = decodeEventCursorV1(value); const list = this.events.get(cursor.runId) || []; if (cursor.afterSequence === 0) { if (cursor.afterEventHash !== "GENESIS") throw new ConversationStoreErrorV1("event_cursor_conflict", "Genesis cursor hash differs."); return clone(list); } const head = list[cursor.afterSequence - 1]; if (!head || head.eventHash !== cursor.afterEventHash) throw new ConversationStoreErrorV1("event_cursor_conflict", "Event cursor differs."); return clone(list.slice(cursor.afterSequence)); }

  claimRun(runId: string, ownerId: string, leaseMs: number, authorityCeilingEpoch?: number | null) { return this.atomic("claimRun", () => { this.assertCatalogExecutionWritableV1(runId); if (this.migrationRequiredRunIds.has(runId)) throw new ConversationStoreErrorV1("run_migration_required", "Historical Run cannot execute without its original Run fingerprint; submit a new Run."); assertRunClaimLeaseMsV1(leaseMs); if (!ownerId.trim()) throw new ConversationStoreErrorV1("run_claim_invalid", "Run claim is invalid."); const current = this.leases.get(runId); const now = this.nowEpoch(); if (authorityCeilingEpoch !== undefined && authorityCeilingEpoch !== null && (!Number.isFinite(authorityCeilingEpoch) || authorityCeilingEpoch <= now)) return null; if (current && current.ownerId !== ownerId && current.expiresAt > now) return null; const fencingToken = current && current.ownerId === ownerId && current.expiresAt > now ? current.fencingToken : (current?.fencingToken || 0) + 1; const ceiling = authorityCeilingEpoch ?? null; this.leases.set(runId, { ownerId, fencingToken, expiresAt: Math.min(now + leaseMs, ceiling ?? Number.POSITIVE_INFINITY), authorityCeilingEpoch: ceiling }); return { runId, ownerId, fencingToken }; }); }
  renewRunClaim(claim: RunExecutionClaimV1, leaseMs: number) { return this.atomic("renewRunClaim", () => { this.assertCatalogExecutionWritableV1(claim.runId); assertRunClaimLeaseMsV1(leaseMs); const current = this.leases.get(claim.runId); const now = this.nowEpoch(); if (!current || current.ownerId !== claim.ownerId || current.fencingToken !== claim.fencingToken || current.expiresAt <= now || (current.authorityCeilingEpoch !== null && current.authorityCeilingEpoch <= now)) return false; this.leases.set(claim.runId, { ...current, expiresAt: Math.min(now + leaseMs, current.authorityCeilingEpoch ?? Number.POSITIVE_INFINITY) }); return true; }); }
  releaseRunClaim(claim: RunExecutionClaimV1) { this.atomic("releaseRunClaim", () => { this.assertCatalogExecutionWritableV1(claim.runId); const current = this.leases.get(claim.runId); if (current?.ownerId === claim.ownerId && current.fencingToken === claim.fencingToken) this.leases.set(claim.runId, { ownerId: "", fencingToken: current.fencingToken, expiresAt: 0, authorityCeilingEpoch: current.authorityCeilingEpoch }); }); }
  recordFailureOccurrence(runId: string, family: string, claim?: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1) { return this.atomic("recordFailureOccurrence", () => { this.assertClaim(runId, claim); this.run(runId); if (!family.trim()) throw new ConversationStoreErrorV1("failure_family_invalid", "Failure family is required."); const key = `${runId}\u0000${family}`; const count = (this.failureOccurrences.get(key) || 0) + 1; this.failureOccurrences.set(key, count); return count; }, { lease, operation: "failure_occurrence.record", target: { kind: "run", runId } }); }

  appendRunFingerprint(value: RunFingerprintRecordV1, claim: RunExecutionClaimV1, lease?: H1StoreCommitLeaseV1) { return this.atomic("appendRunFingerprint", () => { const record = decodeRunFingerprintRecordV1(value); this.run(record.runId); this.assertRequiredClaim(record.runId, claim); this.assertGovernanceWritable(record.runId); this.assertRunFingerprintCatalogClosureV1(record, this.assertCatalogExecutionWritableV1(record.runId)); if ([...this.runFingerprints.values()].some((item) => item.runId === record.runId) || this.runFingerprints.has(record.runFingerprintId)) throw new ConversationStoreErrorV1("run_fingerprint_conflict", "Run already owns a fingerprint."); this.runFingerprints.set(record.runFingerprintId, clone(record)); return clone(record); }, { lease, operation: "run_fingerprint.append", target: { kind: "run", runId: value.runId } }); }
  appendRunGoalBinding(value: RunGoalBindingV1, claim: RunExecutionClaimV1) { return this.atomic("appendRunGoalBinding", () => { const record = decodeRunGoalBindingV1(value); const run = this.run(record.runId); this.assertRequiredClaim(record.runId, claim); this.assertGovernanceWritable(record.runId); if (this.governedCompletionDepth < 1) throw new ConversationStoreErrorV1("governance_atomic_completion_required", "Goal binding can only be appended inside atomic governed completion."); if (run.threadId !== record.source.threadId) throw new ConversationStoreErrorV1("governance_identity_mismatch", "Goal binding does not belong to the Run Thread."); this.assertGoalBindingRuntimeClosure(record); if ([...this.runGoalBindings.values()].some((item) => item.runId === record.runId) || this.runGoalBindings.has(record.runGoalBindingId)) throw new ConversationStoreErrorV1("run_goal_binding_conflict", "Run already owns an active Goal binding."); this.runGoalBindings.set(record.runGoalBindingId, clone(record)); return clone(record); }); }
  private appendTerminalAdmissionInternal(value: TerminalAdmissionRecordV1, claim: RunExecutionClaimV1, descriptors: readonly ToolDescriptorV1[]) { const record = decodeTerminalAdmissionRecordV1(value); this.run(record.runId); this.assertRequiredClaim(record.runId, claim); this.assertGovernanceWritable(record.runId); const binding = this.runGoalBindings.get(record.runGoalBindingId); const fingerprint = this.runFingerprints.get(record.runFingerprintId); if (!binding || binding.runId !== record.runId || binding.goalHash !== record.goalHash || !fingerprint || fingerprint.runId !== record.runId || fingerprint.fingerprintHash !== record.runFingerprintHash || fingerprint.toolDescriptorFingerprint !== record.toolDescriptorFingerprint) throw new ConversationStoreErrorV1("governance_closure_invalid", "Terminal admission governance closure is invalid."); this.assertTerminalAdmissionRuntimeClosure(record, descriptors); if ([...this.terminalAdmissions.values()].some((item) => item.runId === record.runId && item.terminalToolCallId === record.terminalToolCallId) || this.terminalAdmissions.has(record.terminalAdmissionId)) throw new ConversationStoreErrorV1("terminal_admission_conflict", "Terminal call already owns an admission record."); this.terminalAdmissions.set(record.terminalAdmissionId, clone(record)); return clone(record); }
  appendTerminalAdmission(value: TerminalAdmissionRecordV1, claim: RunExecutionClaimV1) { return this.atomic("appendTerminalAdmission", () => { const record = decodeTerminalAdmissionRecordV1(value); this.assertRequiredClaim(record.runId, claim); throw new ConversationStoreErrorV1("governance_atomic_completion_required", "Terminal admission can only be appended inside atomic governed completion."); }); }
  private appendCanonicalDeliveryInternal(value: CanonicalDeliveryV1, claim: RunExecutionClaimV1, content: string, descriptors: readonly ToolDescriptorV1[]) { const record = decodeCanonicalDeliveryV1(value); this.run(record.runId); this.assertRequiredClaim(record.runId, claim); this.assertGovernanceWritable(record.runId); this.assertCanonicalDeliveryRuntimeClosure(record, content, descriptors); if ([...this.canonicalDeliveries.values()].some((item) => item.runId === record.runId) || this.canonicalDeliveries.has(record.canonicalDeliveryId)) throw new ConversationStoreErrorV1("canonical_delivery_conflict", "Run already owns canonical delivery."); this.canonicalDeliveries.set(record.canonicalDeliveryId, clone(record)); return clone(record); }
  appendCanonicalDelivery(value: CanonicalDeliveryV1, claim: RunExecutionClaimV1) { return this.atomic("appendCanonicalDelivery", () => { const record = decodeCanonicalDeliveryV1(value); this.assertRequiredClaim(record.runId, claim); throw new ConversationStoreErrorV1("governance_atomic_completion_required", "Canonical delivery can only be appended inside atomic governed completion."); }); }
  getGovernanceFacts(runId: string) { this.run(runId); const governanceStatus = this.migrationRequiredRunIds.has(runId) ? "migration_required" as const : this.preGovernanceRunIds.has(runId) ? "pre_governance" as const : "current" as const; return clone({ governanceStatus, runFingerprint: [...this.runFingerprints.values()].find((item) => item.runId === runId) || null, runGoalBinding: [...this.runGoalBindings.values()].find((item) => item.runId === runId) || null, terminalAdmissions: [...this.terminalAdmissions.values()].filter((item) => item.runId === runId), canonicalDelivery: [...this.canonicalDeliveries.values()].find((item) => item.runId === runId) || null }); }

  exportPersistentStateV1(): PersistentConversationStoreStateV1 { return clone({ version: RUN_TOOL_CATALOG_BINDING_V1.storeVersion, threads: [...this.threads.values()], runs: [...this.runs.values()], turns: [...this.turns.values()], events: [...this.events.entries()], checkpoints: [...this.checkpoints.values()], requestReservations: [...this.requestReservations.entries()], resumeReservations: [...this.resumeReservations.entries()], failureOccurrences: [...this.failureOccurrences.entries()], assistantToolBatchReservations: [...this.assistantToolBatchReservations.entries()], toolReservations: [...this.toolReservations.entries()], leases: [...this.leases.entries()], counters: this.counters, runGoalBindings: [...this.runGoalBindings.values()], terminalAdmissions: [...this.terminalAdmissions.values()], canonicalDeliveries: [...this.canonicalDeliveries.values()], runFingerprints: [...this.runFingerprints.values()], migrations: this.migrations, preGovernanceRunIds: [...this.preGovernanceRunIds], migrationRequiredRunIds: [...this.migrationRequiredRunIds], h1RuntimeAdmissions: [...this.h1RuntimeAdmissions.values()], h1ConsumedGrantNonces: [...this.h1ConsumedGrantNonces.entries()], runToolCatalogBindings: [...this.runToolCatalogBindings.values()], catalogCompatibilityOnlyRunIds: [...this.catalogCompatibilityOnlyRunIds], catalogMigrations: this.catalogMigrations }); }
  private restorePersistentStateV1(state: PersistentConversationStoreStateV1) {
    if (
      state === null ||
      typeof state !== "object" ||
      Array.isArray(state) ||
      Object.getPrototypeOf(state) !== Object.prototype
    ) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Conversation Store state must be a plain object."
      );
    }
    if (state.version !== "landing-page-conversation-store-state-v1" && state.version !== "landing-page-conversation-store-state-v2" && state.version !== "landing-page-conversation-store-state-v3" && state.version !== RUN_TOOL_CATALOG_BINDING_V1.storeVersion) throw new ConversationStoreErrorV1("store_state_version_invalid", "Conversation Store state version is invalid.");
    const baseStateKeys = [
      "version",
      "threads",
      "runs",
      "turns",
      "events",
      "checkpoints",
      "requestReservations",
      "resumeReservations",
      "failureOccurrences",
      "assistantToolBatchReservations",
      "toolReservations",
      "leases",
      "counters",
    ] as const;
    const governanceStateKeys = [
      "runGoalBindings",
      "terminalAdmissions",
      "canonicalDeliveries",
      "runFingerprints",
      "migrations",
      "preGovernanceRunIds",
      "migrationRequiredRunIds",
    ] as const;
    const h1StateKeys = [
      "h1RuntimeAdmissions",
      "h1ConsumedGrantNonces",
    ] as const;
    const catalogStateKeys = [
      "runToolCatalogBindings",
      "catalogCompatibilityOnlyRunIds",
      "catalogMigrations",
    ] as const;
    const allowedStateKeys = new Set<string>([
      ...baseStateKeys,
      ...(state.version === "landing-page-conversation-store-state-v1"
        ? []
        : governanceStateKeys),
      ...(state.version === "landing-page-conversation-store-state-v1" ||
      state.version === "landing-page-conversation-store-state-v2"
        ? []
        : h1StateKeys),
      ...(state.version === RUN_TOOL_CATALOG_BINDING_V1.storeVersion
        ? catalogStateKeys
        : []),
    ]);
    if (
      Object.keys(state).some((key) => !allowedStateKeys.has(key)) ||
      [...allowedStateKeys].some((key) => !Object.hasOwn(state, key))
    ) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Conversation Store state fields differ from its exact versioned contract."
      );
    }
    const legacyGovernance = state.version === "landing-page-conversation-store-state-v1";
    const legacyH1 =
      state.version === "landing-page-conversation-store-state-v1" ||
      state.version === "landing-page-conversation-store-state-v2";
    const legacyCatalog = state.version !== RUN_TOOL_CATALOG_BINDING_V1.storeVersion;
    if (legacyGovernance && [state.runGoalBindings, state.terminalAdmissions, state.canonicalDeliveries, state.runFingerprints, state.migrations, state.preGovernanceRunIds, state.migrationRequiredRunIds].some((value) => value !== undefined)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "V1 state cannot carry V2 governance facts.");
    if (!legacyGovernance && (!Array.isArray(state.runGoalBindings) || !Array.isArray(state.terminalAdmissions) || !Array.isArray(state.canonicalDeliveries) || !Array.isArray(state.runFingerprints) || !Array.isArray(state.migrations) || !Array.isArray(state.preGovernanceRunIds) || !Array.isArray(state.migrationRequiredRunIds))) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "V2 governance fact arrays are required.");
    if (legacyH1 && [state.h1RuntimeAdmissions, state.h1ConsumedGrantNonces].some((value) => value !== undefined)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "Pre-V3 state cannot carry H1 runtime authority facts.");
    if (!legacyH1 && (!Array.isArray(state.h1RuntimeAdmissions) || !Array.isArray(state.h1ConsumedGrantNonces))) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "V3+ H1 runtime authority arrays are required.");
    if (legacyCatalog && [state.runToolCatalogBindings, state.catalogCompatibilityOnlyRunIds, state.catalogMigrations].some((value) => value !== undefined)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "Pre-V4 state cannot carry R1 Tool Catalog binding facts.");
    if (!legacyCatalog && (!Array.isArray(state.runToolCatalogBindings) || !Array.isArray(state.catalogCompatibilityOnlyRunIds) || !Array.isArray(state.catalogMigrations))) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "V4 Tool Catalog binding arrays are required.");
    const replace = <T>(target: Map<string, T>, entries: readonly (readonly [string, T])[]) => { target.clear(); for (const [key, value] of entries) target.set(key, clone(value)); };
    state.threads.forEach(decodeConversationThreadV1); const normalizedRuns = state.runs.map(decodeAgentRunV1); state.turns.forEach(decodeAgentTurnV1); state.checkpoints.forEach(decodeRunRecoveryCheckpointV1);
    const uniqueFacts = <T>(items: readonly T[], keyOf: (item: T) => string, label: string) => {
      const result = new Map<string, T>();
      for (const item of items) {
        const key = keyOf(item);
        if (result.has(key)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", `Persisted ${label} identity is duplicated.`);
        result.set(key, item);
      }
      return result;
    };
    const threadsById = uniqueFacts(state.threads, (item) => item.threadId, "Thread");
    const runsById = uniqueFacts(normalizedRuns, (item) => item.runId, "Run");
    const turnsById = uniqueFacts(state.turns, (item) => item.turnId, "Turn");
    const r2FinalDeliveryClosures =
      this.controls.r2FinalDeliveryClosures || [];
    const r2FinalDeliveryClosureByRunId = uniqueFacts(
      r2FinalDeliveryClosures,
      (item) => requiredIdV1(item.runId, "r2FinalDeliveryClosure.runId"),
      "R2 final delivery closure"
    );
    for (const closure of r2FinalDeliveryClosures) {
      if (!runsById.has(closure.runId)) {
        throw new ConversationStoreErrorV1(
          "r2_final_delivery_closure_invalid",
          "R2 final delivery closure is orphaned from its Run."
        );
      }
      requiredIdV1(closure.threadId, "r2FinalDeliveryClosure.threadId");
      requiredIdV1(closure.turnId, "r2FinalDeliveryClosure.turnId");
      requiredIdV1(
        closure.assistantMessageId,
        "r2FinalDeliveryClosure.assistantMessageId"
      );
      requiredHashV1(
        closure.assistantMessageHash,
        "r2FinalDeliveryClosure.assistantMessageHash"
      );
      requiredHashV1(
        closure.assistantContentHash,
        "r2FinalDeliveryClosure.assistantContentHash"
      );
      requiredTimestampV1(
        closure.deliveredAt,
        "r2FinalDeliveryClosure.deliveredAt"
      );
      requiredTimestampV1(
        closure.completedAt,
        "r2FinalDeliveryClosure.completedAt"
      );
      if (
        !Number.isSafeInteger(closure.preDeliveryRunRevision) ||
        closure.preDeliveryRunRevision < 1 ||
        closure.completedRunRevision !== closure.preDeliveryRunRevision + 1 ||
        !Number.isSafeInteger(closure.assistantMessageSequence) ||
        closure.assistantMessageSequence < 2 ||
        !Number.isSafeInteger(closure.threadMessageCountAtDelivery) ||
        closure.threadMessageCountAtDelivery !==
          closure.assistantMessageSequence ||
        !Number.isSafeInteger(closure.assistantContentBytes) ||
        closure.assistantContentBytes < 1 ||
        closure.deliveredAt !== closure.completedAt
      ) {
        throw new ConversationStoreErrorV1(
          "r2_final_delivery_closure_invalid",
          "R2 final delivery closure has an invalid state tuple."
        );
      }
    }
    const bindings = (state.runGoalBindings || []).map(decodeRunGoalBindingV1);
    const admissions = (state.terminalAdmissions || []).map(decodeTerminalAdmissionRecordV1);
    const deliveries = (state.canonicalDeliveries || []).map(decodeCanonicalDeliveryV1);
    const fingerprints = (state.runFingerprints || []).map(decodeRunFingerprintRecordV1);
    if (
      legacyH1 &&
      fingerprints.some(
        (fingerprint) =>
          fingerprint.runtimeBuildRef === H1_RUNTIME_AUTHORITY_V1.runtimeBuildRef
      )
    ) {
      throw new ConversationStoreErrorV1(
        "store_state_downgrade_forbidden",
        "A pre-V3 state cannot carry an immutable H1 Runtime fingerprint."
      );
    }
    const migrations = (state.migrations || []).map(decodeConversationStoreMigrationRecordV2);
    const catalogBindings = legacyCatalog
      ? []
      : (state.runToolCatalogBindings || []).map(
          decodeRunToolCatalogBindingV1
        );
    const catalogBindingByRunId = uniqueFacts(
      catalogBindings,
      (item) => item.runId,
      "Run Tool Catalog binding"
    );
    const catalogBindingIds = new Set<string>();
    for (const binding of catalogBindings) {
      if (!runsById.has(binding.runId) || catalogBindingIds.has(binding.bindingId)) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Run Tool Catalog binding is orphaned or duplicated."
        );
      }
      catalogBindingIds.add(binding.bindingId);
      if (
        binding.catalogProfileId !==
        RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
      ) {
        this.catalogRegistry.resolveExact(binding);
      }
    }
    for (const binding of catalogBindings) {
      this.assertCatalogEpochClosureV1(binding, catalogBindings);
    }
    const catalogCompatibilityOnlyRunIds = legacyCatalog
      ? [...runsById.keys()]
      : (state.catalogCompatibilityOnlyRunIds || []).map((runId, index) =>
          requiredIdV1(runId, `catalogCompatibilityOnlyRunIds[${index}]`)
        );
    if (
      new Set(catalogCompatibilityOnlyRunIds).size !==
        catalogCompatibilityOnlyRunIds.length ||
      catalogCompatibilityOnlyRunIds.some(
        (runId) => !runsById.has(runId) || catalogBindingByRunId.has(runId)
      ) ||
      [...runsById.keys()].some(
        (runId) =>
          !catalogBindingByRunId.has(runId) &&
          !catalogCompatibilityOnlyRunIds.includes(runId)
      )
    ) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Every persisted Run must be exactly current Catalog-bound or pre-R1 compatibility-only."
      );
    }
    const catalogMigrations = legacyCatalog
      ? [
          createStoreCatalogMigrationRecordV1({
            sourceVersion: state.version,
            sourcePayloadHash: hashCanonicalJsonV1(state),
            migratedAt: this.now(),
          }),
        ]
      : (state.catalogMigrations || []).map(
          decodeStoreCatalogMigrationRecordV1
        );
    if (
      !legacyCatalog &&
      (catalogMigrations.length > 1 ||
        (catalogCompatibilityOnlyRunIds.length > 0 &&
          catalogMigrations.length === 0))
    ) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Compatibility-only Runs must be closed by a persisted Store Catalog migration."
      );
    }
    const preGovernanceRunIds = legacyGovernance ? normalizedRuns.map((run) => run.runId) : (state.preGovernanceRunIds || []).map((runId, index) => requiredIdV1(runId, `preGovernanceRunIds[${index}]`));
    const migrationRequiredRunIds = legacyGovernance ? normalizedRuns.filter((run) => ["queued", "running", "recovering", "stopped_recoverable", "recoverable_failed"].includes(run.status)).map((run) => run.runId) : (state.migrationRequiredRunIds || []).map((runId, index) => requiredIdV1(runId, `migrationRequiredRunIds[${index}]`));
    if (new Set(preGovernanceRunIds).size !== preGovernanceRunIds.length || new Set(migrationRequiredRunIds).size !== migrationRequiredRunIds.length || preGovernanceRunIds.some((runId) => !runsById.has(runId)) || migrationRequiredRunIds.some((runId) => !runsById.has(runId) || !preGovernanceRunIds.includes(runId))) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "Persisted governance Run classification is invalid.");
    const bindingById = uniqueFacts(bindings, (item) => item.runGoalBindingId, "Run Goal binding");
    const admissionById = uniqueFacts(admissions, (item) => item.terminalAdmissionId, "Terminal admission");
    const deliveryById = uniqueFacts(deliveries, (item) => item.canonicalDeliveryId, "Canonical delivery");
    const fingerprintById = uniqueFacts(fingerprints, (item) => item.runFingerprintId, "Run fingerprint");
    const fingerprintByRunId = uniqueFacts(
      fingerprints,
      (item) => item.runId,
      "Run fingerprint Run identity"
    );
    for (const fingerprint of fingerprints) {
      const catalogBinding = catalogBindingByRunId.get(fingerprint.runId);
      if (catalogBinding) {
        this.assertRunFingerprintCatalogClosureV1(fingerprint, catalogBinding);
      } else if (!catalogCompatibilityOnlyRunIds.includes(fingerprint.runId)) {
        throw new ConversationStoreErrorV1(
          "run_fingerprint_catalog_binding_mismatch",
          "Persisted Run fingerprint has no Catalog binding or historical compatibility classification."
        );
      }
    }
    const onePerRun = <T>(items: readonly T[], runIdOf: (item: T) => string, label: string) => { const seen = new Set<string>(); for (const item of items) { const runId = runIdOf(item); if (seen.has(runId)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", `Persisted ${label} is duplicated for a Run.`); seen.add(runId); } };
    onePerRun(bindings, (item) => item.runId, "Run Goal binding"); onePerRun(deliveries, (item) => item.runId, "Canonical delivery"); onePerRun(fingerprints, (item) => item.runId, "Run fingerprint");
    const terminalCalls = new Set<string>(); for (const admission of admissions) { const key = `${admission.runId}\u0000${admission.terminalToolCallId}`; if (terminalCalls.has(key)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "Persisted Terminal admission is duplicated for a call."); terminalCalls.add(key); }
    for (const binding of bindings) if (!runsById.has(binding.runId) || runsById.get(binding.runId)?.threadId !== binding.source.threadId) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Goal binding is orphaned.");
    for (const fingerprint of fingerprints) if (!runsById.has(fingerprint.runId)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Run fingerprint is orphaned.");
    for (const admission of admissions) { const binding = bindingById.get(admission.runGoalBindingId); const fingerprint = fingerprintById.get(admission.runFingerprintId); if (!runsById.has(admission.runId) || binding?.runId !== admission.runId || binding.goalHash !== admission.goalHash || fingerprint?.runId !== admission.runId || fingerprint.fingerprintHash !== admission.runFingerprintHash || fingerprint.toolDescriptorFingerprint !== admission.toolDescriptorFingerprint) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Terminal admission closure is invalid."); }
    for (const delivery of deliveries) { const fingerprint = fingerprintById.get(delivery.runFingerprintId); if (!runsById.has(delivery.runId) || fingerprint?.runId !== delivery.runId || fingerprint.fingerprintHash !== delivery.runFingerprintHash) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Canonical delivery fingerprint closure is invalid."); if (delivery.kind === "admitted_terminal_proposal") { const binding = delivery.runGoalBindingId ? bindingById.get(delivery.runGoalBindingId) : null; const admission = delivery.terminalAdmissionId ? admissionById.get(delivery.terminalAdmissionId) : null; if (!binding || !admission || binding.runId !== delivery.runId || admission.runId !== delivery.runId || admission.decision !== "admitted" || admission.runGoalBindingId !== binding.runGoalBindingId || admission.runFingerprintId !== delivery.runFingerprintId) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Canonical terminal delivery closure is invalid."); } }
    for (const run of normalizedRuns) {
      const historical = preGovernanceRunIds.includes(run.runId);
      const fingerprint = fingerprints.find((item) => item.runId === run.runId);
      const delivery = deliveries.find((item) => item.runId === run.runId);
      const r2FinalDelivery = r2FinalDeliveryClosureByRunId.get(run.runId);
      const reservation = state.requestReservations.find(
        ([, item]) => item.runId === run.runId
      )?.[1];
      const e1DeferredStopBeforeExecution =
        reservation?.runtimeAuthorityKind ===
          "e1-local-selection-read-admission-v1" &&
        run.status === "stopped_recoverable" &&
        run.errorCode === "run_stopped" &&
        run.runRevision === 2 &&
        run.recoveryCheckpointId !== null;
      if (
        !historical &&
        [
          "running",
          "recovering",
          "stopped_recoverable",
          "recoverable_failed",
          "completed",
        ].includes(run.status) &&
        !fingerprint &&
        !e1DeferredStopBeforeExecution
      ) throw new ConversationStoreErrorV1("governance_closure_invalid", "Current persisted non-queued Run requires an immutable fingerprint.");
      if (
        !historical &&
        run.status === "completed" &&
        !delivery &&
        !r2FinalDelivery
      ) throw new ConversationStoreErrorV1("governance_closure_invalid", "Current persisted completed Run requires a Canonical or verified R2 final delivery.");
      if (delivery && r2FinalDelivery) {
        throw new ConversationStoreErrorV1(
          "r2_final_delivery_closure_invalid",
          "A Run cannot own both generic Canonical Delivery and R2 model-final delivery."
        );
      }
      if (r2FinalDelivery) {
        const thread = threadsById.get(run.threadId);
        const lastMessage = thread?.messages.at(-1);
        const deliveryTailMessage = thread?.messages.at(
          r2FinalDelivery.threadMessageCountAtDelivery - 1
        );
        const turn = turnsById.get(run.turnId);
        const assistants = thread?.messages.filter(
          (message) =>
            message.runId === run.runId &&
            message.role === "assistant" &&
            message.toolCalls.length === 0
        ) || [];
        const assistant = assistants[0];
        if (
          historical ||
          run.status !== "completed" ||
          run.finalOutput === null ||
          run.deliveryProvenance !== null ||
          run.threadId !== r2FinalDelivery.threadId ||
          run.turnId !== r2FinalDelivery.turnId ||
          run.runRevision !== r2FinalDelivery.completedRunRevision ||
          run.updatedAt !== r2FinalDelivery.completedAt ||
          !turn ||
          turn.deliveredAt !== r2FinalDelivery.deliveredAt ||
          assistants.length !== 1 ||
          !assistant ||
          assistant.messageId !== r2FinalDelivery.assistantMessageId ||
          assistant.sequence !== r2FinalDelivery.assistantMessageSequence ||
          assistant.toolCallId !== null ||
          assistant.toolCalls.length !== 0 ||
          assistant.createdAt !== r2FinalDelivery.completedAt ||
          hashCanonicalJsonV1(assistant) !==
            r2FinalDelivery.assistantMessageHash ||
          hashUtf8V1(assistant.content) !==
            r2FinalDelivery.assistantContentHash ||
          new TextEncoder().encode(assistant.content).byteLength !==
            r2FinalDelivery.assistantContentBytes ||
          assistant.content !== run.finalOutput ||
          !thread ||
          !lastMessage ||
          thread.messages.length <
            r2FinalDelivery.threadMessageCountAtDelivery ||
          deliveryTailMessage?.messageId !== assistant.messageId ||
          deliveryTailMessage?.sequence !==
            r2FinalDelivery.threadMessageCountAtDelivery ||
          thread.updatedAt !== lastMessage.createdAt ||
          assistant.sequence > lastMessage.sequence
        ) {
          throw new ConversationStoreErrorV1(
            "r2_final_delivery_closure_invalid",
            "Persisted R2 model-final delivery differs from its exact Run, Turn, Thread or assistant projection."
          );
        }
        continue;
      }
      if (!delivery) continue;
      if (historical || run.status !== "completed" || run.finalOutput === null || delivery.finalOutputHash !== hashUtf8V1(run.finalOutput)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Canonical Delivery does not close a current completed Run output.");
      const thread = threadsById.get(run.threadId);
      if (!thread) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Canonical Delivery Run Thread is missing.");
      const message = thread?.messages.find((item) => item.messageId === delivery.messageId);
      if (!message || message.runId !== run.runId || message.role !== "assistant" || message.toolCalls.length !== 0 || message.content !== run.finalOutput) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Canonical Delivery does not close its final Assistant Message.");
      const evidence = delivery.evidenceReceiptCallIds.map((callId) => run.receipts.find((receipt) => receipt.callId === callId));
      if (evidence.some((receipt) => !receipt)) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted Canonical Delivery references missing Receipt evidence.");
      if (delivery.kind === "admitted_terminal_proposal") {
        const admission = delivery.terminalAdmissionId ? admissionById.get(delivery.terminalAdmissionId) : null;
        const binding = delivery.runGoalBindingId ? bindingById.get(delivery.runGoalBindingId) : null;
        const fingerprint = fingerprintById.get(delivery.runFingerprintId);
        const terminalReceipt = admission ? run.receipts.find((receipt) => receipt.callId === admission.terminalToolCallId) : null;
        const terminalCall = admission ? thread.messages.flatMap((item) => item.runId === run.runId && item.role === "assistant" ? item.toolCalls : []).find((call) => call.callId === admission.terminalToolCallId) : null;
        const descriptorFacts = fingerprint?.terminalDescriptorFacts;
        const recomputed = admission && terminalReceipt && terminalCall && descriptorFacts
          ? admitTerminalProposalV1({
              argumentsJson: terminalCall.argumentsJson,
              terminalReceipt,
              receipts: run.receipts,
              descriptors: descriptorFacts,
              triggerMessageContent: thread.messages.find(
                (message) => message.messageId === run.triggerMessageId
              )?.content,
            })
          : null;
        if (
          !admission ||
          !binding ||
          !fingerprint ||
          !descriptorFacts ||
          !terminalReceipt ||
          terminalReceipt.toolId !== "submit_turn_outcome" ||
          terminalReceipt.status !== "completed" ||
          !terminalCall ||
          terminalCall.toolId !== "submit_turn_outcome" ||
          toolArgumentsHashV1(terminalCall.argumentsJson) !== admission.terminalArgumentsHash ||
          terminalReceipt.argumentsHash !== admission.terminalArgumentsHash ||
          hashCanonicalJsonV1(delivery.evidenceReceiptCallIds) !== hashCanonicalJsonV1(admission.evidenceReceiptCallIds) ||
          !recomputed?.accepted ||
          recomputed.canonicalOutput !== run.finalOutput ||
          recomputed.proposal.proposalId !== admission.terminalProposalId ||
          recomputed.proposal.proposalId !== binding.boundBy.terminalProposalId ||
          recomputed.outcome !== admission.proposedOutcome ||
          hashCanonicalJsonV1(recomputed.goal) !== binding.goalHash ||
          recomputed.claimGateAssessmentHash !== admission.claimGateAssessmentHash ||
          hashCanonicalJsonV1(recomputed.evidenceReceiptCallIds) !== hashCanonicalJsonV1(admission.evidenceReceiptCallIds) ||
          delivery.deliveryTemplateId !== TERMINAL_DELIVERY_TEMPLATE_BY_OUTCOME_V1[recomputed.proposal.outcome]
        ) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted admitted delivery differs from the Host-recomputed terminal semantics.");
      } else if (delivery.kind === "capability_unavailable_degraded") {
        const receipt = evidence[0];
        const fingerprint = fingerprintById.get(delivery.runFingerprintId);
        if (delivery.deliveryTemplateId !== "capability-unavailable-degraded-v1" || evidence.length !== 1 || !receipt || !fingerprint?.toolDescriptorIdentities || !isUnavailableCapabilityReceiptV1(receipt, fingerprint.toolDescriptorIdentities) || run.finalOutput !== CANONICAL_CAPABILITY_DEGRADED_DELIVERY_V1) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted capability-degraded delivery is not closed by a registered unavailable Receipt.");
      } else {
        const first = evidence[0];
        if (delivery.deliveryTemplateId !== "repeated-tool-failure-degraded-v1" || evidence.length < 2 || !first || first.status === "completed" || first.status === "unavailable" || evidence.some((receipt) => !receipt || receipt.toolId !== first.toolId || receipt.status !== first.status) || run.finalOutput !== CANONICAL_REPEATED_TOOL_FAILURE_DELIVERY_V1) throw new ConversationStoreErrorV1("governance_closure_invalid", "Persisted repeated-failure delivery is not closed by one failure family.");
      }
    }
    const requestIds = new Set<string>();
    const envelopeIds = new Set<string>();
    const reservationRunIds = new Set<string>();
    const normalizedRequestReservations: Array<
      readonly [string, RequestReservationV1]
    > = [];
    for (const entry of state.requestReservations) {
      if (!Array.isArray(entry) || entry.length !== 2) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation entry is malformed."
        );
      }
      const [requestId, reservation] = entry;
      if (
        reservation === null ||
        typeof reservation !== "object" ||
        Array.isArray(reservation) ||
        Object.getPrototypeOf(reservation) !== Object.prototype
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation is malformed."
        );
      }
      const allowedKeys = new Set([
        "inputHash",
        "inputHashVersion",
        "envelopeId",
        "envelopeHash",
        "requestedThreadId",
        "threadId",
        "turnId",
        "runId",
        "catalogBindingId",
        "canvasObservationBindingHash",
        "runtimeAuthorityKind",
      ]);
      const keys = Object.keys(reservation);
      const reservationRunId = String(reservation.runId);
      const expectedCatalogBinding = catalogBindingByRunId.get(reservationRunId);
      const isCompatibilityOnly =
        catalogCompatibilityOnlyRunIds.includes(reservationRunId);
      if (
        keys.some((key) => !allowedKeys.has(key)) ||
        !["inputHash", "threadId", "turnId", "runId"].every((key) =>
          Object.hasOwn(reservation, key)
        ) ||
        (legacyH1 && Object.hasOwn(reservation, "runtimeAuthorityKind")) ||
        (!legacyH1 && !Object.hasOwn(reservation, "runtimeAuthorityKind")) ||
        (legacyCatalog && Object.hasOwn(reservation, "catalogBindingId")) ||
        (legacyCatalog &&
          (Object.hasOwn(reservation, "inputHashVersion") ||
            Object.hasOwn(reservation, "requestedThreadId") ||
            Object.hasOwn(reservation, "envelopeId"))) ||
        (!legacyCatalog &&
          (!Object.hasOwn(reservation, "inputHashVersion") ||
            !Object.hasOwn(reservation, "requestedThreadId"))) ||
        (!legacyCatalog &&
          reservation.inputHashVersion === "legacy-v1" &&
          Object.hasOwn(reservation, "envelopeId")) ||
        (!legacyCatalog &&
          reservation.inputHashVersion === "submit-envelope-v1" &&
          (!Object.hasOwn(reservation, "envelopeId") ||
            !Object.hasOwn(reservation, "envelopeHash"))) ||
        (!legacyCatalog &&
          reservation.inputHashVersion !== "submit-envelope-v1" &&
          Object.hasOwn(reservation, "envelopeHash")) ||
        (!legacyCatalog &&
          expectedCatalogBinding !== undefined &&
          !Object.hasOwn(reservation, "catalogBindingId")) ||
        (!legacyCatalog &&
          isCompatibilityOnly &&
          Object.hasOwn(reservation, "catalogBindingId"))
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation fields are malformed."
        );
      }
      try {
        requiredIdV1(requestId, "requestReservation.requestId");
        requiredHashV1(reservation.inputHash, "requestReservation.inputHash");
        requiredIdV1(reservation.threadId, "requestReservation.threadId");
        requiredIdV1(reservation.turnId, "requestReservation.turnId");
        requiredIdV1(reservation.runId, "requestReservation.runId");
        if (
          reservation.inputHashVersion !== undefined &&
          reservation.inputHashVersion !== "legacy-v1" &&
          reservation.inputHashVersion !== "catalog-v1" &&
          reservation.inputHashVersion !== "submit-envelope-v1"
        ) throw new Error("request input hash version invalid");
        if (reservation.envelopeId !== undefined) {
          requiredIdV1(
            reservation.envelopeId,
            "requestReservation.envelopeId"
          );
        }
        if (reservation.envelopeHash !== undefined) {
          requiredHashV1(
            reservation.envelopeHash,
            "requestReservation.envelopeHash"
          );
        }
        if (reservation.requestedThreadId !== undefined && reservation.requestedThreadId !== null) {
          requiredIdV1(
            reservation.requestedThreadId,
            "requestReservation.requestedThreadId"
          );
        }
        if (reservation.catalogBindingId !== undefined) {
          requiredIdV1(
            reservation.catalogBindingId,
            "requestReservation.catalogBindingId"
          );
        }
        if (reservation.canvasObservationBindingHash !== undefined) {
          requiredHashV1(
            reservation.canvasObservationBindingHash,
            "requestReservation.canvasObservationBindingHash"
          );
        }
        if (
          !legacyH1 &&
          reservation.runtimeAuthorityKind !== "legacy" &&
          reservation.runtimeAuthorityKind !== "h1-runtime-admission-v1" &&
          reservation.runtimeAuthorityKind !==
            "e1-local-selection-read-admission-v1" &&
          reservation.runtimeAuthorityKind !==
            R2_SELECTION_C0_B3_AUTHORITY_V1.runtimeAuthorityKind
        ) {
          throw new Error("runtime authority kind invalid");
        }
      } catch {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation identity or hash is invalid."
        );
      }
      if (requestIds.has(requestId)) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation identity is duplicated."
        );
      }
      if (
        reservation.envelopeId !== undefined &&
        envelopeIds.has(reservation.envelopeId)
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted submission envelope identity is duplicated."
        );
      }
      if (reservationRunIds.has(reservation.runId)) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Run owns more than one Request reservation."
        );
      }
      requestIds.add(requestId);
      if (reservation.envelopeId !== undefined) {
        envelopeIds.add(reservation.envelopeId);
      }
      reservationRunIds.add(reservation.runId);
      if (
        reservation.catalogBindingId !== undefined &&
        (!expectedCatalogBinding ||
          reservation.catalogBindingId !== expectedCatalogBinding.bindingId)
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation Tool Catalog binding differs from its Run."
        );
      }
      if (expectedCatalogBinding && !isCompatibilityOnly) {
        this.assertRuntimeAuthorityCatalogProfileV1(
          legacyH1 ? "legacy" : reservation.runtimeAuthorityKind!,
          expectedCatalogBinding
        );
      }
      const run = runsById.get(reservation.runId);
      const turn = turnsById.get(reservation.turnId);
      const thread = threadsById.get(reservation.threadId);
      if (
        !run ||
        !turn ||
        !thread ||
        run.turnId !== reservation.turnId ||
        run.threadId !== reservation.threadId ||
        turn.runId !== reservation.runId ||
        turn.threadId !== reservation.threadId ||
        run.workspaceId !== turn.workspaceId ||
        run.sessionId !== turn.sessionId ||
        run.documentId !== turn.documentId ||
        run.workspaceId !== thread.workspaceId ||
        run.sessionId !== thread.sessionId ||
        run.documentId !== thread.documentId
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation is detached from its Run, Turn, or Thread facts."
        );
      }
      const triggerMessage = thread.messages.find(
        (message) => message.messageId === run.triggerMessageId
      );
      if (
        !triggerMessage ||
        triggerMessage.role !== "user" ||
        triggerMessage.runId !== run.runId ||
        triggerMessage.turnId !== turn.turnId
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted Request reservation has no exact trigger Message fact."
        );
      }
      if (
        reservation.requestedThreadId !== undefined &&
        reservation.requestedThreadId !== null &&
        reservation.requestedThreadId !== reservation.threadId
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "Persisted requested Thread identity differs from the exact reserved Thread."
        );
      }
      if (
        reservation.requestedThreadId === null &&
        (triggerMessage.sequence !== 1 ||
          thread.messages[0]?.messageId !== triggerMessage.messageId ||
          thread.createdAt !== triggerMessage.createdAt)
      ) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "A generated Thread reservation must close over its first trigger Message."
        );
      }
      const legacyHashForRequestedThreadV1 = (
        requestedThreadId: string | null
      ) => hashCanonicalJsonV1({
        requestId,
        workspaceId: run.workspaceId,
        sessionId: run.sessionId,
        documentId: run.documentId,
        threadId: requestedThreadId,
        message: triggerMessage.content,
        ...(reservation.canvasObservationBindingHash
          ? { canvasObservationBindingHash: reservation.canvasObservationBindingHash }
          : {}),
      });
      let inputHashVersion = reservation.inputHashVersion;
      let requestedThreadId = reservation.requestedThreadId;
      if (legacyCatalog) {
        const candidates = [null, run.threadId] as const;
        const matches = candidates.filter(
          (candidate) =>
            legacyHashForRequestedThreadV1(candidate) === reservation.inputHash
        );
        if (matches.length !== 1) {
          throw new ConversationStoreErrorV1(
            "conversation_store_state_invalid",
            "Pre-V4 Request reservation hash cannot be recomputed from its Run facts."
          );
        }
        inputHashVersion = "legacy-v1";
        requestedThreadId = matches[0]!;
      } else {
        if (
          inputHashVersion === "legacy-v1" &&
          !isCompatibilityOnly
        ) {
          throw new ConversationStoreErrorV1(
            "conversation_store_state_invalid",
            "Only compatibility history may retain the legacy Request hash contract."
          );
        }
        const expectedHash = inputHashVersion === "legacy-v1"
          ? legacyHashForRequestedThreadV1(requestedThreadId ?? null)
          : hashCanonicalJsonV1({
              requestId,
              ...(reservation.envelopeId !== undefined
                ? { envelopeId: reservation.envelopeId }
                : {}),
              workspaceId: run.workspaceId,
              sessionId: run.sessionId,
              documentId: run.documentId,
              threadId: requestedThreadId ?? null,
              message: triggerMessage.content,
              catalogBindingSeed: expectedCatalogBinding
                ? {
                    catalogProfileId: expectedCatalogBinding.catalogProfileId,
                    catalogEpoch: expectedCatalogBinding.catalogEpoch,
                    catalogHash: expectedCatalogBinding.catalogHash,
                    toolDescriptorFingerprint:
                      expectedCatalogBinding.toolDescriptorFingerprint,
                    eventEnvelopeVersion:
                      expectedCatalogBinding.eventEnvelopeVersion,
                  }
                : undefined,
              ...(reservation.canvasObservationBindingHash
                ? { canvasObservationBindingHash: reservation.canvasObservationBindingHash }
                : {}),
              ...(reservation.envelopeHash
                ? { envelopeHash: reservation.envelopeHash }
                : {}),
            });
        if (reservation.inputHash !== expectedHash) {
          throw new ConversationStoreErrorV1(
            "conversation_store_state_invalid",
            "Persisted Request reservation hash differs from its Run, Message, and Catalog facts."
          );
        }
      }
      normalizedRequestReservations.push([
        requestId,
        {
          ...reservation,
          inputHashVersion: inputHashVersion!,
          requestedThreadId: requestedThreadId ?? null,
          runtimeAuthorityKind: legacyH1
            ? "legacy"
            : reservation.runtimeAuthorityKind!,
        },
      ]);
    }
    if (
      reservationRunIds.size !== runsById.size ||
      [...runsById.keys()].some((runId) => !reservationRunIds.has(runId))
    ) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Every persisted Run must have exactly one Request reservation."
      );
    }
    const authorityKindByRunId = new Map(
      normalizedRequestReservations.map(([, reservation]) => [
        reservation.runId,
        reservation.runtimeAuthorityKind,
      ])
    );
    for (const thread of state.threads) {
      const threadKinds = new Set(
        normalizedRuns
          .filter((run) => run.threadId === thread.threadId)
          .map((run) => authorityKindByRunId.get(run.runId))
      );
      if (threadKinds.size !== 1 || threadKinds.has(undefined)) {
        throw new ConversationStoreErrorV1(
          "conversation_store_state_invalid",
          "A persisted Thread cannot mix legacy and H1 Runtime ownership."
        );
      }
    }
    const eventRunIds = new Set<string>();
    state.events.forEach(([streamRunId, events]) => {
      if (eventRunIds.has(streamRunId)) throw new ConversationStoreErrorV1("event_chain_invalid", "Persisted Event stream identity is duplicated.");
      eventRunIds.add(streamRunId);
      const run = runsById.get(streamRunId);
      if (!run || events.length === 0) throw new ConversationStoreErrorV1("event_chain_invalid", "Persisted Event stream is orphaned or empty.");
      const turn = turnsById.get(run.turnId);
      const thread = threadsById.get(run.threadId);
      if (!turn || !thread || turn.runId !== run.runId || turn.threadId !== run.threadId || turn.workspaceId !== run.workspaceId || turn.sessionId !== run.sessionId || turn.documentId !== run.documentId || thread.workspaceId !== run.workspaceId || thread.sessionId !== run.sessionId || thread.documentId !== run.documentId) throw new ConversationStoreErrorV1("event_chain_invalid", "Persisted Run, Turn, and Thread identities differ.");
      const decoded = validatePublicRuntimeEventChainV1(events);
      if (decoded.some((event) => event.runId !== streamRunId || event.workspaceId !== run.workspaceId || event.sessionId !== run.sessionId || event.threadId !== run.threadId || event.turnId !== run.turnId)) throw new ConversationStoreErrorV1("event_chain_invalid", "Persisted Event stream is bound to different Run facts.");
      const catalogBinding = catalogBindingByRunId.get(streamRunId);
      if (
        catalogBinding &&
        decoded.some(
          (event) =>
            event.contractVersion !== catalogBinding.eventEnvelopeVersion
        )
      ) {
        throw new ConversationStoreErrorV1(
          "event_chain_invalid",
          "Persisted Event stream differs from its immutable Run Catalog envelope version."
        );
      }
    });
    if (eventRunIds.size !== runsById.size || [...runsById.keys()].some((runId) => !eventRunIds.has(runId))) throw new ConversationStoreErrorV1("event_chain_invalid", "Every persisted Run must have exactly one Event stream.");
    const assistantToolBatchReservations = (state.assistantToolBatchReservations || []).filter(([, reservation]) => {
      const legacyReservation = reservation as AssistantToolBatchReservationV1 & { versions?: AssistantToolBatchReservationV1["versions"] };
      if (legacyReservation.versions === undefined) return false;
      if (!Array.isArray(legacyReservation.versions)) throw new ConversationStoreErrorV1("conversation_store_state_invalid", "Assistant Tool batch reservation versions are malformed.");
      return true;
    });
    if (!Array.isArray(state.toolReservations)) {
      throw new ConversationStoreErrorV1(
        "conversation_store_state_invalid",
        "Persisted Tool reservations must be an array."
      );
    }
    const toolReservationKeys = new Set<string>();
    const normalizedToolReservations = state.toolReservations.map(
      (entry, index) => {
        if (!Array.isArray(entry) || entry.length !== 2) {
          throw new ConversationStoreErrorV1(
            "conversation_store_state_invalid",
            `Persisted Tool reservation ${index} is malformed.`
          );
        }
        const [key, reservation] = entry;
        if (
          typeof key !== "string" ||
          !key.includes("\u0000") ||
          reservation === null ||
          typeof reservation !== "object" ||
          Array.isArray(reservation) ||
          Object.getPrototypeOf(reservation) !== Object.prototype ||
          Object.keys(reservation).length !== 4 ||
          !["inputHash", "call", "toolVersion", "receipt"].every((field) =>
            Object.hasOwn(reservation, field)
          )
        ) {
          throw new ConversationStoreErrorV1(
            "conversation_store_state_invalid",
            "Persisted Tool reservation fields are malformed."
          );
        }
        const separator = key.indexOf("\u0000");
        const runId = key.slice(0, separator);
        const callId = key.slice(separator + 1);
        const call = reservation.call;
        try {
          requiredIdV1(runId, "toolReservation.runId");
          requiredIdV1(callId, "toolReservation.callId");
          requiredHashV1(reservation.inputHash, "toolReservation.inputHash");
          requiredIdV1(reservation.toolVersion, "toolReservation.toolVersion");
          if (
            call === null ||
            typeof call !== "object" ||
            Array.isArray(call) ||
            Object.getPrototypeOf(call) !== Object.prototype ||
            Object.keys(call).length !== 3 ||
            !["callId", "toolId", "argumentsJson"].every((field) =>
              Object.hasOwn(call, field)
            )
          ) throw new Error("Tool call shape invalid.");
          requiredIdV1(call.callId, "toolReservation.call.callId");
          requiredIdV1(call.toolId, "toolReservation.call.toolId");
          if (typeof call.argumentsJson !== "string") {
            throw new Error("Tool arguments must be a string.");
          }
        } catch {
          throw new ConversationStoreErrorV1(
            "conversation_store_state_invalid",
            "Persisted Tool reservation identity is invalid."
          );
        }
        const run = runsById.get(runId);
        const thread = run ? threadsById.get(run.threadId) : null;
        const assistantCall = thread?.messages
          .filter(
            (message) => message.runId === runId && message.role === "assistant"
          )
          .flatMap((message) => message.toolCalls)
          .find((candidate) => candidate.callId === callId);
        const expectedInputHash = hashCanonicalJsonV1({
          runId,
          call,
          toolVersion: reservation.toolVersion,
        });
        if (
          toolReservationKeys.has(key) ||
          !run ||
          callId !== call.callId ||
          !assistantCall ||
          hashCanonicalJsonV1(assistantCall) !== hashCanonicalJsonV1(call) ||
          reservation.inputHash !== expectedInputHash
        ) {
          throw new ConversationStoreErrorV1(
            "tool_reservation_source_drift",
            "Persisted Tool reservation differs from its Run and Assistant call source."
          );
        }
        const receipt = reservation.receipt === null
          ? null
          : decodeToolInvocationReceiptV1(reservation.receipt);
        if (
          receipt &&
          (receipt.runId !== runId ||
            receipt.turnId !== run.turnId ||
            receipt.callId !== callId ||
            receipt.toolId !== call.toolId ||
            receipt.toolVersion !== reservation.toolVersion ||
            receipt.argumentsHash !== toolArgumentsHashV1(call.argumentsJson))
        ) {
          throw new ConversationStoreErrorV1(
            "tool_reservation_source_drift",
            "Persisted Tool reservation Receipt differs from its invocation source."
          );
        }
        toolReservationKeys.add(key);
        return [
          key,
          {
            inputHash: reservation.inputHash,
            call: clone(call),
            toolVersion: reservation.toolVersion,
            receipt: receipt ? clone(receipt) : null,
          },
        ] as const;
      }
    );
    for (const run of normalizedRuns) {
      if (catalogCompatibilityOnlyRunIds.includes(run.runId)) continue;
      const catalogBinding = catalogBindingByRunId.get(run.runId);
      if (
        !catalogBinding ||
        catalogBinding.catalogProfileId ===
          RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
      ) continue;
      const events =
        state.events.find(([runId]) => runId === run.runId)?.[1] || [];
      const startedEvents = events.filter(
        (event) => event.category === "tool" && event.state === "tool_started"
      );
      const reservations = normalizedToolReservations.filter(([key]) =>
        key.startsWith(`${run.runId}\u0000`)
      );
      for (const [key, reservation] of reservations) {
        const callId = key.slice(key.indexOf("\u0000") + 1);
        const matches = startedEvents.filter((event) => event.callId === callId);
        if (matches.length !== 1) {
          throw new ConversationStoreErrorV1(
            "runtime_public_lifecycle_invalid",
            "Each current Tool reservation must own exactly one started public lifecycle event."
          );
        }
        try {
          const expected = this.createCatalogStartedPublicToolEventV1(
            catalogBinding,
            run,
            reservation.call,
            reservation.toolVersion
          );
          if (
            hashCanonicalJsonV1(matches[0]!.publicData) !==
            hashCanonicalJsonV1(expected)
          ) throw new Error("Tool started lifecycle drift.");
        } catch {
          throw new ConversationStoreErrorV1(
            "runtime_public_lifecycle_invalid",
            "Persisted Tool started event differs from its exact Run Catalog and invocation source."
          );
        }
      }
      if (
        startedEvents.some(
          (event) =>
            !event.callId ||
            !toolReservationKeys.has(`${run.runId}\u0000${event.callId}`)
        )
      ) {
        throw new ConversationStoreErrorV1(
          "runtime_public_lifecycle_invalid",
          "Persisted Tool started event has no exact invocation reservation source."
        );
      }
    }
    const h1Admissions = legacyH1
      ? []
      : (state.h1RuntimeAdmissions || []).map(decodeH1RuntimeAdmissionRecordV1);
    const h1AdmissionsByRun = uniqueFacts(
      h1Admissions,
      (item) => item.runId,
      "H1 runtime admission"
    );
    for (const [requestId, reservation] of normalizedRequestReservations) {
      const admission = h1AdmissionsByRun.get(reservation.runId);
      if (
        reservation.runtimeAuthorityKind === "h1-runtime-admission-v1" &&
        (!admission || admission.requestId !== requestId)
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_closure_invalid",
          "Persisted H1 Runtime ownership is missing its exact admission."
        );
      }
      if (
        reservation.runtimeAuthorityKind === "legacy" &&
        admission
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_closure_invalid",
          "A legacy Run cannot carry H1 Runtime admission facts."
        );
      }
    }
    for (const run of normalizedRuns) {
      if (catalogCompatibilityOnlyRunIds.includes(run.runId)) continue;
      const catalogBinding = catalogBindingByRunId.get(run.runId);
      if (!catalogBinding) continue;
      if (
        catalogBinding.catalogProfileId ===
        RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
      ) {
        if (run.receipts.length > 0) {
          throw new ConversationStoreErrorV1(
            "fixture_catalog_not_executable",
            "A direct Store fixture cannot carry executable Tool Receipts."
          );
        }
        continue;
      }
      const events =
        state.events.find(([runId]) => runId === run.runId)?.[1] || [];
      this.assertCatalogTerminalToolLifecycleV1(
        catalogBinding,
        run,
        events,
        "runtime_public_lifecycle_invalid"
      );
    }
    for (const admission of h1Admissions) {
      if (admission.status !== "active") {
        const run = runsById.get(admission.runId);
        const thread = run ? threadsById.get(run.threadId) : undefined;
        const events =
          state.events.find(([runId]) => runId === admission.runId)?.[1] || [];
        const hasToolReservation = normalizedToolReservations.some(([key]) =>
          key.startsWith(`${admission.runId}\u0000`)
        );
        const hasAssistantToolBatchReservation =
          assistantToolBatchReservations.some(([key]) =>
            key.startsWith(`${admission.runId}\u0000`)
          );
        const hasAssistantToolCalls = Boolean(
          thread?.messages.some(
            (message) =>
              message.runId === admission.runId &&
              message.role === "assistant" &&
              message.toolCalls.length > 0
          )
        );
        if (
          !run ||
          run.receipts.length > 0 ||
          hasToolReservation ||
          hasAssistantToolBatchReservation ||
          hasAssistantToolCalls ||
          events.some((event) => event.category === "tool")
        ) {
          throw new ConversationStoreErrorV1(
            "h1_inactive_admission_tool_lifecycle_forbidden",
            "Pending or rejected H1 admission cannot carry Tool lifecycle facts."
          );
        }
      }
      if (admission.status !== "active") continue;
      const run = runsById.get(admission.runId);
      const events = state.events.find(([runId]) => runId === admission.runId)?.[1] || [];
      if (!run) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_closure_invalid",
          "Persisted active H1 admission is detached from its Run."
        );
      }
      const catalogBinding = catalogBindingByRunId.get(admission.runId);
      if (
        !catalogBinding ||
        admission.authority.compiledToolCatalog.catalogHash !==
          catalogBinding.catalogHash ||
        catalogBinding.toolDescriptorFingerprint !==
          H1_RUNTIME_CATALOG_BINDING_SEED_V1.toolDescriptorFingerprint
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_catalog_authority_closure_mismatch",
          "Persisted H1 compiled authority differs from its immutable Run Tool Catalog binding."
        );
      }
      const fingerprint = fingerprintByRunId.get(admission.runId);
      const persistedReceiptHashes = new Set(
        run.receipts.map((receipt) => hashCanonicalJsonV1(receipt))
      );
      const persistedEventHashes = new Set([
        "GENESIS",
        ...events.map((event) => event.eventHash),
      ]);
      let actorCallMismatch: string | null = null;
      for (const binding of admission.actorCallBindings) {
        const expectedActorCall = expectedH1ActorCallClosureV1({
          admission,
          run,
          thread: threadsById.get(run.threadId)!,
          binding,
        });
        actorCallMismatch =
          binding.systemPromptHash !== admission.authority.systemPromptHash
            ? "system_prompt_hash"
            : binding.toolDescriptorHash !==
                fingerprint?.toolDescriptorFingerprint
              ? "run_fingerprint_tool_descriptor"
              : binding.contextManifest.uxCapabilityFingerprint !==
                  admission.seed.snapshot.capabilityFingerprint
                ? "ux_capability_fingerprint"
                : binding.contextManifest.revisionBinding !==
                    hashCanonicalJsonV1(admission.seed.snapshot.revision)
                  ? "revision_binding"
                  : !persistedEventHashes.has(binding.eventHeadHash)
                    ? "event_head"
                    : binding.sourceReceiptHashes.some(
                          (hash) => !persistedReceiptHashes.has(hash)
                        )
                      ? "source_receipt"
                      : binding.actorRequestHash !==
                          expectedActorCall.actorRequestHash
                        ? "actor_request"
                        : binding.contextManifest.manifestHash !==
                            expectedActorCall.contextManifestHash
                          ? "context_manifest"
                          : binding.toolDescriptorHash !==
                              expectedActorCall.toolDescriptorHash
                            ? "expected_tool_descriptor"
                            : null;
        if (actorCallMismatch) break;
      }
      if (actorCallMismatch) {
        throw new ConversationStoreErrorV1(
          "h1_actor_call_store_closure_mismatch",
          `Persisted H1 Actor call bindings differ from Run authority, Events, or Receipts (${actorCallMismatch}).`
        );
      }
      if (!catalogBinding) continue;
      if (
        catalogBinding.catalogProfileId ===
        RUN_TOOL_CATALOG_BINDING_V1.directStoreFixtureProfileId
      ) {
        if (run.receipts.length > 0) {
          throw new ConversationStoreErrorV1(
            "fixture_catalog_not_executable",
            "A direct Store fixture cannot carry executable Tool Receipts."
          );
        }
        continue;
      }
      this.assertCatalogTerminalToolLifecycleV1(
        catalogBinding,
        run,
        events,
        "h1_runtime_public_lifecycle_invalid"
      );
    }
    for (const admission of h1Admissions) {
      const run = runsById.get(admission.runId);
      const reservation = normalizedRequestReservations.find(
        ([requestId]) => requestId === admission.requestId
      )?.[1];
      if (
        !run ||
        run.workspaceId !== admission.workspaceId ||
        run.sessionId !== admission.sessionId ||
        run.documentId !== admission.documentId ||
        run.threadId !== admission.threadId ||
        run.turnId !== admission.turnId ||
        reservation?.runId !== admission.runId ||
        reservation.runtimeAuthorityKind !== "h1-runtime-admission-v1" ||
        reservation.canvasObservationBindingHash !==
          admission.seed.observationBindingHash
      ) {
        throw new ConversationStoreErrorV1(
          "h1_runtime_admission_closure_invalid",
          "Persisted H1 admission is detached from its Request, Run, Turn, Thread, or observation binding."
        );
      }
    }
    const h1NonceEntries = legacyH1
      ? []
      : (state.h1ConsumedGrantNonces || []).map((entry) => {
          if (!Array.isArray(entry) || entry.length !== 2) {
            throw new ConversationStoreErrorV1(
              "conversation_store_state_invalid",
              "Persisted H1 Grant nonce entry is malformed."
            );
          }
          const [nonceHash, consumption] = entry;
          try {
            requiredHashV1(nonceHash, "h1ConsumedGrantNonce.nonceHash");
            requiredIdV1(consumption.requestId, "h1ConsumedGrantNonce.requestId");
            requiredHashV1(consumption.seedHash, "h1ConsumedGrantNonce.seedHash");
            requiredIdV1(consumption.runId, "h1ConsumedGrantNonce.runId");
          } catch {
            throw new ConversationStoreErrorV1(
              "conversation_store_state_invalid",
              "Persisted H1 Grant nonce identity or hash is invalid."
            );
          }
          if (
            Object.keys(consumption).length !== 3 ||
            !["requestId", "seedHash", "runId"].every((key) =>
              Object.hasOwn(consumption, key)
            )
          ) {
            throw new ConversationStoreErrorV1(
              "conversation_store_state_invalid",
              "Persisted H1 Grant nonce fields differ from the frozen contract."
            );
          }
          const admission = h1AdmissionsByRun.get(consumption.runId);
          if (
            !admission ||
            admission.requestId !== consumption.requestId ||
            admission.seed.seedHash !== consumption.seedHash ||
            h1RuntimeGrantNonceHashV1(admission.seed) !== nonceHash
          ) {
            throw new ConversationStoreErrorV1(
              "h1_runtime_admission_closure_invalid",
              "Persisted H1 Grant nonce is detached from its exact Run admission."
            );
          }
          return [nonceHash, clone(consumption)] as const;
        });
    if (
      new Set(h1NonceEntries.map(([nonceHash]) => nonceHash)).size !==
        h1NonceEntries.length ||
      h1NonceEntries.length !== h1Admissions.length
    ) {
      throw new ConversationStoreErrorV1(
        "h1_runtime_admission_closure_invalid",
        "Every persisted H1 admission must own exactly one consumed Grant nonce."
      );
    }
    replace(this.threads, state.threads.map((item) => [item.threadId, item] as const));
    replace(this.runs, normalizedRuns.map((item) => [item.runId, item] as const));
    replace(this.turns, state.turns.map((item) => [item.turnId, item] as const));
    replace(this.events, state.events.map(([key, value]) => [key, [...value]] as const));
    replace(this.checkpoints, state.checkpoints.map((item) => [item.runId, item] as const));
    replace(this.requestReservations, normalizedRequestReservations);
    replace(this.resumeReservations, state.resumeReservations);
    replace(this.failureOccurrences, state.failureOccurrences);
    replace(this.assistantToolBatchReservations, assistantToolBatchReservations);
    replace(this.toolReservations, normalizedToolReservations);
    replace(this.leases, state.leases);
    replace(this.runGoalBindings, bindings.map((item) => [item.runGoalBindingId, item] as const));
    replace(this.terminalAdmissions, admissions.map((item) => [item.terminalAdmissionId, item] as const));
    replace(this.canonicalDeliveries, deliveries.map((item) => [item.canonicalDeliveryId, item] as const));
    replace(this.runFingerprints, fingerprints.map((item) => [item.runFingerprintId, item] as const));
    replace(this.h1RuntimeAdmissions, h1Admissions.map((item) => [item.runId, item] as const));
    replace(this.h1ConsumedGrantNonces, h1NonceEntries);
    replace(
      this.runToolCatalogBindings,
      catalogBindings.map((item) => [item.runId, item] as const)
    );
    this.catalogCompatibilityOnlyRunIds.clear();
    catalogCompatibilityOnlyRunIds.forEach((runId) =>
      this.catalogCompatibilityOnlyRunIds.add(runId)
    );
    this.catalogMigrations = clone(catalogMigrations);
    this.preGovernanceRunIds.clear();
    preGovernanceRunIds.forEach((runId) => this.preGovernanceRunIds.add(runId));
    this.migrationRequiredRunIds.clear();
    migrationRequiredRunIds.forEach((runId) => this.migrationRequiredRunIds.add(runId));
    this.migrations = legacyGovernance
      ? [{ contractVersion: LANDING_PAGE_GOVERNANCE_FACTS_V1.migration, migrationId: "conversation-store-v1-to-v2", sourceVersion: "landing-page-conversation-store-state-v1", targetVersion: "landing-page-conversation-store-state-v2", sourcePayloadHash: hashCanonicalJsonV1(state), migratedAt: this.now() }]
      : clone(migrations);
    Object.assign(this.counters, emptyCounters(), clone(state.counters));
  }
  debugSnapshotForTest() { const state = this.exportPersistentStateV1(); return { ...state, storeHash: hashCanonicalJsonV1(state) }; }
}
