import { assertAtomicWritableTree } from "../atomic-writable-contract";
import type { PageFactComponentType } from "../page-fact-types";

type UnknownRecord = Record<string, unknown>;

type AtomicFactNode = {
  type: PageFactComponentType;
  props: UnknownRecord & {
    id: string;
    items?: AtomicFactNode[];
  };
};

export type AtomicDocumentGraphNode = Readonly<{
  id: string;
  type: PageFactComponentType;
  parentId: string | null;
  childIds: readonly string[];
  path: readonly (string | number)[];
  indexInParent: number | null;
  depth: number;
  props: Readonly<UnknownRecord>;
}>;

export type AtomicDocumentGraph = Readonly<{
  rootId: string;
  size: number;
  preorderIds: readonly string[];
  hasNode: (id: string) => boolean;
  getNode: (id: string) => AtomicDocumentGraphNode | null;
  getParent: (id: string) => AtomicDocumentGraphNode | null;
  getChildren: (id: string) => readonly AtomicDocumentGraphNode[];
  getAncestors: (id: string) => readonly AtomicDocumentGraphNode[];
  getDescendantIds: (id: string) => readonly string[];
  isDescendant: (id: string, ancestorId: string) => boolean;
}>;

export class AtomicDocumentGraphNodeNotFoundError extends Error {
  readonly nodeId: string;

  constructor(nodeId: string) {
    super(`Atomic document graph node ${nodeId} was not found.`);
    this.name = "AtomicDocumentGraphNodeNotFoundError";
    this.nodeId = nodeId;
  }
}

const cloneAndFreeze = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return Object.freeze(value.map((entry) => cloneAndFreeze(entry)));
  }
  if (value && typeof value === "object") {
    return Object.freeze(
      Object.fromEntries(
        Object.entries(value).map(([key, entry]) => [
          key,
          cloneAndFreeze(entry),
        ])
      )
    );
  }
  return value;
};

const freezeArray = <T>(values: T[]): readonly T[] => Object.freeze(values);

/**
 * Build an immutable, indexed read projection from the canonical seven-atom
 * fact tree. Validation completes before any graph state is allocated, so an
 * illegal fact/layout tree can never leak a partial projection.
 * This is a version-local snapshot, not a live view. Mutation commands must
 * address nodes by ID and must never cache or write through `path`.
 */
export const projectAtomicDocumentGraph = (
  value: unknown
): AtomicDocumentGraph => {
  assertAtomicWritableTree(value, "atomic-document-graph-projection");

  const document = value as { content: [AtomicFactNode] };
  const nodesById = new Map<string, AtomicDocumentGraphNode>();
  const preorderIds: string[] = [];

  const visit = (
    node: AtomicFactNode,
    parentId: string | null,
    path: readonly (string | number)[],
    indexInParent: number | null,
    depth: number
  ) => {
    const { items = [], ...sourceProps } = node.props;
    const childIds = freezeArray(items.map((item) => item.props.id));
    const graphNode: AtomicDocumentGraphNode = Object.freeze({
      id: node.props.id,
      type: node.type,
      parentId,
      childIds,
      path: freezeArray([...path]),
      indexInParent,
      depth,
      props: cloneAndFreeze(sourceProps) as Readonly<UnknownRecord>,
    });

    nodesById.set(graphNode.id, graphNode);
    preorderIds.push(graphNode.id);
    items.forEach((child, index) =>
      visit(
        child,
        graphNode.id,
        [...path, "props", "items", index],
        index,
        depth + 1
      )
    );
  };

  visit(document.content[0], null, ["content", 0], null, 0);

  const requireNode = (id: string) => {
    const node = nodesById.get(id);
    if (!node) throw new AtomicDocumentGraphNodeNotFoundError(id);
    return node;
  };

  const getNode = (id: string) => nodesById.get(id) ?? null;
  const getParent = (id: string) => {
    const node = requireNode(id);
    return node.parentId === null ? null : requireNode(node.parentId);
  };
  const getChildren = (id: string) =>
    freezeArray(requireNode(id).childIds.map((childId) => requireNode(childId)));
  const getAncestors = (id: string) => {
    const ancestors: AtomicDocumentGraphNode[] = [];
    let parent = getParent(id);
    while (parent) {
      ancestors.push(parent);
      parent = parent.parentId === null ? null : requireNode(parent.parentId);
    }
    return freezeArray(ancestors.reverse());
  };
  const getDescendantIds = (id: string) => {
    const descendants: string[] = [];
    const appendDescendants = (node: AtomicDocumentGraphNode) => {
      node.childIds.forEach((childId) => {
        descendants.push(childId);
        appendDescendants(requireNode(childId));
      });
    };
    appendDescendants(requireNode(id));
    return freezeArray(descendants);
  };
  const isDescendant = (id: string, ancestorId: string) => {
    let node = requireNode(id);
    requireNode(ancestorId);
    while (node.parentId !== null) {
      if (node.parentId === ancestorId) return true;
      node = requireNode(node.parentId);
    }
    return false;
  };

  return Object.freeze({
    rootId: document.content[0].props.id,
    size: nodesById.size,
    preorderIds: freezeArray([...preorderIds]),
    hasNode: (id: string) => nodesById.has(id),
    getNode,
    getParent,
    getChildren,
    getAncestors,
    getDescendantIds,
    isDescendant,
  });
};
