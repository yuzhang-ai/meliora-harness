import { resolveAtomicOwnLayoutMode } from "../atomic-layout-capabilities";
import {
  resolveAtomicResponsiveFrame,
  type AtomicLayoutDevice,
  type AtomicLayoutFrame,
  type AtomicResponsiveLayoutFrame,
} from "./atomic-layout-authored-values";
import {
  AtomicConstraintContractError,
  resolveAtomicConstraints,
  resolveConstrainedFreeChildFrameDetailed,
} from "./atomic-constraints";
import type {
  AtomicFreeConstraintFrameWrite,
  AtomicFreeConstraintScopeReceipt,
  AtomicFreeConstraintTreeReceipt,
  AtomicLayoutTreeIdentity,
} from "./atomic-layout-contract";
import type {
  AtomicDocumentGraph,
  AtomicDocumentGraphNode,
} from "./atomic-document-graph";
import { browserAtomicFingerprintPort } from "./atomic-document-version";

export type AtomicFreeConstraintTreePreviewInput = Readonly<{
  afterParent: AtomicLayoutFrame;
  beforeParent: AtomicLayoutFrame;
  device: AtomicLayoutDevice;
  graph: AtomicDocumentGraph;
  identity: AtomicLayoutTreeIdentity;
  triggerNodeId: string;
}>;

const frameFor = (
  node: AtomicDocumentGraphNode,
  device: AtomicLayoutDevice
): AtomicLayoutFrame => {
  const responsive = node.props.frame as
    | AtomicResponsiveLayoutFrame
    | undefined;
  if (!responsive?.desktop) {
    throw new AtomicConstraintContractError(
      "invalid_constraint_frame",
      `Atomic free constraint node ${node.id} has no authored frame.`
    );
  }
  return Object.freeze(resolveAtomicResponsiveFrame(responsive, device));
};

const boxFor = (frame: AtomicLayoutFrame) =>
  Object.freeze({
    height: frame.height,
    width: frame.width,
    x: frame.x,
    y: frame.y,
  });

/**
 * K4 C1-B's only recursive Free Layout constraint projection. It consumes
 * immutable gesture-start/authored facts and emits an auditable receipt; it
 * never reads DOM geometry, mutates facts, or feeds a previous preview back
 * into the constraint formulas.
 */
export const resolveAtomicFreeConstraintTreePreview = (
  input: AtomicFreeConstraintTreePreviewInput
): AtomicFreeConstraintTreeReceipt => {
  const trigger = input.graph.getNode(input.triggerNodeId);
  if (!trigger) {
    throw new AtomicConstraintContractError(
      "constraint_trigger_stale",
      `Atomic free constraint trigger ${input.triggerNodeId} is outside the current graph.`
    );
  }
  if (trigger.type !== "BlankCanvas" && trigger.type !== "ContainerElement") {
    throw new AtomicConstraintContractError(
      "constraint_trigger_invalid",
      "Atomic free constraint trigger must be a layout scope."
    );
  }
  if (resolveAtomicOwnLayoutMode(trigger.type, trigger.props) !== "free") {
    throw new AtomicConstraintContractError(
      "constraint_trigger_not_free",
      "Atomic free constraint trigger must currently own Free Layout."
    );
  }

  const scopes: AtomicFreeConstraintScopeReceipt[] = [];
  const writes: AtomicFreeConstraintFrameWrite[] = [];
  const writtenNodeIds = new Set<string>();

  const visit = ({
    afterParent,
    beforeParent,
    depth,
    parent,
  }: {
    afterParent: AtomicLayoutFrame;
    beforeParent: AtomicLayoutFrame;
    depth: number;
    parent: AtomicDocumentGraphNode;
  }) => {
    if (resolveAtomicOwnLayoutMode(parent.type, parent.props) !== "free")
      return;
    const children = input.graph.getChildren(parent.id);
    scopes.push(
      Object.freeze({
        afterBox: boxFor(afterParent),
        beforeBox: boxFor(beforeParent),
        directChildIds: Object.freeze(children.map(({ id }) => id)),
        scopeId: parent.id,
      })
    );

    children.forEach((child) => {
      if (writtenNodeIds.has(child.id)) {
        throw new AtomicConstraintContractError(
          "constraint_writer_conflict",
          `Atomic free constraint writer duplicated ${child.id}.`
        );
      }
      writtenNodeIds.add(child.id);
      const beforeFrame = frameFor(child, input.device);
      const constraints = resolveAtomicConstraints(
        child.props.constraints,
        input.device
      );
      const resolution = resolveConstrainedFreeChildFrameDetailed({
        afterParent,
        beforeChild: beforeFrame,
        beforeParent,
        constraints,
      });
      writes.push(
        Object.freeze({
          afterFrame: resolution.frame,
          beforeFrame,
          clampedAxes: resolution.clampedAxes,
          depth,
          horizontal: constraints.horizontal,
          nodeId: child.id,
          parentId: parent.id,
          vertical: constraints.vertical,
        })
      );

      if (
        child.type === "ContainerElement" &&
        resolveAtomicOwnLayoutMode(child.type, child.props) === "free" &&
        (beforeFrame.width !== resolution.frame.width ||
          beforeFrame.height !== resolution.frame.height)
      ) {
        visit({
          afterParent: resolution.frame,
          beforeParent: beforeFrame,
          depth: depth + 1,
          parent: child,
        });
      }
    });
  };

  visit({
    afterParent: input.afterParent,
    beforeParent: input.beforeParent,
    depth: 1,
    parent: trigger,
  });

  const frozenScopes = Object.freeze(scopes);
  const frozenWrites = Object.freeze(writes);
  const constraintReceiptId = browserAtomicFingerprintPort.fingerprint({
    identity: input.identity,
    kind: "atomic-free-constraints-v1",
    scopes: frozenScopes,
    triggerNodeId: input.triggerNodeId,
    writes: frozenWrites,
  });
  return Object.freeze({
    constraintReceiptId,
    identity: input.identity,
    kind: "atomic-free-constraints-v1" as const,
    scopes: frozenScopes,
    triggerNodeId: input.triggerNodeId,
    writes: frozenWrites,
  });
};
