import type { CanvasDocumentStateV1, JsonValueV1 } from "./canvas-port";

export interface CanvasContextReadPortV1 {
  getDocumentState(input: { documentId: string }): Promise<CanvasDocumentStateV1>;
  getSelection(input: { documentId: string }): Promise<JsonValueV1>;
  getNodeRange(input: { documentId: string; nodeIds: string[] }): Promise<JsonValueV1>;
}

export type RunBoundCanvasReadIdentityV1 = Readonly<{
  workspaceId: string;
  sessionId: string;
  documentId: string;
  threadId: string;
  turnId: string;
  runId: string;
  mountId: string;
}>;

export type CanvasReadProvenanceV1 =
  | Readonly<{
      authority: "canvas_provider_canonical_readback";
      readMode: "live_provider";
      freshness: "provider_readback";
      observedAt: string;
      mountId: string;
      viewport: "desktop" | "tablet" | "mobile";
    }>
  | Readonly<{
      authority: "canvas_turn_bound_native_observation";
      readMode: "turn_bound_snapshot";
      freshness: "captured_at_turn_submit";
      observedAt: string;
      mountId: string;
      viewport: "desktop" | "tablet" | "mobile";
    }>;

/** Tool execution needs a stronger identity than the generic C4 context read
 * port. A turn-bound browser observation must never be selected by documentId
 * alone because concurrent Runs can target the same document. */
export interface RunBoundCanvasContextReadPortV1 {
  getBoundMountId(
    input: Omit<RunBoundCanvasReadIdentityV1, "mountId">
  ): Promise<string> | string;
  getDocumentState(input: RunBoundCanvasReadIdentityV1): Promise<CanvasDocumentStateV1>;
  getSelection(input: RunBoundCanvasReadIdentityV1): Promise<JsonValueV1>;
  getNodeRange(
    input: RunBoundCanvasReadIdentityV1 & { nodeIds: string[] }
  ): Promise<JsonValueV1>;
  getReadProvenance(
    input: RunBoundCanvasReadIdentityV1
  ): Promise<CanvasReadProvenanceV1> | CanvasReadProvenanceV1;
}

export class CanvasContextReadUnavailableErrorV1 extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "CanvasContextReadUnavailableErrorV1";
  }
}
