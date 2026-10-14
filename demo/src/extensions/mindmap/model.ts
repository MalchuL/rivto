/** A mindmap owns a flat tree so depth never depends on recursive serialization. */
export interface MindmapNode {
  /** Stable node identity local to this mindmap, distinct from the element ID. */
  readonly id: string;
  /** Parent node identity; exactly one node in a validated tree has null. */
  readonly parentId: string | null;
  /** Visible node text; empty labels are accepted. */
  readonly label: string;
}

/** Node width in natural SVG layout units before scaling to the element frame. */
export const NODE_WIDTH = 160;
/** Node height in natural SVG layout units before scaling to the element frame. */
export const NODE_HEIGHT = 40;
const COLUMN_GAP = 64;
const ROW_GAP = 20;
const PADDING = 24;

/**
 * Validates a single rooted tree without limiting its depth or number of branches.
 * @param value - Persisted nodes from element props or a clipboard snapshot.
 * @returns The original validated flat array without cloning or mutation; treat it as read-only.
 * @throws For malformed nodes, duplicate IDs, missing parents, cycles, or multiple roots.
 */
export function readMindmapNodes(value: unknown): readonly MindmapNode[] {
  if (!Array.isArray(value) || !value.length) throw new Error('Mindmap requires a root');
  const nodes = value as MindmapNode[];
  const byId = new Map<string, MindmapNode>();
  const children = new Map<string, string[]>();
  let root: MindmapNode | undefined;
  for (const node of nodes) {
    if (!node || typeof node.id !== 'string' || !node.id || typeof node.label !== 'string'
      || (node.parentId !== null && typeof node.parentId !== 'string') || byId.has(node.id)) throw new Error('Invalid mindmap node');
    byId.set(node.id, node);
    if (node.parentId === null) {
      if (root) throw new Error('Mindmap requires exactly one root');
      root = node;
    } else {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node.id);
      children.set(node.parentId, siblings);
    }
  }
  if (!root) throw new Error('Mindmap requires a root');
  const pending = [root.id];
  const visited = new Set<string>();
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) throw new Error('Mindmap contains a cycle');
    visited.add(id);
    for (const child of children.get(id) ?? []) pending.push(child);
  }
  if (visited.size !== nodes.length) throw new Error('Mindmap has missing parents or a disconnected cycle');
  return nodes;
}

/**
 * Lays out a tree from left to right in linear time using explicit stacks.
 * @param nodes - Validated single rooted tree in sibling insertion order.
 * @returns Natural SVG bounds and copied nodes with top-left x/y positions in layout units;
 * neither document nor input is mutated. The renderer scales these bounds to the element frame.
 * Input must already satisfy readMindmapNodes; this layout function does not validate it.
 */
export function layoutMindmap(nodes: readonly MindmapNode[]) {
  const children = new Map<string, MindmapNode[]>();
  let root = nodes[0]!;
  for (const node of nodes) {
    if (node.parentId === null) root = node;
    else {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node);
      children.set(node.parentId, siblings);
    }
  }
  const ordered: Array<{ node: MindmapNode; depth: number }> = [];
  const pending = [{ node: root, depth: 0 }];
  let maxDepth = 0;
  while (pending.length) {
    const entry = pending.pop()!;
    ordered.push(entry);
    maxDepth = Math.max(maxDepth, entry.depth);
    const descendants = children.get(entry.node.id) ?? [];
    for (let i = descendants.length - 1; i >= 0; i--) pending.push({ node: descendants[i]!, depth: entry.depth + 1 });
  }
  const heights = new Map<string, number>();
  for (let i = ordered.length - 1; i >= 0; i--) {
    const { node } = ordered[i]!;
    const descendants = children.get(node.id) ?? [];
    let height = 0;
    for (const child of descendants) height += heights.get(child.id)! + ROW_GAP;
    heights.set(node.id, Math.max(NODE_HEIGHT, height - ROW_GAP));
  }
  const tops = new Map([[root.id, PADDING]]);
  const positioned = ordered.map(({ node, depth }) => {
    const top = tops.get(node.id)!;
    let offset = top;
    for (const child of children.get(node.id) ?? []) {
      tops.set(child.id, offset);
      offset += heights.get(child.id)! + ROW_GAP;
    }
    return { ...node, x: PADDING + depth * (NODE_WIDTH + COLUMN_GAP), y: top + (heights.get(node.id)! - NODE_HEIGHT) / 2 };
  });
  return { nodes: positioned, width: PADDING * 2 + NODE_WIDTH + maxDepth * (NODE_WIDTH + COLUMN_GAP), height: PADDING * 2 + heights.get(root.id)! };
}
