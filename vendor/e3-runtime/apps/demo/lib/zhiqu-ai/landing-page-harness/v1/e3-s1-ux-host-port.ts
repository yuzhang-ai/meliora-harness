import type {
  AtomicCommandBatch,
  AtomicCommandTransaction,
  AtomicValidationReceipt,
} from "../../../../config/blocks/editor-kernel/atomic-command-transaction";
import {
  applyAtomicUpdatePropsOperations,
  commitAtomicCommandPreview,
  previewAtomicCommandBatch,
} from "../../../../config/blocks/editor-kernel/atomic-command-transaction";
import {
  assertAtomicDocumentPointer,
  browserAtomicFingerprintPort,
  cloneAndDeepFreeze,
  createAtomicDocumentSnapshot,
  type AtomicDocumentPointer,
  type AtomicDocumentSnapshot,
} from "../../../../config/blocks/editor-kernel/atomic-document-version";

export type E3S1UxCommitReceiptV1 = Readonly<{
  contractVersion: "formal-r3-e3-s1-ux-commit-receipt-v1";
  idempotencyKey: string;
  outcome: "committed";
  transactionId: string;
  before: AtomicDocumentPointer;
  after: AtomicDocumentPointer;
  validationReceipt: AtomicValidationReceipt;
  createdIds: readonly string[];
  affectedIds: readonly string[];
  readbackHash: string;
}>;

export type E3S1UxUnknownReceiptV1 = Readonly<{
  contractVersion: "formal-r3-e3-s1-ux-unknown-receipt-v1";
  idempotencyKey: string;
  outcome: "unknown";
  before: AtomicDocumentPointer;
}>;

export interface E3S1UxHostPortV1<T = unknown> {
  capture(): AtomicDocumentSnapshot<T>;
  commit(input: Readonly<{
    idempotencyKey: string;
    expectedBase: AtomicDocumentPointer;
    batch: AtomicCommandBatch;
  }>): E3S1UxCommitReceiptV1 | E3S1UxUnknownReceiptV1;
  reconcile(idempotencyKey: string): E3S1UxCommitReceiptV1 | null;
  undo(): AtomicDocumentSnapshot<T>;
  redo(): AtomicDocumentSnapshot<T>;
  save(): Readonly<{ savedHash: string; pointer: AtomicDocumentPointer }>;
  reload(): AtomicDocumentSnapshot<T>;
}

export class MemoryE3S1UxHostV1<T> implements E3S1UxHostPortV1<T> {
  private current: AtomicDocumentSnapshot<T>;
  private savedData: T;
  private readonly committed = new Map<string, E3S1UxCommitReceiptV1>();
  private readonly past: AtomicCommandTransaction[] = [];
  private readonly future: AtomicCommandTransaction[] = [];
  private unknownAfterCommit = false;

  constructor(initial: AtomicDocumentSnapshot<T>) {
    this.current = initial;
    this.savedData = structuredClone(initial.data);
  }

  injectUnknownAfterNextCommit() {
    this.unknownAfterCommit = true;
  }

  capture() {
    return createAtomicDocumentSnapshot(
      structuredClone(this.current.data),
      this.current.pointer.revision
    );
  }

  commit(input: Readonly<{
    idempotencyKey: string;
    expectedBase: AtomicDocumentPointer;
    batch: AtomicCommandBatch;
  }>) {
    const prior = this.committed.get(input.idempotencyKey);
    if (prior) return prior;
    assertAtomicDocumentPointer(input.expectedBase, this.current.pointer);
    const preview = previewAtomicCommandBatch(this.current, input.batch);
    const result = commitAtomicCommandPreview(this.current, preview);
    if (result.kind !== "committed") {
      throw new Error("e3_s1_ux_host_noop_forbidden");
    }
    this.current = result.snapshot;
    this.past.push(result.transaction);
    this.future.length = 0;
    const readback = this.capture();
    assertAtomicDocumentPointer(result.snapshot.pointer, readback.pointer);
    const receipt = cloneAndDeepFreeze({
      contractVersion: "formal-r3-e3-s1-ux-commit-receipt-v1" as const,
      idempotencyKey: input.idempotencyKey,
      outcome: "committed" as const,
      transactionId: result.transaction.transactionId,
      before: result.transaction.before,
      after: result.transaction.after,
      validationReceipt: result.transaction.validationReceipt,
      createdIds: result.transaction.validationReceipt.topology.createdIds,
      affectedIds: result.transaction.affectedIds,
      readbackHash: browserAtomicFingerprintPort.fingerprint({
        pointer: readback.pointer,
        dataHash: browserAtomicFingerprintPort.fingerprint(readback.data),
      }),
    });
    this.committed.set(input.idempotencyKey, receipt);
    if (this.unknownAfterCommit) {
      this.unknownAfterCommit = false;
      return cloneAndDeepFreeze({
        contractVersion: "formal-r3-e3-s1-ux-unknown-receipt-v1" as const,
        idempotencyKey: input.idempotencyKey,
        outcome: "unknown" as const,
        before: input.expectedBase,
      });
    }
    return receipt;
  }

  reconcile(idempotencyKey: string) {
    return this.committed.get(idempotencyKey) ?? null;
  }

  undo() {
    const transaction = this.past.pop();
    if (!transaction) throw new Error("e3_s1_ux_host_undo_empty");
    const data = applyAtomicUpdatePropsOperations(
      this.current.data,
      transaction.inverse
    ) as T;
    this.future.push(transaction);
    this.current = createAtomicDocumentSnapshot(
      data,
      this.current.pointer.revision + 1
    );
    return this.capture();
  }

  redo() {
    const transaction = this.future.pop();
    if (!transaction) throw new Error("e3_s1_ux_host_redo_empty");
    const data = applyAtomicUpdatePropsOperations(
      this.current.data,
      transaction.forward
    ) as T;
    this.past.push(transaction);
    this.current = createAtomicDocumentSnapshot(
      data,
      this.current.pointer.revision + 1
    );
    return this.capture();
  }

  save() {
    this.savedData = structuredClone(this.current.data);
    return cloneAndDeepFreeze({
      savedHash: browserAtomicFingerprintPort.fingerprint(this.savedData),
      pointer: this.current.pointer,
    });
  }

  reload() {
    this.current = createAtomicDocumentSnapshot(
      structuredClone(this.savedData),
      this.current.pointer.revision
    );
    return this.capture();
  }
}
