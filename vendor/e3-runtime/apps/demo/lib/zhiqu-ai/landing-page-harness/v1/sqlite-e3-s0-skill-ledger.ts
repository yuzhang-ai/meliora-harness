import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import type {
  CompiledToolCatalogV1,
  ResolvedSkillClosureV1,
  SkillActivationReceiptV1,
  SkillActivationRequestV1,
  SkillActivationTransitionReceiptV1,
  SkillEvidenceSetV1,
  SkillResolutionPlanV1,
  SkillToolInvocationRequestV1,
} from "./authority-fabric-contracts";
import {
  CandidateSkillActivationLedgerV1,
  decodeSkillActivationReceiptV1,
  decodeSkillActivationRequestV1,
  decodeSkillActivationTransitionReceiptV1,
  decodeSkillEvidenceSetV1,
  decodeSkillToolInvocationRequestV1,
  type SkillEvidenceAuthorityV1,
  type SkillEvidenceContextV1,
} from "./authority-skill-lifecycle";
import { decodeSkillResolutionPlanV1 } from "./authority-skill-compiler";
import {
  assertPrivateLocalSqlitePathV1,
  enforcePrivateLocalSqliteFilesV1,
} from "./private-local-sqlite";
import {
  canonicalJsonV1,
  hashCanonicalJsonV1,
  hashUtf8V1,
  requiredHashV1,
  requiredIdV1,
  requiredTimestampV1,
} from "./strict-json";

export const E3_S0_DURABLE_SKILL_LEDGER_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s0-durable-skill-ledger-v1",
  runReservationTtlMs: 300_000,
  modelCallReservationTtlMs: 300_000,
  canvasWrite: false,
} as const);

type ActivationContextV1 = Readonly<{
  principalHash: string;
  toolCatalogHash: string;
  skillCatalogHash: string;
  uxCapabilitySnapshotHash: string;
  aclSnapshotHash: string;
  conflictRegistrySnapshotHash: string;
  issuedAt: string;
  expiresAt: string;
}>;

type ActivationRow = Readonly<{
  request_json: string;
  plan_json: string;
  context_json: string;
  receipt_json: string;
}>;

type InvocationRow = Readonly<{
  request_json: string;
  closure_json: string;
  tool_catalog_json: string;
  authorized_at: string;
}>;

type TransitionRow = Readonly<{
  receipt_json: string;
  evidence_context_json: string | null;
}>;

export type E3S0ModelCallTerminalV1 = Readonly<{
  runId: string;
  phase: string;
  bindingHash: string;
  state: "completed" | "failed";
  modelIdentity: string;
  providerBindingHash: string;
  promptManifestHash: string;
  systemPromptHash: string;
  requestHash: string;
  responseHash: string | null;
  responseJson: string | null;
  publicErrorCode: string | null;
}>;

const parseJson = (text: string) => JSON.parse(text) as unknown;

export class SqliteE3S0SkillLedgerV1 {
  private readonly db: Database.Database;
  private readonly clock: () => number;
  private readonly nonce: () => string;

  constructor(input: Readonly<{
    databasePath: string;
    clock?: () => number;
    nonce?: () => string;
    evidenceAuthority?: SkillEvidenceAuthorityV1 | null;
  }>) {
    const databasePath = assertPrivateLocalSqlitePathV1(input.databasePath);
    this.clock = input.clock ?? Date.now;
    this.nonce = input.nonce ?? randomUUID;
    this.evidenceAuthority = input.evidenceAuthority ?? null;
    this.db = new Database(databasePath);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS e3_skill_runs (
        run_id TEXT PRIMARY KEY,
        binding_hash TEXT NOT NULL,
        state TEXT NOT NULL,
        owner_token_hash TEXT,
        plan_hash TEXT,
        activation_id TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS e3_skill_activations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        activation_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL UNIQUE,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        request_json TEXT NOT NULL,
        plan_json TEXT NOT NULL,
        context_json TEXT NOT NULL,
        receipt_hash TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        UNIQUE(run_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS e3_skill_plans (
        run_id TEXT PRIMARY KEY,
        plan_hash TEXT NOT NULL UNIQUE,
        plan_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS e3_skill_tool_invocations (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        activation_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        request_json TEXT NOT NULL,
        closure_json TEXT NOT NULL,
        tool_catalog_json TEXT NOT NULL,
        authorized_at TEXT NOT NULL,
        UNIQUE(run_id, activation_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS e3_skill_evidence (
        activation_id TEXT PRIMARY KEY,
        evidence_hash TEXT NOT NULL UNIQUE,
        evidence_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS e3_skill_transitions (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        activation_id TEXT NOT NULL UNIQUE,
        run_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        material_hash TEXT NOT NULL,
        receipt_json TEXT NOT NULL,
        evidence_context_json TEXT,
        UNIQUE(run_id, idempotency_key)
      );
      CREATE TABLE IF NOT EXISTS e3_model_calls (
        run_id TEXT NOT NULL,
        phase TEXT NOT NULL,
        binding_hash TEXT NOT NULL,
        state TEXT NOT NULL,
        owner_token_hash TEXT,
        response_hash TEXT,
        response_json TEXT,
        model_identity TEXT,
        provider_binding_hash TEXT,
        prompt_manifest_hash TEXT,
        system_prompt_hash TEXT,
        request_hash TEXT,
        public_error_code TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY(run_id, phase)
      );
    `);
    const modelCallColumns = new Set(
      (this.db.pragma("table_info(e3_model_calls)") as Array<{ name: string }>).map(
        (column) => column.name
      )
    );
    for (const [name, type] of [
      ["model_identity", "TEXT"],
      ["response_json", "TEXT"],
      ["provider_binding_hash", "TEXT"],
      ["prompt_manifest_hash", "TEXT"],
      ["system_prompt_hash", "TEXT"],
      ["request_hash", "TEXT"],
      ["public_error_code", "TEXT"],
    ] as const) {
      if (!modelCallColumns.has(name)) {
        this.db.exec(`ALTER TABLE e3_model_calls ADD COLUMN ${name} ${type}`);
      }
    }
    enforcePrivateLocalSqliteFilesV1(databasePath);
  }

  private readonly evidenceAuthority: SkillEvidenceAuthorityV1 | null;

  close() {
    this.db.close();
  }

  private now() {
    const value = this.clock();
    if (!Number.isFinite(value)) throw new Error("e3_skill_ledger_clock_invalid");
    return value;
  }

  beginRun(input: Readonly<{ runId: string; bindingHash: string }>) {
    const runId = requiredIdV1(input.runId, "e3SkillLedger.runId");
    const bindingHash = requiredHashV1(input.bindingHash, "e3SkillLedger.bindingHash");
    const ownerToken = `e3-run-owner:${this.nonce()}`;
    return this.db.transaction(() => {
      const now = this.now();
      const inserted = this.db.prepare(`
        INSERT OR IGNORE INTO e3_skill_runs
        (run_id,binding_hash,state,owner_token_hash,plan_hash,activation_id,created_at,updated_at)
        VALUES (?,?,'reserved',?,NULL,NULL,?,?)
      `).run(runId, bindingHash, hashCanonicalJsonV1(ownerToken), now, now);
      const row = this.db.prepare("SELECT * FROM e3_skill_runs WHERE run_id=?").get(runId) as {
        binding_hash: string; state: string; owner_token_hash: string | null;
        plan_hash: string | null; activation_id: string | null; updated_at: number;
      };
      if (row.binding_hash !== bindingHash) throw new Error("e3_skill_run_binding_conflict");
      if (row.activation_id) return { kind: "activation" as const, activationReceipt: this.readActivation(row.activation_id)! };
      if (row.plan_hash) return {
        kind: row.state === "unavailable" ? "unavailable" as const : "plan" as const,
        plan: this.readPlan(runId)!,
      };
      if (inserted.changes === 1) return { kind: "owner" as const, ownerToken };
      if (row.state === "reserved" && now - row.updated_at >= E3_S0_DURABLE_SKILL_LEDGER_V1.runReservationTtlMs) {
        this.db.prepare("UPDATE e3_skill_runs SET state='failed',owner_token_hash=NULL,updated_at=? WHERE run_id=? AND state='reserved'").run(now, runId);
        return { kind: "failed" as const };
      }
      return { kind: row.state === "failed" ? "failed" as const : "in_progress" as const };
    })();
  }

  savePlan(input: Readonly<{
    runId: string; bindingHash: string; ownerToken: string; plan: SkillResolutionPlanV1;
  }>) {
    const runId = requiredIdV1(input.runId, "e3SkillLedger.runId");
    const bindingHash = requiredHashV1(input.bindingHash, "e3SkillLedger.bindingHash");
    const plan = decodeSkillResolutionPlanV1(input.plan);
    if (plan.runId !== runId) throw new Error("e3_skill_plan_run_mismatch");
    const ownerHash = hashCanonicalJsonV1(requiredIdV1(input.ownerToken, "e3SkillLedger.ownerToken"));
    return this.db.transaction(() => {
      const changed = this.db.prepare(`
        UPDATE e3_skill_runs SET state='plan_saved',owner_token_hash=NULL,plan_hash=?,updated_at=?
        WHERE run_id=? AND binding_hash=? AND state='reserved' AND owner_token_hash=?
      `).run(plan.planHash, this.now(), runId, bindingHash, ownerHash);
      if (changed.changes !== 1) throw new Error("e3_skill_plan_owner_cas_failed");
      this.db.prepare("INSERT INTO e3_skill_plans(run_id,plan_hash,plan_json) VALUES (?,?,?)")
        .run(runId, plan.planHash, canonicalJsonV1(plan));
      return structuredClone(plan);
    })();
  }

  readPlan(runIdInput: string): SkillResolutionPlanV1 | null {
    const runId = requiredIdV1(runIdInput, "e3SkillLedger.runId");
    const row = this.db.prepare("SELECT plan_json FROM e3_skill_plans WHERE run_id=?").get(runId) as { plan_json: string } | undefined;
    if (row) return decodeSkillResolutionPlanV1(parseJson(row.plan_json));
    return null;
  }

  markUnavailable(input: Readonly<{ runId: string; planHash: string }>) {
    const changed = this.db.prepare("UPDATE e3_skill_runs SET state='unavailable',updated_at=? WHERE run_id=? AND state='plan_saved' AND plan_hash=?")
      .run(this.now(), requiredIdV1(input.runId, "e3SkillLedger.runId"), requiredHashV1(input.planHash, "e3SkillLedger.planHash"));
    if (changed.changes !== 1) throw new Error("e3_skill_unavailable_cas_failed");
  }

  activate(input: Readonly<{
    request: SkillActivationRequestV1;
    plan: SkillResolutionPlanV1;
    context: ActivationContextV1;
  }>): SkillActivationReceiptV1 {
    const request = decodeSkillActivationRequestV1(input.request);
    const plan = decodeSkillResolutionPlanV1(input.plan);
    const context: ActivationContextV1 = {
      principalHash: requiredHashV1(input.context.principalHash, "e3SkillLedger.principalHash"),
      toolCatalogHash: requiredHashV1(input.context.toolCatalogHash, "e3SkillLedger.toolCatalogHash"),
      skillCatalogHash: requiredHashV1(input.context.skillCatalogHash, "e3SkillLedger.skillCatalogHash"),
      uxCapabilitySnapshotHash: requiredHashV1(input.context.uxCapabilitySnapshotHash, "e3SkillLedger.uxCapabilitySnapshotHash"),
      aclSnapshotHash: requiredHashV1(input.context.aclSnapshotHash, "e3SkillLedger.aclSnapshotHash"),
      conflictRegistrySnapshotHash: requiredHashV1(input.context.conflictRegistrySnapshotHash, "e3SkillLedger.conflictRegistrySnapshotHash"),
      issuedAt: requiredTimestampV1(input.context.issuedAt, "e3SkillLedger.issuedAt"),
      expiresAt: requiredTimestampV1(input.context.expiresAt, "e3SkillLedger.expiresAt"),
    };
    return this.db.transaction(() => {
      const runtime = this.rehydrate();
      const receipt = runtime.activate({ request, plan, ...context });
      const requestHash = hashCanonicalJsonV1(request);
      const existing = this.db.prepare("SELECT request_hash,receipt_json FROM e3_skill_activations WHERE run_id=? AND idempotency_key=?").get(request.runId, request.idempotencyKey) as { request_hash: string; receipt_json: string } | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) throw new Error("activation_idempotency_conflict");
        return decodeSkillActivationReceiptV1(parseJson(existing.receipt_json));
      }
      const run = this.db.prepare("SELECT plan_hash,state FROM e3_skill_runs WHERE run_id=?").get(request.runId) as { plan_hash: string | null; state: string } | undefined;
      if (!run || run.plan_hash !== plan.planHash || run.state !== "plan_saved") throw new Error("e3_skill_activation_plan_not_durably_admitted");
      this.db.prepare(`INSERT INTO e3_skill_activations
        (activation_id,run_id,idempotency_key,request_hash,request_json,plan_json,context_json,receipt_hash,receipt_json)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(
          receipt.skillActivationId, request.runId, request.idempotencyKey, requestHash,
          canonicalJsonV1(request), canonicalJsonV1(plan), canonicalJsonV1(context),
          receipt.receiptHash, canonicalJsonV1(receipt)
        );
      const changed = this.db.prepare("UPDATE e3_skill_runs SET state='active',activation_id=?,updated_at=? WHERE run_id=? AND state='plan_saved' AND plan_hash=?").run(receipt.skillActivationId, this.now(), request.runId, plan.planHash);
      if (changed.changes !== 1) throw new Error("e3_skill_activation_cas_failed");
      return receipt;
    })();
  }

  authorizeToolInvocation(input: Readonly<{
    request: Omit<SkillToolInvocationRequestV1, "contractVersion" | "argumentsHash">;
    closure: ResolvedSkillClosureV1;
    plan: SkillResolutionPlanV1;
    toolCatalog: CompiledToolCatalogV1;
    activationReceipt: SkillActivationReceiptV1;
    now: string;
  }>) {
    return this.db.transaction(() => {
      const runtime = this.rehydrate();
      const request = runtime.authorizeToolInvocation(input);
      const requestHash = hashCanonicalJsonV1(request);
      const existing = this.db.prepare("SELECT request_hash,request_json FROM e3_skill_tool_invocations WHERE run_id=? AND activation_id=? AND idempotency_key=?").get(request.runId, request.skillActivationId, request.idempotencyKey) as { request_hash: string; request_json: string } | undefined;
      if (existing) {
        if (existing.request_hash !== requestHash) throw new Error("skill_tool_invocation_idempotency_conflict");
        return decodeSkillToolInvocationRequestV1(parseJson(existing.request_json));
      }
      this.db.prepare(`INSERT INTO e3_skill_tool_invocations
        (run_id,activation_id,idempotency_key,request_hash,request_json,closure_json,tool_catalog_json,authorized_at)
        VALUES (?,?,?,?,?,?,?,?)`).run(
          request.runId, request.skillActivationId, request.idempotencyKey, requestHash,
          canonicalJsonV1(request), canonicalJsonV1(input.closure), canonicalJsonV1(input.toolCatalog),
          requiredTimestampV1(input.now, "e3SkillLedger.toolAuthorizedAt")
        );
      return request;
    })();
  }

  saveEvidence(evidenceInput: SkillEvidenceSetV1) {
    const evidence = decodeSkillEvidenceSetV1(evidenceInput);
    return this.db.transaction(() => {
      const existing = this.db.prepare("SELECT evidence_hash,evidence_json FROM e3_skill_evidence WHERE activation_id=?").get(evidence.skillActivationId) as { evidence_hash: string; evidence_json: string } | undefined;
      if (existing) {
        if (existing.evidence_hash !== evidence.evidenceSetHash) throw new Error("e3_skill_evidence_conflict");
        return decodeSkillEvidenceSetV1(parseJson(existing.evidence_json));
      }
      this.db.prepare("INSERT INTO e3_skill_evidence(activation_id,evidence_hash,evidence_json) VALUES (?,?,?)").run(evidence.skillActivationId, evidence.evidenceSetHash, canonicalJsonV1(evidence));
      return evidence;
    })();
  }

  transition(input: Readonly<{
    activationReceipt: SkillActivationReceiptV1;
    nextState: "completed" | "cancelled";
    transitionReasonCode: string;
    evidenceSet: SkillEvidenceSetV1 | null;
    evidenceContext: SkillEvidenceContextV1 | null;
    idempotencyKey: string;
    issuedAt: string;
  }>): SkillActivationTransitionReceiptV1 {
    return this.db.transaction(() => {
      const runtime = this.rehydrate();
      const receipt = runtime.transition(input);
      const existing = this.db.prepare("SELECT material_hash,receipt_json FROM e3_skill_transitions WHERE run_id=? AND idempotency_key=?").get(receipt.runId, receipt.idempotencyKey) as { material_hash: string; receipt_json: string } | undefined;
      if (existing) {
        if (existing.material_hash !== receipt.receiptHash) throw new Error("activation_transition_idempotency_conflict");
        return decodeSkillActivationTransitionReceiptV1(parseJson(existing.receipt_json));
      }
      if (input.evidenceSet) this.saveEvidence(input.evidenceSet);
      this.db.prepare("INSERT INTO e3_skill_transitions(activation_id,run_id,idempotency_key,material_hash,receipt_json,evidence_context_json) VALUES (?,?,?,?,?,?)").run(receipt.skillActivationId, receipt.runId, receipt.idempotencyKey, receipt.receiptHash, canonicalJsonV1(receipt), input.evidenceContext ? canonicalJsonV1(input.evidenceContext) : null);
      const changed = this.db.prepare("UPDATE e3_skill_runs SET state=?,updated_at=? WHERE run_id=? AND activation_id=? AND state='active'").run(receipt.nextState, this.now(), receipt.runId, receipt.skillActivationId);
      if (changed.changes !== 1) throw new Error("e3_skill_transition_cas_failed");
      return receipt;
    })();
  }

  beginModelCall(input: Readonly<{ runId: string; phase: string; bindingHash: string }>) {
    const runId = requiredIdV1(input.runId, "e3ModelCall.runId");
    const phase = requiredIdV1(input.phase, "e3ModelCall.phase");
    const bindingHash = requiredHashV1(input.bindingHash, "e3ModelCall.bindingHash");
    const ownerToken = `e3-model-owner:${this.nonce()}`;
    return this.db.transaction(() => {
      const now = this.now();
      const inserted = this.db.prepare(`INSERT OR IGNORE INTO e3_model_calls
        (run_id,phase,binding_hash,state,owner_token_hash,response_hash,created_at,updated_at)
        VALUES (?,? ,?,'reserved',?,NULL,?,?)`).run(runId, phase, bindingHash, hashCanonicalJsonV1(ownerToken), now, now);
      const row = this.db.prepare("SELECT * FROM e3_model_calls WHERE run_id=? AND phase=?").get(runId, phase) as { binding_hash: string; state: string; owner_token_hash: string | null; response_hash: string | null; updated_at: number };
      if (row.binding_hash !== bindingHash) throw new Error("e3_model_call_binding_conflict");
      if (row.state === "completed") return { kind: "completed" as const, responseHash: row.response_hash! };
      if (row.state === "failed") return { kind: "failed" as const };
      if (inserted.changes === 1) return { kind: "owner" as const, ownerToken };
      if (now - row.updated_at >= E3_S0_DURABLE_SKILL_LEDGER_V1.modelCallReservationTtlMs) {
        this.db.prepare("UPDATE e3_model_calls SET state='failed',owner_token_hash=NULL,updated_at=? WHERE run_id=? AND phase=? AND state='reserved'").run(now, runId, phase);
        return { kind: "failed" as const };
      }
      return { kind: "in_progress" as const };
    })();
  }

  settleModelCall(input: Readonly<{
    runId: string;
    phase: string;
    bindingHash: string;
    ownerToken: string;
    state: "completed" | "failed";
    modelIdentity: string;
    providerBindingHash: string;
    promptManifestHash: string;
    systemPromptHash: string;
    requestHash: string;
    responseHash: string | null;
    responseJson: string | null;
    publicErrorCode: string | null;
  }>): E3S0ModelCallTerminalV1 {
    const terminal: E3S0ModelCallTerminalV1 = {
      runId: requiredIdV1(input.runId, "e3ModelCall.runId"),
      phase: requiredIdV1(input.phase, "e3ModelCall.phase"),
      bindingHash: requiredHashV1(input.bindingHash, "e3ModelCall.bindingHash"),
      state: input.state,
      modelIdentity: requiredIdV1(input.modelIdentity, "e3ModelCall.modelIdentity"),
      providerBindingHash: requiredHashV1(input.providerBindingHash, "e3ModelCall.providerBindingHash"),
      promptManifestHash: requiredHashV1(input.promptManifestHash, "e3ModelCall.promptManifestHash"),
      systemPromptHash: requiredHashV1(input.systemPromptHash, "e3ModelCall.systemPromptHash"),
      requestHash: requiredHashV1(input.requestHash, "e3ModelCall.requestHash"),
      responseHash:
        input.responseHash === null
          ? null
          : requiredHashV1(input.responseHash, "e3ModelCall.responseHash"),
      responseJson:
        input.responseJson === null
          ? null
          : canonicalJsonV1(JSON.parse(input.responseJson) as unknown),
      publicErrorCode:
        input.publicErrorCode === null
          ? null
          : requiredIdV1(input.publicErrorCode, "e3ModelCall.publicErrorCode"),
    };
    if (
      (terminal.state === "completed" &&
        (terminal.responseHash === null || terminal.responseJson === null || terminal.publicErrorCode !== null)) ||
      (terminal.state === "failed" &&
        (terminal.responseHash !== null || terminal.responseJson !== null || terminal.publicErrorCode === null)) ||
      (terminal.responseJson !== null && hashUtf8V1(terminal.responseJson) !== terminal.responseHash)
    ) {
      throw new Error("e3_model_call_terminal_invalid");
    }
    const changed = this.db.prepare(`UPDATE e3_model_calls SET
      state=?,owner_token_hash=NULL,response_hash=?,response_json=?,model_identity=?,provider_binding_hash=?,
      prompt_manifest_hash=?,system_prompt_hash=?,request_hash=?,public_error_code=?,updated_at=?
      WHERE run_id=? AND phase=? AND binding_hash=? AND state='reserved' AND owner_token_hash=?`).run(
        terminal.state,
        terminal.responseHash,
        terminal.responseJson,
        terminal.modelIdentity,
        terminal.providerBindingHash,
        terminal.promptManifestHash,
        terminal.systemPromptHash,
        terminal.requestHash,
        terminal.publicErrorCode,
        this.now(),
        terminal.runId,
        terminal.phase,
        terminal.bindingHash,
        hashCanonicalJsonV1(requiredIdV1(input.ownerToken, "e3ModelCall.ownerToken"))
      );
    if (changed.changes !== 1) throw new Error("e3_model_call_owner_cas_failed");
    return Object.freeze(terminal);
  }

  readModelCall(runIdInput: string, phaseInput: string): E3S0ModelCallTerminalV1 | null {
    const runId = requiredIdV1(runIdInput, "e3ModelCall.runId");
    const phase = requiredIdV1(phaseInput, "e3ModelCall.phase");
    const row = this.db.prepare("SELECT * FROM e3_model_calls WHERE run_id=? AND phase=?")
      .get(runId, phase) as Record<string, unknown> | undefined;
    if (!row || (row.state !== "completed" && row.state !== "failed")) return null;
    if (
      typeof row.binding_hash !== "string" ||
      typeof row.model_identity !== "string" ||
      typeof row.provider_binding_hash !== "string" ||
      typeof row.prompt_manifest_hash !== "string" ||
      typeof row.system_prompt_hash !== "string" ||
      typeof row.request_hash !== "string"
    ) return null;
    const terminal: E3S0ModelCallTerminalV1 = {
      runId,
      phase,
      bindingHash: requiredHashV1(row.binding_hash, "e3ModelCall.bindingHash"),
      state: row.state,
      modelIdentity: requiredIdV1(row.model_identity, "e3ModelCall.modelIdentity"),
      providerBindingHash: requiredHashV1(row.provider_binding_hash, "e3ModelCall.providerBindingHash"),
      promptManifestHash: requiredHashV1(row.prompt_manifest_hash, "e3ModelCall.promptManifestHash"),
      systemPromptHash: requiredHashV1(row.system_prompt_hash, "e3ModelCall.systemPromptHash"),
      requestHash: requiredHashV1(row.request_hash, "e3ModelCall.requestHash"),
      responseHash: typeof row.response_hash === "string"
        ? requiredHashV1(row.response_hash, "e3ModelCall.responseHash")
        : null,
      responseJson: typeof row.response_json === "string" ? row.response_json : null,
      publicErrorCode: typeof row.public_error_code === "string"
        ? requiredIdV1(row.public_error_code, "e3ModelCall.publicErrorCode")
        : null,
    };
    if (
      (terminal.state === "completed" &&
        (terminal.responseHash === null ||
          terminal.responseJson === null ||
          terminal.publicErrorCode !== null ||
          canonicalJsonV1(JSON.parse(terminal.responseJson) as unknown) !== terminal.responseJson ||
          hashUtf8V1(terminal.responseJson) !== terminal.responseHash)) ||
      (terminal.state === "failed" &&
        (terminal.responseHash !== null ||
          terminal.responseJson !== null ||
          terminal.publicErrorCode === null))
    ) throw new Error("e3_model_call_recovery_drift");
    return Object.freeze(terminal);
  }

  readActivation(activationIdInput: string): SkillActivationReceiptV1 | null {
    const activationId = requiredIdV1(activationIdInput, "e3SkillLedger.activationId");
    const row = this.db.prepare("SELECT receipt_json FROM e3_skill_activations WHERE activation_id=?").get(activationId) as { receipt_json: string } | undefined;
    return row ? decodeSkillActivationReceiptV1(parseJson(row.receipt_json)) : null;
  }

  readActiveActivation(activationIdInput: string): SkillActivationReceiptV1 | null {
    const activationId = requiredIdV1(activationIdInput, "e3SkillLedger.activationId");
    const row = this.db.prepare(`
      SELECT a.receipt_json
      FROM e3_skill_activations a
      JOIN e3_skill_runs r ON r.run_id = a.run_id AND r.activation_id = a.activation_id
      WHERE a.activation_id = ? AND r.state = 'active'
    `).get(activationId) as { receipt_json: string } | undefined;
    if (!row) return null;
    // Rehydrate the complete lifecycle before trusting the persisted row.  This
    // recomputes every prior activation receipt and rejects store drift.
    this.rehydrate();
    return decodeSkillActivationReceiptV1(parseJson(row.receipt_json));
  }

  private rehydrate() {
    const runtime = new CandidateSkillActivationLedgerV1(this.evidenceAuthority);
    const activations = this.db.prepare("SELECT request_json,plan_json,context_json,receipt_json FROM e3_skill_activations ORDER BY sequence").all() as ActivationRow[];
    for (const row of activations) {
      const expected = decodeSkillActivationReceiptV1(parseJson(row.receipt_json));
      const actual = runtime.activate({
        request: decodeSkillActivationRequestV1(parseJson(row.request_json)),
        plan: decodeSkillResolutionPlanV1(parseJson(row.plan_json)),
        ...(parseJson(row.context_json) as ActivationContextV1),
      });
      if (actual.receiptHash !== expected.receiptHash) throw new Error("e3_skill_activation_recovery_drift");
    }
    const invocations = this.db.prepare("SELECT request_json,closure_json,tool_catalog_json,authorized_at FROM e3_skill_tool_invocations ORDER BY sequence").all() as InvocationRow[];
    for (const row of invocations) {
      const expected = decodeSkillToolInvocationRequestV1(parseJson(row.request_json));
      const activation = this.readActivation(expected.skillActivationId);
      if (!activation) throw new Error("e3_skill_invocation_activation_missing");
      const planRow = this.db.prepare("SELECT plan_json FROM e3_skill_activations WHERE activation_id=?").get(expected.skillActivationId) as { plan_json: string };
      const actual = runtime.authorizeToolInvocation({
        request: expected,
        closure: parseJson(row.closure_json) as ResolvedSkillClosureV1,
        plan: decodeSkillResolutionPlanV1(parseJson(planRow.plan_json)),
        toolCatalog: parseJson(row.tool_catalog_json) as CompiledToolCatalogV1,
        activationReceipt: activation,
        now: row.authorized_at,
      });
      if (hashCanonicalJsonV1(actual) !== hashCanonicalJsonV1(expected)) throw new Error("e3_skill_invocation_recovery_drift");
    }
    const transitions = this.db.prepare("SELECT receipt_json,evidence_context_json FROM e3_skill_transitions ORDER BY sequence").all() as TransitionRow[];
    for (const row of transitions) {
      const expected = decodeSkillActivationTransitionReceiptV1(parseJson(row.receipt_json));
      const activation = this.readActivation(expected.skillActivationId);
      if (!activation) throw new Error("e3_skill_transition_activation_missing");
      const evidenceRow = this.db.prepare("SELECT evidence_json FROM e3_skill_evidence WHERE activation_id=?").get(expected.skillActivationId) as { evidence_json: string } | undefined;
      const evidenceSet = evidenceRow ? decodeSkillEvidenceSetV1(parseJson(evidenceRow.evidence_json)) : null;
      const actual = runtime.transition({
        activationReceipt: activation,
        nextState: expected.nextState,
        transitionReasonCode: expected.transitionReasonCode,
        evidenceSet,
        evidenceContext: row.evidence_context_json
          ? (parseJson(row.evidence_context_json) as SkillEvidenceContextV1)
          : null,
        idempotencyKey: expected.idempotencyKey,
        issuedAt: expected.issuedAt,
      });
      if (actual.receiptHash !== expected.receiptHash) throw new Error("e3_skill_transition_recovery_drift");
    }
    return runtime;
  }
}
