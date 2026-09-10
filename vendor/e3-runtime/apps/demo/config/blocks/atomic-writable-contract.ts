import {
  assertAtomicFactTree,
  type AtomicFactTreeError,
} from "./atomic-contract";
import {
  inspectAtomicLayoutTree,
  type AtomicLayoutViolation,
} from "./atomic-layout-capabilities";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export class AtomicLayoutTreeError extends Error {
  readonly violations: AtomicLayoutViolation[];

  constructor(phase: string, violations: AtomicLayoutViolation[]) {
    super(
      `Atomic layout validation failed during ${phase}: ${violations
        .map(({ path, decision }) => `${path}: ${decision}`)
        .join("; ")}`
    );
    this.name = "AtomicLayoutTreeError";
    this.violations = violations;
  }
}

/**
 * The only writable Editor UX boundary. Page identity and layout legality are
 * validated together so Store, History, Preview, Save and Publish cannot
 * disagree about whether a page fact is writable.
 */
export const assertAtomicWritableTree = (value: unknown, phase: string) => {
  assertAtomicFactTree(value, phase);
  const violations = inspectAtomicLayoutTree(value);
  if (violations.length > 0) throw new AtomicLayoutTreeError(phase, violations);
};

const replaceNodeProps = (
  value: unknown,
  componentId: string,
  nextProps: UnknownRecord
): { changed: boolean; value: unknown } => {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const result = replaceNodeProps(entry, componentId, nextProps);
      changed ||= result.changed;
      return result.value;
    });
    return { changed, value: changed ? next : value };
  }
  if (!isRecord(value)) return { changed: false, value };

  if (isRecord(value.props) && value.props.id === componentId) {
    return { changed: true, value: { ...value, props: nextProps } };
  }

  let changed = false;
  const nextEntries = Object.entries(value).map(([key, entry]) => {
    const result = replaceNodeProps(entry, componentId, nextProps);
    changed ||= result.changed;
    return [key, result.value] as const;
  });
  return {
    changed,
    value: changed ? Object.fromEntries(nextEntries) : value,
  };
};

/** Build a prospective full tree before dispatching a component replacement. */
export const replaceAtomicComponentPropsInTree = <T>(
  value: T,
  componentId: string,
  nextProps: UnknownRecord
): T => {
  const result = replaceNodeProps(value, componentId, nextProps);
  if (!result.changed) {
    throw new Error(`Atomic component ${componentId} was not found.`);
  }
  return result.value as T;
};

const insertNodeIntoParent = (
  value: unknown,
  parentId: string,
  node: UnknownRecord,
  destinationIndex: number
): { changed: boolean; value: unknown } => {
  if (Array.isArray(value)) {
    let changed = false;
    const next = value.map((entry) => {
      const result = insertNodeIntoParent(
        entry,
        parentId,
        node,
        destinationIndex
      );
      changed ||= result.changed;
      return result.value;
    });
    return { changed, value: changed ? next : value };
  }
  if (!isRecord(value)) return { changed: false, value };

  if (isRecord(value.props) && value.props.id === parentId) {
    const items = Array.isArray(value.props.items) ? value.props.items : [];
    const index = Math.max(0, Math.min(destinationIndex, items.length));
    return {
      changed: true,
      value: {
        ...value,
        props: {
          ...value.props,
          items: [...items.slice(0, index), node, ...items.slice(index)],
        },
      },
    };
  }

  let changed = false;
  const nextEntries = Object.entries(value).map(([key, entry]) => {
    const result = insertNodeIntoParent(
      entry,
      parentId,
      node,
      destinationIndex
    );
    changed ||= result.changed;
    return [key, result.value] as const;
  });
  return {
    changed,
    value: changed ? Object.fromEntries(nextEntries) : value,
  };
};

/** Build a prospective full tree before dispatching a nested atomic insert. */
export const insertAtomicComponentInTree = <T>(
  value: T,
  parentId: string,
  node: UnknownRecord,
  destinationIndex: number
): T => {
  const result = insertNodeIntoParent(
    value,
    parentId,
    node,
    destinationIndex
  );
  if (!result.changed) throw new Error(`Atomic parent ${parentId} was not found.`);
  return result.value as T;
};

export type RemovedAtomicComponent<T = UnknownRecord> = Readonly<{
  index: number;
  nextData: T;
  parentId: string;
  removedNode: UnknownRecord;
}>;

/** Remove one complete non-root atomic subtree while preserving its exact inverse. */
export const removeAtomicComponentFromTree = <T>(
  value: T,
  componentId: string
): RemovedAtomicComponent<T> => {
  const removeFromItems = (
    candidate: unknown
  ):
    | Readonly<{
        changed: false;
        value: unknown;
      }>
    | Readonly<{
        changed: true;
        index: number;
        parentId: string;
        removedNode: UnknownRecord;
        value: unknown;
      }> => {
    if (Array.isArray(candidate)) {
      for (let index = 0; index < candidate.length; index += 1) {
        const entry = candidate[index];
        if (!isRecord(entry)) continue;
        const result = removeFromItems(entry);
        if (result.changed) {
          return {
            ...result,
            value: [
              ...candidate.slice(0, index),
              result.value,
              ...candidate.slice(index + 1),
            ],
          };
        }
      }
      return { changed: false, value: candidate };
    }
    if (!isRecord(candidate)) return { changed: false, value: candidate };
    if (isRecord(candidate.props) && Array.isArray(candidate.props.items)) {
      const items = candidate.props.items;
      const index = items.findIndex(
        (item) =>
          isRecord(item) && isRecord(item.props) && item.props.id === componentId
      );
      if (index >= 0) {
        const parentId = candidate.props.id;
        if (typeof parentId !== "string" || !parentId.trim()) {
          throw new Error("Atomic parent identity is missing during remove.");
        }
        const removedNode = items[index];
        if (!isRecord(removedNode)) {
          throw new Error(`Atomic component ${componentId} is malformed.`);
        }
        return {
          changed: true,
          index,
          parentId,
          removedNode,
          value: {
            ...candidate,
            props: {
              ...candidate.props,
              items: [...items.slice(0, index), ...items.slice(index + 1)],
            },
          },
        };
      }
    }
    for (const [key, entry] of Object.entries(candidate)) {
      const result = removeFromItems(entry);
      if (result.changed) {
        return { ...result, value: { ...candidate, [key]: result.value } };
      }
    }
    return { changed: false, value: candidate };
  };

  const result = removeFromItems(value);
  if (!result.changed) {
    throw new Error(
      `Atomic component ${componentId} was not found under an atomic parent.`
    );
  }
  return {
    index: result.index,
    nextData: result.value as T,
    parentId: result.parentId,
    removedNode: structuredClone(result.removedNode),
  };
};

export const cloneAtomicSubtreeWithFreshIds = (
  value: unknown,
  createId: (componentType: string) => string
): unknown => {
  if (Array.isArray(value)) {
    return value.map((entry) =>
      cloneAtomicSubtreeWithFreshIds(entry, createId)
    );
  }
  if (!isRecord(value)) return value;
  const componentType = typeof value.type === "string" ? value.type : null;
  const props = isRecord(value.props)
    ? {
        ...value.props,
        ...(componentType && typeof value.props.id === "string"
          ? { id: createId(componentType) }
          : {}),
      }
    : null;
  const entries = Object.entries(props ? { ...value, props } : value).map(
    ([key, entry]) => [
      key,
      key === "id" && props
        ? entry
        : cloneAtomicSubtreeWithFreshIds(entry, createId),
    ]
  );
  return Object.fromEntries(entries);
};

/** Build the exact structural equivalent of Core duplicate before dispatch. */
export const duplicateAtomicComponentInTree = <T>(
  value: T,
  componentId: string,
  createId: (componentType: string) => string
): T => {
  const duplicateInArray = (candidate: unknown): { changed: boolean; value: unknown } => {
    if (Array.isArray(candidate)) {
      const index = candidate.findIndex(
        (entry) => isRecord(entry) && isRecord(entry.props) && entry.props.id === componentId
      );
      if (index >= 0) {
        const clone = cloneAtomicSubtreeWithFreshIds(candidate[index], createId);
        return {
          changed: true,
          value: [...candidate.slice(0, index + 1), clone, ...candidate.slice(index + 1)],
        };
      }
      let changed = false;
      const next = candidate.map((entry) => {
        const result = duplicateInArray(entry);
        changed ||= result.changed;
        return result.value;
      });
      return { changed, value: changed ? next : candidate };
    }
    if (!isRecord(candidate)) return { changed: false, value: candidate };
    let changed = false;
    const nextEntries = Object.entries(candidate).map(([key, entry]) => {
      const result = duplicateInArray(entry);
      changed ||= result.changed;
      return [key, result.value] as const;
    });
    return { changed, value: changed ? Object.fromEntries(nextEntries) : candidate };
  };
  const result = duplicateInArray(value);
  if (!result.changed) {
    throw new Error(`Atomic component ${componentId} was not found for duplicate.`);
  }
  return result.value as T;
};

export type AtomicWritableTreeError =
  | AtomicFactTreeError
  | AtomicLayoutTreeError;
