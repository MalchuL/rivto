/**
 * Clipboard tree cloning and validation helpers.
 *
 * These functions operate on detached data. Selection resolution belongs to
 * SelectionManager and paste mutations belong to strategies.
 */
import type { ResolvedSelection } from "../../selection-manager";
import {
  validateBlockForest,
  validateElementCollection,
  type Block,
} from "@chulane/document-model";
import type { ClipboardBundle } from "../clipboard-data";

/** Clipboard schema version accepted by structured paste. */
export const CLIPBOARD_BUNDLE_VERSION = 4;

/**
 * Asserts that an unknown payload is a complete, trusted clipboard bundle.
 *
 * Version, unique IDs, portable records, acyclic forests, and
 * optional canvas elements are all checked before callers import or write.
 * Invalid custom MIME must fall back to plain text rather than reaching insert.
 *
 * @param bundle - Candidate structured clipboard payload.
 * @returns No value.
 * @throws {Error} When the payload is not a valid version-4 bundle.
 */
export function validateClipboardBundle(bundle: unknown): asserts bundle is ClipboardBundle {
  if (!bundle || typeof bundle !== "object" || Array.isArray(bundle)) {
    throw new Error("Unsupported Rivto clipboard payload");
  }
  const value = bundle as Partial<ClipboardBundle>;
  if (value.version !== CLIPBOARD_BUNDLE_VERSION) {
    throw new Error(`Unsupported Rivto clipboard version: ${String(value.version)}`);
  }
  if (!Array.isArray(value.blocks)) {
    throw new Error("Unsupported Rivto clipboard payload");
  }
  validateBlockForest(value.blocks, { requireComplete: true });
  if (value.elements !== undefined) validateElementCollection(value.elements);
  if (value.pluginData !== undefined && (typeof value.pluginData !== "object" || value.pluginData === null || Array.isArray(value.pluginData))) {
    throw new Error("Unsupported Rivto clipboard payload");
  }
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
 * data and child arrays with the source.
 *
 * @param block - Detached source block to clone.
 * @returns An identity-preserving deep clone safe for clipboard modification.
 */
function cloneBlock(block: Block): Block {
  return structuredClone(block);
}

/**
 * Finds a block inside a detached forest by its stable document ID.
 *
 * @param blocks - Roots to search recursively in document order.
 * @param id - Stable block ID to locate.
 * @returns The matching detached block, or undefined when it is absent.
 */
export function findBlock(blocks: Block[], id: string): Block | undefined {
  let found: Block | undefined;
  for (const block of blocks) {
    if (block.id === id) {
      found = block;
      break;
    }
    found = findBlock(block.children, id);
    if (found) break;
  }
  return found;
}

/**
 * Builds a child-ID to direct-parent-ID lookup for a detached forest.
 *
 * @param blocks - Roots whose complete descendants should be indexed.
 * @param parents - Accumulator used by recursive calls.
 * @returns The supplied map populated for every non-root block. childId -> parentId
 * For root blocks, the parentId is undefined and does not appear in the map.
 */
function indexParents(blocks: Block[], parents = new Map<string, string>()): Map<string, string> {
  blocks.forEach((parent) => {
    parent.children.forEach((child) => parents.set(child.id, parent.id));
    indexParents(parent.children, parents);
  });
  return parents;
}

/**
 * Produces the minimum set of copied roots for a resolved selection.
 *
 * The resolved selection may contain both a block and one or more of its
 * descendants. Returning each entry would duplicate descendants in the copied
 * forest, so a selected block is omitted whenever a selected ancestor already
 * owns it.
 *
 * Structural selections clone each surviving root with its complete subtree.
 * Text selections instead prune unselected descendants while preserving the
 * selected hierarchy, which prevents content outside the range from leaking
 * into the clipboard.
 *
 * @param document - Complete detached document roots used to resolve ancestry.
 * @param range - Resolved selected blocks and text boundaries.
 * @param wholeBlocks - Whether each copied root retains its complete subtree;
 * when false, only explicitly selected descendants are retained.
 * @returns Independent cloned roots in document order without duplicates.
 */
export function cloneSelectedTopLevelSubtrees(
  document: Block[],
  range: ResolvedSelection,
  wholeBlocks = true,
): Block[] {
  // Membership checks are used both while pruning descendants and while
  // walking ancestors, so keep the resolved selection in a shared lookup.
  const selectedIds = new Set(range.blocks.map((block) => block.id));
  const parents = indexParents(document);

  // Text ranges may cross nested blocks. Rebuild only the selected branches so
  // each retained child stays attached to its selected parent.
  const cloneSelection = (block: Block): Block => ({
    ...cloneBlock(block),
    children: block.children.filter((child) => selectedIds.has(child.id)).map(cloneSelection),
  });

  return range.blocks.filter((block) => {
    // A selected ancestor will clone this block in its own subtree, so only
    // blocks without a selected ancestor should become clipboard roots.
    let parent = parents.get(block.id);
    let isTopLevel = true;
    while (parent) {
      if (selectedIds.has(parent)) {
        isTopLevel = false;
        break;
      }
      parent = parents.get(parent);
    }
    return isTopLevel;
  }).map(wholeBlocks ? cloneBlock : cloneSelection);
}
