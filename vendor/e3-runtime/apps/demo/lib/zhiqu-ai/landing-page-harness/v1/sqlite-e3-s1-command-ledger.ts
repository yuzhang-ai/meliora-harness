import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";

import { assertPrivateLocalSqlitePathV1, enforcePrivateLocalSqliteFilesV1 } from "./private-local-sqlite";
import { canonicalJsonV1, hashCanonicalJsonV1, hashUtf8V1, requiredIdV1 } from "./strict-json";
import type { E3S1UxCommitReceiptV1 } from "./e3-s1-ux-host-port";
import { browserAtomicFingerprintPort, type AtomicDocumentPointer } from "../../../../config/blocks/editor-kernel/atomic-document-version";

export const E3_S1_COMMAND_LEDGER_V1 = Object.freeze({
  contractVersion: "formal-r3-e3-s1-command-ledger-v1",
  leaseTtlMs: 300_000,
  exactReplay: true,
  automaticReplayAfterUnknown: false,
  executionReservationTtlMs: 300_000,
} as const);

export type E3S1CommandLeaseV1 = Readonly<{
  contractVersion: "formal-r3-e3-s1-command-lease-v1";
  leaseId: string;
  runId: string;
  activationId: string;
  actorId: string;
  sessionId: string;
  capabilityFingerprint: string;
  profileHash: string;
  registryHash: string;
  base: AtomicDocumentPointer;
  basePointerHash: string;
  allowedSections: readonly ("header" | "hero" | "cta")[];
  effect: "single_section" | "fixed_page_batch";
  issuedAt: string;
  expiresAt: string;
  leaseHash: string;
}>;

type ExecutionRow = {
  request_hash: string;
  state: "reserved" | "completed" | "failed" | "unknown";
  owner_token_hash: string | null;
  receipt_json: string | null;
  receipt_hash: string | null;
  error_code: string | null;
  updated_at: number;
};

export class SqliteE3S1CommandLedgerV1 {
  private readonly db: Database.Database;
  constructor(
    databasePath: string,
    private readonly clock: () => number = Date.now,
    private readonly nonce: () => string = randomUUID
  ) {
    const resolved = assertPrivateLocalSqlitePathV1(databasePath);
    this.db = new Database(resolved);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("synchronous = FULL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS e3_s1_leases (
        lease_id TEXT PRIMARY KEY,
        material_hash TEXT NOT NULL,
        lease_json TEXT NOT NULL,
        state TEXT NOT NULL,
        consumed_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS e3_s1_executions (
        idempotency_key TEXT PRIMARY KEY,
        lease_id TEXT NOT NULL,
        request_hash TEXT NOT NULL,
        state TEXT NOT NULL,
        owner_token_hash TEXT,
        receipt_json TEXT,
        receipt_hash TEXT,
        error_code TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (lease_id) REFERENCES e3_s1_leases(lease_id)
      );
      CREATE TABLE IF NOT EXISTS e3_s1_saved_readbacks (
        idempotency_key TEXT PRIMARY KEY,
        receipt_hash TEXT NOT NULL,
        readback_hash TEXT NOT NULL,
        pointer_json TEXT NOT NULL,
        verified_at INTEGER NOT NULL,
        FOREIGN KEY (idempotency_key) REFERENCES e3_s1_executions(idempotency_key)
      );
    `);
    enforcePrivateLocalSqliteFilesV1(resolved);
  }

  issueLease(input: Omit<E3S1CommandLeaseV1, "contractVersion" | "leaseHash">) {
    const material = {
      contractVersion: "formal-r3-e3-s1-command-lease-v1" as const,
      ...input,
    };
    const lease = Object.freeze({ ...material, leaseHash: hashCanonicalJsonV1(material) });
    const materialHash = hashCanonicalJsonV1(input);
    const now = this.clock();
    const prior = this.db.prepare("SELECT material_hash, lease_json FROM e3_s1_leases WHERE lease_id=?").get(input.leaseId) as { material_hash: string; lease_json: string } | undefined;
    if (prior) {
      if (prior.material_hash !== materialHash) throw new Error("e3_s1_lease_id_conflict");
      const recovered = JSON.parse(prior.lease_json) as E3S1CommandLeaseV1;
      const { leaseHash: recoveredHash, ...recoveredMaterial } = recovered;
      if (hashCanonicalJsonV1(recoveredMaterial) !== recoveredHash) throw new Error("e3_s1_lease_recovery_drift");
      if (canonicalJsonV1(recovered) !== canonicalJsonV1(lease)) throw new Error("e3_s1_lease_recovery_drift");
      return recovered;
    }
    this.db.prepare("INSERT INTO e3_s1_leases VALUES (?, ?, ?, 'issued', NULL, ?, ?)").run(
      input.leaseId,
      materialHash,
      canonicalJsonV1(lease),
      now,
      now
    );
    return lease;
  }

  readLease(leaseId: string): E3S1CommandLeaseV1 | null {
    const id = requiredIdV1(leaseId, "e3S1.leaseId");
    const row = this.db.prepare("SELECT material_hash,lease_json FROM e3_s1_leases WHERE lease_id=?")
      .get(id) as { material_hash: string; lease_json: string } | undefined;
    if (!row) return null;
    const lease = JSON.parse(row.lease_json) as E3S1CommandLeaseV1;
    const { leaseHash, contractVersion: _contractVersion, ...input } = lease;
    const material = { contractVersion: "formal-r3-e3-s1-command-lease-v1" as const, ...input };
    if (
      lease.contractVersion !== "formal-r3-e3-s1-command-lease-v1" ||
      lease.leaseId !== id ||
      hashCanonicalJsonV1(material) !== leaseHash ||
      hashCanonicalJsonV1(input) !== row.material_hash ||
      hashCanonicalJsonV1(lease.base) !== lease.basePointerHash
    ) throw new Error("e3_s1_lease_recovery_drift");
    return Object.freeze(lease);
  }

  beginExecution(input: Readonly<{
    lease: E3S1CommandLeaseV1;
    idempotencyKey: string;
    requestHash: string;
  }> ):
    | Readonly<{ kind: "owner"; ownerToken: string }>
    | Readonly<{ kind: "completed"; receipt: E3S1UxCommitReceiptV1 }>
    | Readonly<{ kind: "unknown" }>
    | Readonly<{ kind: "in_progress" | "failed" }> {
    const transaction = this.db.transaction(() => {
      const prior = this.db.prepare("SELECT request_hash, state, owner_token_hash, receipt_json, receipt_hash, error_code, updated_at FROM e3_s1_executions WHERE idempotency_key=?").get(input.idempotencyKey) as ExecutionRow | undefined;
      if (prior) {
        if (prior.request_hash !== input.requestHash) throw new Error("e3_s1_idempotency_conflict");
        if (prior.state === "completed") {
          if (!prior.receipt_json || hashUtf8V1(prior.receipt_json) !== prior.receipt_hash) throw new Error("e3_s1_receipt_recovery_drift");
          return { kind: "completed" as const, receipt: JSON.parse(prior.receipt_json) as E3S1UxCommitReceiptV1 };
        }
        if (prior.state === "unknown") return { kind: "unknown" as const };
        if (prior.state === "failed") return { kind: "failed" as const };
        if (this.clock() - prior.updated_at >= E3_S1_COMMAND_LEDGER_V1.executionReservationTtlMs) {
          const changed = this.db.prepare("UPDATE e3_s1_executions SET state='unknown', owner_token_hash=NULL, error_code='reservation_expired_outcome_unknown', updated_at=? WHERE idempotency_key=? AND request_hash=? AND state='reserved'").run(
            this.clock(),
            input.idempotencyKey,
            input.requestHash
          );
          if (changed.changes !== 1) throw new Error("e3_s1_execution_recovery_cas_failed");
          return { kind: "unknown" as const };
        }
        return { kind: "in_progress" as const };
      }
      const leaseRow = this.db.prepare("SELECT lease_json, state FROM e3_s1_leases WHERE lease_id=?").get(input.lease.leaseId) as { lease_json: string; state: string } | undefined;
      if (!leaseRow || canonicalJsonV1(JSON.parse(leaseRow.lease_json)) !== canonicalJsonV1(input.lease)) throw new Error("e3_s1_lease_binding_invalid");
      if (leaseRow.state !== "issued") throw new Error("e3_s1_lease_consumed");
      const now = this.clock();
      if (now < Date.parse(input.lease.issuedAt) || now >= Date.parse(input.lease.expiresAt)) throw new Error("e3_s1_lease_expired");
      const ownerToken = this.nonce();
      this.db.prepare("UPDATE e3_s1_leases SET state='consumed', consumed_by=?, updated_at=? WHERE lease_id=? AND state='issued'").run(input.idempotencyKey, now, input.lease.leaseId);
      this.db.prepare("INSERT INTO e3_s1_executions VALUES (?, ?, ?, 'reserved', ?, NULL, NULL, NULL, ?, ?)").run(input.idempotencyKey, input.lease.leaseId, input.requestHash, hashUtf8V1(ownerToken), now, now);
      return { kind: "owner" as const, ownerToken };
    });
    return transaction();
  }

  private settle(input: Readonly<{
    idempotencyKey: string;
    requestHash: string;
    ownerToken: string;
    state: "completed" | "failed" | "unknown";
    receipt?: E3S1UxCommitReceiptV1;
    errorCode?: string;
  }>) {
    const receiptJson = input.receipt ? canonicalJsonV1(input.receipt) : null;
    const result = this.db.prepare(`UPDATE e3_s1_executions SET state=?, owner_token_hash=NULL, receipt_json=?, receipt_hash=?, error_code=?, updated_at=? WHERE idempotency_key=? AND request_hash=? AND state='reserved' AND owner_token_hash=?`).run(
      input.state,
      receiptJson,
      receiptJson ? hashUtf8V1(receiptJson) : null,
      input.errorCode ?? null,
      this.clock(),
      input.idempotencyKey,
      input.requestHash,
      hashUtf8V1(input.ownerToken)
    );
    if (result.changes !== 1) throw new Error("e3_s1_execution_settlement_cas_failed");
  }

  complete(input: Readonly<{ idempotencyKey: string; requestHash: string; ownerToken: string; receipt: E3S1UxCommitReceiptV1 }>) {
    this.settle({ ...input, state: "completed" });
  }
  markUnknown(input: Readonly<{ idempotencyKey: string; requestHash: string; ownerToken: string }>) {
    this.settle({ ...input, state: "unknown" });
  }
  fail(input: Readonly<{ idempotencyKey: string; requestHash: string; ownerToken: string; errorCode: string }>) {
    this.settle({ ...input, state: "failed" });
  }
  reconcileUnknown(input: Readonly<{ idempotencyKey: string; requestHash: string; receipt: E3S1UxCommitReceiptV1 }>) {
    const receiptJson = canonicalJsonV1(input.receipt);
    const result = this.db.prepare("UPDATE e3_s1_executions SET state='completed', receipt_json=?, receipt_hash=?, updated_at=? WHERE idempotency_key=? AND request_hash=? AND state='unknown'").run(receiptJson, hashUtf8V1(receiptJson), this.clock(), input.idempotencyKey, input.requestHash);
    if (result.changes !== 1) throw new Error("e3_s1_reconciliation_cas_failed");
  }
  reconcileUnknownWithSavedReadback(input: Readonly<{
    idempotencyKey: string;
    requestHash: string;
    receipt: E3S1UxCommitReceiptV1;
    pointer: E3S1UxCommitReceiptV1["after"];
    dataHash: string;
  }>) {
    return this.db.transaction(() => {
      const row = this.db.prepare("SELECT request_hash,state,receipt_json,receipt_hash FROM e3_s1_executions WHERE idempotency_key=?")
        .get(input.idempotencyKey) as Pick<ExecutionRow, "request_hash" | "state" | "receipt_json" | "receipt_hash"> | undefined;
      const receiptJson = canonicalJsonV1(input.receipt);
      const receiptHash = hashUtf8V1(receiptJson);
      const pointerJson = canonicalJsonV1(input.pointer);
      const readbackHash = browserAtomicFingerprintPort.fingerprint({ pointer: input.pointer, dataHash: input.dataHash });
      if (
        !row ||
        row.request_hash !== input.requestHash ||
        pointerJson !== canonicalJsonV1(input.receipt.after) ||
        readbackHash !== input.receipt.readbackHash
      ) throw new Error("e3_s1_saved_readback_terminal_mismatch");
      const prior = this.db.prepare("SELECT receipt_hash,readback_hash,pointer_json FROM e3_s1_saved_readbacks WHERE idempotency_key=?")
        .get(input.idempotencyKey) as { receipt_hash: string; readback_hash: string; pointer_json: string } | undefined;
      if (row.state === "completed") {
        if (
          row.receipt_json !== receiptJson ||
          row.receipt_hash !== receiptHash ||
          !prior ||
          prior.receipt_hash !== receiptHash ||
          prior.readback_hash !== readbackHash ||
          prior.pointer_json !== pointerJson
        ) throw new Error("e3_s1_saved_readback_conflict");
        return Object.freeze({ verified: true as const, replayed: true as const, readbackHash });
      }
      if (row.state !== "unknown" || prior) throw new Error("e3_s1_reconciliation_state_invalid");
      this.db.prepare("INSERT INTO e3_s1_saved_readbacks VALUES (?,?,?,?,?)").run(
        input.idempotencyKey,
        receiptHash,
        readbackHash,
        pointerJson,
        this.clock()
      );
      const changed = this.db.prepare("UPDATE e3_s1_executions SET state='completed',receipt_json=?,receipt_hash=?,error_code=NULL,updated_at=? WHERE idempotency_key=? AND request_hash=? AND state='unknown'")
        .run(receiptJson, receiptHash, this.clock(), input.idempotencyKey, input.requestHash);
      if (changed.changes !== 1) throw new Error("e3_s1_reconciliation_cas_failed");
      return Object.freeze({ verified: true as const, replayed: false as const, readbackHash });
    })();
  }
  verifySavedReadback(input: Readonly<{
    idempotencyKey: string;
    requestHash: string;
    receipt: E3S1UxCommitReceiptV1;
    pointer: E3S1UxCommitReceiptV1["after"];
    dataHash: string;
  }>) {
    const terminal = this.db.prepare("SELECT request_hash,state,receipt_json,receipt_hash FROM e3_s1_executions WHERE idempotency_key=?").get(input.idempotencyKey) as Pick<ExecutionRow, "request_hash" | "state" | "receipt_json" | "receipt_hash"> | undefined;
    const receiptJson = canonicalJsonV1(input.receipt);
    if (
      !terminal ||
      terminal.request_hash !== input.requestHash ||
      terminal.state !== "completed" ||
      terminal.receipt_json !== receiptJson ||
      terminal.receipt_hash !== hashUtf8V1(receiptJson) ||
      canonicalJsonV1(input.pointer) !== canonicalJsonV1(input.receipt.after)
    ) throw new Error("e3_s1_saved_readback_terminal_mismatch");
    const readbackHash = hashCanonicalJsonV1({ pointer: input.pointer, dataHash: input.dataHash });
    if (readbackHash !== input.receipt.readbackHash) throw new Error("e3_s1_saved_readback_hash_mismatch");
    const prior = this.db.prepare("SELECT receipt_hash,readback_hash,pointer_json FROM e3_s1_saved_readbacks WHERE idempotency_key=?").get(input.idempotencyKey) as { receipt_hash: string; readback_hash: string; pointer_json: string } | undefined;
    if (prior) {
      if (prior.receipt_hash !== terminal.receipt_hash || prior.readback_hash !== readbackHash || prior.pointer_json !== canonicalJsonV1(input.pointer)) {
        throw new Error("e3_s1_saved_readback_conflict");
      }
      return Object.freeze({ verified: true as const, replayed: true as const, readbackHash });
    }
    this.db.prepare("INSERT INTO e3_s1_saved_readbacks VALUES (?,?,?,?,?)").run(
      input.idempotencyKey,
      terminal.receipt_hash,
      readbackHash,
      canonicalJsonV1(input.pointer),
      this.clock()
    );
    return Object.freeze({ verified: true as const, replayed: false as const, readbackHash });
  }
  revokeLease(leaseId: string) {
    this.db.prepare("UPDATE e3_s1_leases SET state='revoked', updated_at=? WHERE lease_id=? AND state='issued'").run(this.clock(), leaseId);
  }
  close() { this.db.close(); }
}
