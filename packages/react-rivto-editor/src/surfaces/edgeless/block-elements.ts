import type { EditorBlock, EditorElement } from "@chulane/rivto";
import type { ReactEditor } from "../../types";

export const EDGELESS_BLOCK_ELEMENT_TYPE = "block";
export const EDGELESS_BLOCK_ELEMENT_ID_PREFIX = "rivto:block-element:";
export const EDGELESS_CARD_DEFAULT_FRAME = { x: 60, y: 60, width: 320, height: 120 } as const;
const RECONCILE_ORIGIN = Symbol("rivto-react-block-elements");

interface ReconciliationState {
  readonly memberships: ReadonlyMap<string, readonly string[]>;
}

// Range endpoints are canonical persisted data, but moving an endpoint makes
// them temporarily ambiguous. The last reconciled membership is an in-memory
// matching hint only; explicit separator block types determine every segment.
const reconciliationStates = new WeakMap<ReactEditor, ReconciliationState>();

/**
 * Finds the maximum-weight one-to-one assignment between segments and elements.
 *
 * A greedy match can give the best element to one segment while forcing a much
 * worse recreation elsewhere. The Hungarian assignment maximizes continuity
 * across the complete canvas and remains deterministic because rows and columns
 * follow document and previous-element order.
 *
 * @param weights - Segment rows containing non-negative element continuity scores.
 * @returns Element-column index for each segment, or -1 when no positive match exists.
 */
function maximumWeightMatching(weights: readonly (readonly number[])[]): number[] {
  const rows = weights.length;
  const columns = weights[0]?.length ?? 0;
  if (!rows || !columns) return Array(rows).fill(-1);
  const size = Math.max(rows, columns);
  const maximum = Math.max(0, ...weights.flat());
  const potentialsByRow = Array(size + 1).fill(0) as number[];
  const potentialsByColumn = Array(size + 1).fill(0) as number[];
  const columnRows = Array(size + 1).fill(0) as number[];
  const previousColumns = Array(size + 1).fill(0) as number[];

  for (let row = 1; row <= size; row += 1) {
    columnRows[0] = row;
    let column = 0;
    const minimums = Array(size + 1).fill(Number.POSITIVE_INFINITY) as number[];
    const used = Array(size + 1).fill(false) as boolean[];
    do {
      used[column] = true;
      const currentRow = columnRows[column]!;
      let delta = Number.POSITIVE_INFINITY;
      let nextColumn = 0;
      for (let candidate = 1; candidate <= size; candidate += 1) {
        if (used[candidate]) continue;
        const weight = currentRow <= rows && candidate <= columns
          ? weights[currentRow - 1]![candidate - 1]!
          : 0;
        const cost = maximum - weight - potentialsByRow[currentRow]! - potentialsByColumn[candidate]!;
        if (cost < minimums[candidate]!) {
          minimums[candidate] = cost;
          previousColumns[candidate] = column;
        }
        if (minimums[candidate]! < delta) {
          delta = minimums[candidate]!;
          nextColumn = candidate;
        }
      }
      for (let candidate = 0; candidate <= size; candidate += 1) {
        if (used[candidate]) {
          potentialsByRow[columnRows[candidate]!] += delta;
          potentialsByColumn[candidate] -= delta;
        } else minimums[candidate] -= delta;
      }
      column = nextColumn;
    } while (columnRows[column] !== 0);
    do {
      const previous = previousColumns[column]!;
      columnRows[column] = columnRows[previous]!;
      column = previous;
    } while (column !== 0);
  }

  const result = Array(rows).fill(-1) as number[];
  for (let column = 1; column <= columns; column += 1) {
    const row = columnRows[column]! - 1;
    if (row >= 0 && row < rows && weights[row]![column - 1]! > 0) result[row] = column - 1;
  }
  return result;
}

/**
 * Inclusive document-order boundaries rendered by one edgeless block element.
 *
 * The range is resolved from current root order instead of persisting every ID.
 * Therefore blocks inserted between the boundaries, including empty roots,
 * automatically become part of the same canvas card.
 */
export interface BlockElementProps {
  readonly [key: string]: unknown;
  /** First root rendered by the card. */
  readonly startBlockId: string;
  /** Last root rendered by the card. */
  readonly endBlockId: string;
}

/**
 * Resolves the inclusive root range stored by a block element.
 *
 * @param element - Generic document element containing range boundary props.
 * @param rootIds - Current root IDs in document order.
 * @returns Every root between valid start/end boundaries, or an empty array.
 */
export function blockIdsOf(element: EditorElement, rootIds: readonly string[]): string[] {
  const start = typeof element.props.startBlockId === "string" ? rootIds.indexOf(element.props.startBlockId) : -1;
  const end = typeof element.props.endBlockId === "string" ? rootIds.indexOf(element.props.endBlockId) : -1;
  return start >= 0 && end >= 0
    ? rootIds.slice(Math.min(start, end), Math.max(start, end) + 1)
    : [];
}

/**
 * True when `blockId` is a root rendered by the element, or a descendant of one.
 *
 * Card move hit-testing must accept nested/indented blocks; {@link blockIdsOf}
 * alone only lists roots and would reject every child hit.
 */
export function elementContainsBlock(
  editor: Pick<ReactEditor["editor"], "blocks">,
  element: EditorElement,
  rootIds: readonly string[],
  blockId: string,
): boolean {
  const roots = new Set(blockIdsOf(element, rootIds));
  let id: string | null | undefined = blockId;
  let contains = false;
  while (id) {
    if (roots.has(id)) {
      contains = true;
      break;
    }
    id = editor.blocks.getParentId(id);
  }
  return contains;
}

/** @returns Inclusive persisted boundaries for one non-empty ordered root range. */
export function blockRangeProps(blockIds: readonly string[]): BlockElementProps {
  if (!blockIds.length) throw new Error("Block element range cannot be empty");
  return { startBlockId: blockIds[0]!, endBlockId: blockIds.at(-1)! };
}

/**
 * Inserts the default plugin-registered boundary after one root block.
 * Automatic edgeless workflows use this instead of knowing a persisted type.
 *
 * @param reactEditor - Runtime whose first separator registration is preferred.
 * @param afterId - Root block after which the separator is inserted.
 * @returns ID of the inserted separator block.
 * @throws When the active preset provides no separator block plugin.
 */
export function insertBlockElementSeparator(reactEditor: ReactEditor, afterId: string): string {
  const type = reactEditor.blocks.getDefaultBlockElementSeparatorType();
  if (!type) throw new Error("No block element separator type is registered");
  return reactEditor.blocks.insertBlock({ type, content: "" }, afterId);
}

/**
 * Reconciles persisted block elements with current root runs.
 * Registered root separator types define unambiguous runs; empty paragraphs
 * are ordinary card content. Membership matching remains necessary because
 * moving a stored start/end block can make its range cross a separator before
 * derived props are repaired. Global assignment preserves the most existing
 * elements instead of letting a greedy local match recreate another card.
 *
 * @param reactEditor - React runtime that owns separator policy and the projection.
 * @returns No value; required element changes are committed synchronously.
 */
export function reconcileBlockElements(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const roots = editor.blocks.getBlocks();
  const rootOrder = roots.map((block) => block.id);
  const rootSet = new Set(rootOrder);
  const existing = editor.elements.getElements().filter((element) => element.type === EDGELESS_BLOCK_ELEMENT_TYPE);
  const currentRanges = new Map(existing.map((element) => [element.id, blockIdsOf(element, rootOrder)]));
  const previousState = reconciliationStates.get(reactEditor);
  const previousRanges = new Map(existing.map((element) => {
    const cached = previousState?.memberships.get(element.id);
    return [element.id, cached ? cached.filter((id) => rootSet.has(id)) : currentRanges.get(element.id) ?? []] as const;
  }));
  const segments: EditorBlock[][] = [];
  let segment: EditorBlock[] = [];
  roots.forEach((block) => {
    if (reactEditor.blocks.separatesBlockElements(block.type)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(block);
  });
  if (segment.length) segments.push(segment);

  const continuityBase = rootOrder.length + 1;
  const anchorBonus = continuityBase ** 3;
  const retentionBonus = continuityBase ** 4;
  const weights = segments.map((blocks) => {
    const ids = new Set(blocks.map((block) => block.id));
    return existing.map((element) => {
      const previous = previousRanges.get(element.id) ?? [];
      const previousOverlap = previous.filter((id) => ids.has(id)).length;
      const currentOverlap = (currentRanges.get(element.id) ?? []).filter((id) => ids.has(id)).length;
      // Keeping the element that owned the segment's first block makes splits
      // retain their first card and merges retain the earlier card. Retention
      // has higher priority so this preference never recreates another reusable
      // element elsewhere on the canvas.
      const ownsFirst = previous[0] === blocks[0]!.id || element.props.startBlockId === blocks[0]!.id
        ? anchorBonus
        : 0;
      const canReuse = previousOverlap > 0 || currentOverlap > 0 ? retentionBonus : 0;
      return canReuse + ownsFirst + previousOverlap * continuityBase + currentOverlap;
    });
  });
  const matches = maximumWeightMatching(weights);
  const desired = segments.map((blocks, index): EditorElement => {
    const existingElement = existing[matches[index] ?? -1];
    return {
      id: existingElement?.id ?? `${EDGELESS_BLOCK_ELEMENT_ID_PREFIX}${blocks[0]!.id}`,
      type: EDGELESS_BLOCK_ELEMENT_TYPE,
      frame: existingElement
        ? existingElement.frame
        : { ...EDGELESS_CARD_DEFAULT_FRAME, x: 60 + index * 24, y: 60 + index * 24 },
      zIndex: existingElement?.zIndex ?? index,
      props: { ...existingElement?.props, ...blockRangeProps(blocks.map((block) => block.id)) },
    };
  });
  const desiredIds = new Set(desired.map((element) => element.id));
  const remove = existing.filter((element) => !desiredIds.has(element.id)).map((element) => element.id);
  const insert = desired.filter((element) => !editor.elements.getElement(element.id));
  const update = desired.flatMap((element) => {
    const current = editor.elements.getElement(element.id);
    return current && (current.props.startBlockId !== element.props.startBlockId || current.props.endBlockId !== element.props.endBlockId)
      ? [{ id: element.id, patch: { props: element.props } }]
      : [];
  });
  const desiredMemberships = new Map(desired.map((element, index) => [
    element.id,
    segments[index]!.map((block) => block.id),
  ]));
  reconciliationStates.set(reactEditor, {
    memberships: desiredMemberships,
  });
  if (!remove.length && !insert.length && !update.length) return;
  editor.document.crdt.transact(() => {
    if (remove.length) editor.document.elements.removeElements(remove);
    insert.forEach((element) => editor.document.elements.insertElement(element));
    if (update.length) editor.document.elements.updateElements(update);
  }, RECONCILE_ORIGIN);
}
