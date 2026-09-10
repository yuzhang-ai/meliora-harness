export const OUTCOME_SCHEMA_VERSION = "meliora.turn-outcome.v1" as const;

export type OutcomeIssue = Readonly<{
  code: string;
  message: string;
  blocking: boolean;
}>;

export type TurnOutcome = Readonly<{
  schemaVersion: typeof OUTCOME_SCHEMA_VERSION;
  outcomeId: string;
  sessionId: string;
  turnId: string;
  runId: string;
  attemptId: string;
  status: "completed" | "blocked" | "failed" | "cancelled";
  summary: string;
  deliverableRefs: readonly string[];
  receiptRefs: readonly string[];
  verificationRefs: readonly string[];
  unresolved: readonly OutcomeIssue[];
  userActions: readonly string[];
  evidenceRefs: readonly string[];
  proposedAt: string;
  acceptedAt?: string;
}>;

export type CompletionCheckerResult = Readonly<{
  decision: "accepted" | "rejected";
  reasons: readonly Readonly<{ code: string; message: string }>[];
}>;

export type CompletionEvidence = Readonly<{
  pendingInvocationIds: readonly string[];
  pendingApprovalIds: readonly string[];
  requiredReceiptIds: readonly string[];
  receiptIds: readonly string[];
  verificationIds: readonly string[];
  terminalEventPersisted: boolean;
}>;

export function checkOutcomeContract(
  outcome: TurnOutcome,
  evidence: CompletionEvidence,
): CompletionCheckerResult {
  const reasons: Array<{ code: string; message: string }> = [];
  if (outcome.status === "completed" && outcome.unresolved.some((issue) => issue.blocking)) {
    reasons.push({ code: "blocking_issue_unresolved", message: "Completed outcome contains a blocking issue." });
  }
  if (outcome.status === "completed" && outcome.evidenceRefs.length === 0) {
    reasons.push({ code: "completion_evidence_missing", message: "Completed outcome must reference evidence." });
  }
  if (outcome.status === "completed" && outcome.verificationRefs.length === 0) {
    reasons.push({ code: "verification_missing", message: "Completed outcome must reference verification." });
  }
  if (outcome.receiptRefs.some((id) => !evidence.receiptIds.includes(id))) {
    reasons.push({ code: "receipt_not_durable", message: "Outcome references an unknown receipt." });
  }
  if (evidence.requiredReceiptIds.some((id) => !outcome.receiptRefs.includes(id))) {
    reasons.push({ code: "required_receipt_missing", message: "Outcome omits a required write receipt." });
  }
  if (outcome.status === "completed" && (evidence.pendingInvocationIds.length > 0 || evidence.pendingApprovalIds.length > 0)) {
    reasons.push({ code: "pending_work", message: "Completed outcome cannot have pending work." });
  }
  if (outcome.status === "completed" && !evidence.terminalEventPersisted) {
    reasons.push({ code: "terminal_event_missing", message: "Completed outcome requires a durable terminal event." });
  }
  if (outcome.verificationRefs.some((id) => !evidence.verificationIds.includes(id))) {
    reasons.push({ code: "verification_not_durable", message: "Outcome references unknown verification evidence." });
  }
  return reasons.length === 0
    ? { decision: "accepted", reasons }
    : { decision: "rejected", reasons };
}
