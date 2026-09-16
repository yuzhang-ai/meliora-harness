import type { PublicRunEvent } from "../../../packages/agent-runtime/public-events";
import type { PublicRunResumeSnapshot } from "../../../packages/agent-runtime/public-run-resume-snapshot";

export type LiveRunPhase =
  | "idle"
  | "submitting"
  | "resuming"
  | "connecting"
  | "live"
  | "disconnected"
  | "terminal"
  | "error";

export type LiveRunIdentity = Readonly<{ sessionId: string; runId: string }>;

export type LiveRunState = Readonly<{
  phase: LiveRunPhase;
  identity: LiveRunIdentity | null;
  events: readonly PublicRunEvent[];
  cursor: number;
  reconnectCount: number;
  errorCode: string | null;
}>;

export const initialLiveRunState = (): LiveRunState => ({
  phase: "idle",
  identity: null,
  events: [],
  cursor: 0,
  reconnectCount: 0,
  errorCode: null,
});

export type LiveRunAction =
  | Readonly<{ type: "submit_requested" }>
  | Readonly<{ type: "command_accepted"; identity: LiveRunIdentity }>
  | Readonly<{ type: "reconnect_requested" }>
  | Readonly<{ type: "resume_requested"; runId: string }>
  | Readonly<{ type: "resume_loaded"; snapshot: PublicRunResumeSnapshot }>
  | Readonly<{ type: "stream_opened" }>
  | Readonly<{ type: "event_received"; event: PublicRunEvent }>
  | Readonly<{ type: "stream_closed" }>
  | Readonly<{ type: "failed"; code: string }>;

export class LiveRunStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LiveRunStateError";
  }
}

export const isTerminalPublicEvent = (event: PublicRunEvent): boolean =>
  event.kind === "run_blocked" || event.kind === "run_completed"
  || event.kind === "run_failed" || event.kind === "run_cancelled";

const expectPhase = (state: LiveRunState, allowed: readonly LiveRunPhase[], action: string): void => {
  if (!allowed.includes(state.phase)) throw new LiveRunStateError(`${action} is invalid while ${state.phase}.`);
};

export function reduceLiveRun(state: LiveRunState, action: LiveRunAction): LiveRunState {
  switch (action.type) {
    case "submit_requested":
      expectPhase(state, ["idle", "error", "terminal"], action.type);
      return { ...initialLiveRunState(), phase: "submitting" };
    case "command_accepted":
      expectPhase(state, ["submitting"], action.type);
      return { ...state, phase: "connecting", identity: action.identity, errorCode: null };
    case "reconnect_requested":
      expectPhase(state, ["disconnected", "error"], action.type);
      if (!state.identity) throw new LiveRunStateError("reconnect requires a run identity.");
      return { ...state, phase: "connecting", reconnectCount: state.reconnectCount + 1, errorCode: null };
    case "resume_requested":
      expectPhase(state, ["idle", "connecting", "live", "disconnected", "error", "terminal"], action.type);
      if (state.identity && state.identity.runId !== action.runId) throw new LiveRunStateError("resume runId changed.");
      return {
        ...state,
        phase: "resuming",
        errorCode: null,
      };
    case "resume_loaded": {
      expectPhase(state, ["resuming", "connecting"], action.type);
      if (state.identity && state.identity.runId !== action.snapshot.runId) throw new LiveRunStateError("snapshot runId changed.");
      const last = action.snapshot.events.at(-1);
      return {
        ...state,
        phase: last && isTerminalPublicEvent(last) ? "terminal" : "connecting",
        identity: { sessionId: action.snapshot.sessionId, runId: action.snapshot.runId },
        events: [...action.snapshot.events],
        cursor: last?.sequence ?? 0,
        errorCode: null,
      };
    }
    case "stream_opened":
      expectPhase(state, ["connecting", "disconnected"], action.type);
      if (!state.identity) throw new LiveRunStateError("stream requires a run identity.");
      return { ...state, phase: "live", errorCode: null };
    case "event_received": {
      expectPhase(state, ["live"], action.type);
      if (!state.identity || action.event.runId !== state.identity.runId || action.event.sessionId !== state.identity.sessionId) {
        throw new LiveRunStateError("event scope changed.");
      }
      if (action.event.sequence <= state.cursor) throw new LiveRunStateError("event sequence did not advance.");
      return {
        ...state,
        phase: isTerminalPublicEvent(action.event) ? "terminal" : "live",
        events: [...state.events, action.event],
        cursor: action.event.sequence,
      };
    }
    case "stream_closed":
      expectPhase(state, ["live", "terminal"], action.type);
      return state.phase === "terminal" ? state : { ...state, phase: "disconnected" };
    case "failed":
      return { ...state, phase: "error", errorCode: action.code };
  }
}
