import type { NormalizedSelection } from "../../selection-manager";
import type { Block, BlockInput, Link } from "../../../store/document-model";
import type { ClipboardBundle } from "../types";

/**
 * Detached clipboard data after every persisted identity has been remapped.
 *
 * The shape separates children of the first copied block because text-merging
 * paste reuses the destination block ID instead of inserting that first root.
 */
export interface RemappedClipboardBundle {
  /** New root blocks inserted after the destination block. */
  blocks: BlockInput[];
  /** Children formerly owned by a first root whose ID is being reused. */
  firstChildren: BlockInput[];
  /** Links rebuilt with fresh IDs and remapped block endpoints. */
  links: Link[];
}

/**
 * Flattens a detached block forest in pre-order depth-first document order.
 *
 * Parents always appear before descendants and sibling order is retained. The
 * returned array contains the original detached block objects; it does not
 * clone or mutate them.
 *
 * @param blocks - Root blocks of the detached forest to traverse.
 * @returns Every root and descendant in portable document order.
 */
export function flattenBlocks(blocks: Block[]): Block[] {
  return blocks.flatMap((block) => [block, ...flattenBlocks(block.children)]);
}

/**
 * Deep-clones one portable block subtree.
 *
 * Copy preparation trims text at selection boundaries. Cloning prevents those
 * changes from mutating document snapshots or sharing mutable props, plugin
 * data, layout, and child arrays with the source.
 *
 * @param block - Detached source block to clone.
 * @returns An identity-preserving deep clone safe for clipboard modification.
 */
function cloneBlock(block: Block): Block {
  return {
    ...block,
    props: { ...block.props },
    pluginData: { ...block.pluginData },
    layout: block.layout ? { ...block.layout } : undefined,
    children: block.children.map(cloneBlock),
  };
}

/**
 * Finds a block inside a detached forest by its stable document ID.
 *
 * @param blocks - Roots to search recursively in document order.
 * @param id - Stable block ID to locate.
 * @returns The matching detached block, or undefined when it is absent.
 */
export function findBlock(blocks: Block[], id: string): Block | undefined {
  for (const block of blocks) {
    if (block.id === id) return block;
    const child = findBlock(block.children, id);
    if (child) return child;
  }
  return undefined;
}

/**
 * Builds a child-ID to direct-parent-ID lookup for a detached forest.
 *
 * @param blocks - Roots whose complete descendants should be indexed.
 * @param parents - Accumulator used by recursive calls.
 * @returns The supplied map populated for every non-root block.
 */
function indexParents(blocks: Block[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

/**
 * Produces the minimum set of copied roots for a normalized selection.
 *
 * If both a parent and descendant are selected, only the parent is returned
 * because its subtree already carries the descendant. Whole-block copy retains
 * all descendants of selected roots. Mixed text/block copy retains only
 * descendants explicitly covered by the normalized range.
 *
 * @param document - Complete detached document roots used to resolve ancestry.
 * @param range - Normalized selected blocks and text boundaries.
 * @param wholeBlocks - Whether selected roots carry their complete subtrees.
 * @returns Independent cloned roots in document order without duplicates.
 */
export function selectedTopLevelSubtrees(
  document: Block[],
  range: NormalizedSelection,
  wholeBlocks: boolean,
): Block[] {
  const selectedIds = new Set(range.blocks.map((block) => block.id));
  const parents = indexParents(document);
  const cloneSelection = (block: Block): Block => ({
    ...cloneBlock(block),
    children: block.children.filter((child) => selectedIds.has(child.id)).map(cloneSelection),
  });
  return range.blocks.filter((block) => {
    let parent = parents.get(block.id);
    while (parent) {
      if (selectedIds.has(parent)) return false;
      parent = parents.get(parent);
    }
    return true;
  }).map(wholeBlocks ? cloneBlock : cloneSelection);
}

/**
 * Escapes user-authored text before embedding it in the `text/html` flavor.
 *
 * This is not a Markdown renderer. It only prevents block content from becoming
 * active or malformed HTML when copied into another application.
 *
 * @param value - Raw persisted block content.
 * @returns Text with HTML-significant characters replaced by entities.
 */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

/**
 * Re-identifies every block and link in an incoming clipboard bundle.
 *
 * Clipboard IDs belong to the source document and cannot be inserted directly.
 * Root layout coordinates are offset by 24px so pasted edgeless objects do not
 * exactly cover their originals. When `firstTargetId` is supplied, the first
 * copied root maps to the existing text target and is therefore omitted from
 * `blocks`; its children are returned separately for attachment to that target.
 *
 * @param bundle - Structured clipboard hierarchy to validate and remap.
 * @param firstTargetId - Existing destination ID reused for the first root.
 * @returns Fresh block inputs, detached first-root children, and remapped links.
 * @throws When the clipboard schema version or required arrays are unsupported.
 */
export function remapClipboardBundle(
  bundle: ClipboardBundle,
  firstTargetId?: string,
): RemappedClipboardBundle {
  if (bundle.version !== 1 || !Array.isArray(bundle.blocks) || !Array.isArray(bundle.links)) {
    throw new Error("Unsupported Rivto clipboard payload");
  }

  const idMap = new Map<string, string>();
  const remap = (block: Block): BlockInput => {
    const id = crypto.randomUUID();
    idMap.set(block.id, id);
    return {
      ...block,
      id,
      layout: block.layout
        ? { ...block.layout, x: block.layout.x + 24, y: block.layout.y + 24 }
        : undefined,
      children: block.children.map(remap),
    };
  };
  const [first, ...rest] = bundle.blocks;
  if (first && firstTargetId) idMap.set(first.id, firstTargetId);
  const firstChildren = first && firstTargetId ? first.children.map(remap) : [];
  const blocks = firstTargetId ? rest.map(remap) : bundle.blocks.map(remap);
  const links = bundle.links.flatMap((link) => {
    const from = idMap.get(link.from.blockId);
    const to = idMap.get(link.to.blockId);
    return from && to ? [{
      ...link,
      id: crypto.randomUUID(),
      from: { ...link.from, blockId: from },
      to: { ...link.to, blockId: to },
    }] : [];
  });
  return { blocks, firstChildren, links };
}
