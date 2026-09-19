export const LIVE_SESSION_KEY = "meliora-live-run-v1";

export type SavedLiveSession =
  | Readonly<{ kind: "run"; workspaceId: string; runId: string }>
  | Readonly<{ kind: "pending"; workspaceId: string; idempotencyKey: string }>;

const validId = (value: unknown): value is string =>
  typeof value === "string" && value.length > 0 && value.length <= 200
  && /^[A-Za-z0-9][A-Za-z0-9._:-]*$/u.test(value);

export function parseLiveSession(raw: string | null): SavedLiveSession | null {
  if (!raw || raw.length > 1_000) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
    const record = value as Record<string, unknown>;
    if (!validId(record.workspaceId)) return null;
    if (record.kind === "run"
      && Object.keys(record).sort().join("\u0000") === "kind\u0000runId\u0000workspaceId"
      && validId(record.runId)) return { kind: "run", workspaceId: record.workspaceId, runId: record.runId };
    if (record.kind === "pending"
      && Object.keys(record).sort().join("\u0000") === "idempotencyKey\u0000kind\u0000workspaceId"
      && validId(record.idempotencyKey)) return { kind: "pending", workspaceId: record.workspaceId, idempotencyKey: record.idempotencyKey };
    return null;
  } catch { return null; }
}

export function readLiveSession(storage: Pick<Storage, "getItem">): SavedLiveSession | null {
  try { return parseLiveSession(storage.getItem(LIVE_SESSION_KEY)); }
  catch { return null; }
}

export function saveLiveSession(storage: Pick<Storage, "getItem" | "setItem">, value: SavedLiveSession): boolean {
  if (!validId(value.workspaceId) || !validId(value.kind === "run" ? value.runId : value.idempotencyKey)) return false;
  try {
    const encoded = JSON.stringify(value);
    storage.setItem(LIVE_SESSION_KEY, encoded);
    return storage.getItem(LIVE_SESSION_KEY) === encoded;
  } catch { return false; }
}
