import { PanelElements } from "@chulane/rivto";
import type { ReactPanelApi } from "../panels/types";
import type { BlockElementProps } from "./types";
/**
 * Generic projection between ordered root blocks and persisted block elements.
 *
 * The React runtime maintains this document relationship independently of any
 * installed surface. Optional edgeless UI consumes the resulting elements but
 * does not own their persistence, reconciliation, or range semantics.
 *
 * @module
 */
import type { EditorBlock, EditorBlockNode, EditorElementNode } from "@chulane/rivto";
import type { ReactEditorApi } from "../editor/types";
import type { BlocksApi } from "../managers/blocks/blocks-api";

export const EDGELESS_BLOCK_ELEMENT_TYPE = "block";
export const EDGELESS_BLOCK_ELEMENT_ID_PREFIX = "rivto:block-element:";
export const EDGELESS_CARD_DEFAULT_FRAME = { x: 60, y: 60, width: 720, height: 120 } as const;
export const EDGELESS_BLOCK_PLACEMENT_STEP = 20;
/**
 * Tests whether two positive frames overlap with area; touching edges are allowed.
 *
 * @param left - First candidate frame.
 * @param right - Second candidate frame.
 * @returns Whether their intersection has positive width and height.
 */
export function blockFramesOverlap(left: EditorElementNode["frame"], right: EditorElementNode["frame"]): boolean {
  return left.x < right.x + right.width
    && left.x + left.width > right.x
    && left.y < right.y + right.height
    && left.y + left.height > right.y;
}

/**
 * Finds the first free right/down grid position in deterministic Manhattan shells.
 *
 * @param preferred - Requested starting frame.
 * @param occupied - Frames that the result must not overlap.
 * @param step - Positive grid offset between candidates.
 * @returns The preferred frame or the first deterministic free candidate.
 */
export function nonOverlappingBlockFrame(
  preferred: EditorElementNode["frame"],
  occupied: readonly EditorElementNode["frame"][],
  step = EDGELESS_BLOCK_PLACEMENT_STEP,
): EditorElementNode["frame"] {
  const offset = Math.max(1, step);
  for (let shell = 0; ; shell += 1) {
    for (let xStep = shell; xStep >= 0; xStep -= 1) {
      const candidate = { ...preferred, x: preferred.x + xStep * offset, y: preferred.y + (shell - xStep) * offset };
      if (!occupied.some((frame) => blockFramesOverlap(candidate, frame))) return candidate;
    }
  }
}

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
  const maximum = weights.reduce((max, row) => row.reduce((value, weight) => Math.max(value, weight), max), 0);
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
 * Matches independent groups separately so unrelated cards do not enlarge the matrix.
 * @param scores - Sparse segment-to-card scores; absent entries have zero weight.
 * @returns Existing card index for each segment, or -1 without a reusable card.
 */
function matchConnectedSegments(scores: readonly ReadonlyMap<number, number>[]): number[] {
  const rowsByCard = new Map<number, number[]>();
  scores.forEach((row, index) => row.forEach((_, card) => {
    const rows = rowsByCard.get(card) ?? [];
    rows.push(index);
    rowsByCard.set(card, rows);
  }));
  const result = Array<number>(scores.length).fill(-1);
  const visited = new Set<number>();
  scores.forEach((_, start) => {
    if (visited.has(start)) return;
    const rows = [start];
    const cards = new Set<number>();
    visited.add(start);
    for (const row of rows) {
      scores[row]!.forEach((_, card) => {
        if (cards.has(card)) return;
        cards.add(card);
        for (const neighbor of rowsByCard.get(card)!) {
          if (visited.has(neighbor)) continue;
          visited.add(neighbor);
          rows.push(neighbor);
        }
      });
    }
    if (!cards.size) return;
    rows.sort((a, b) => a - b);
    const columns = [...cards].sort((a, b) => a - b);
    if (rows.length === 1 && columns.length === 1) {
      result[start] = columns[0]!;
      return;
    }
    const matches = maximumWeightMatching(rows.map((row) => columns.map((card) => scores[row]!.get(card) ?? 0)));
    matches.forEach((column, index) => {
      if (column >= 0) result[rows[index]!] = columns[column]!;
    });
  });
  return result;
}

/**
 * Resolves the inclusive root range stored by a block element.
 *
 * @param element - Generic document element containing range boundary props.
 * @param rootIds - Current root IDs in document order.
 * @returns Every root between valid start/end boundaries, or an empty array.
 */
export function blockIdsOf(element: EditorElementNode, rootIds: readonly string[]): string[] {
  const start = typeof element.props.startBlockId === "string" ? rootIds.indexOf(element.props.startBlockId) : -1;
  const end = typeof element.props.endBlockId === "string" ? rootIds.indexOf(element.props.endBlockId) : -1;
  return start >= 0 && end >= 0
    ? rootIds.slice(Math.min(start, end), Math.max(start, end) + 1)
    : [];
}

/**
 * Resolves the block parent from the surviving boundaries of an element.
 * No Panel identity or root is stored in element props. A surviving boundary
 * keeps a partially deleted range in its block scope until reconciliation repairs
 * it; if both survive under different parents, the start determines the scope.
 * @param element - Block element with start/end block references.
 * @param blocks - Current document hierarchy used to locate the boundaries.
 * @returns Parent ID, null for document roots, or undefined when neither boundary exists.
 */
export function blockElementRoot(element: EditorElementNode, blocks: Pick<BlocksApi, "getParentId">): string | null | undefined {
  const start = typeof element.props.startBlockId === "string" ? blocks.getParentId(element.props.startBlockId) : undefined;
  if (start !== undefined) return start;
  return typeof element.props.endBlockId === "string" ? blocks.getParentId(element.props.endBlockId) : undefined;
}

/**
 * True when `blockId` is a root rendered by the element, or a descendant of one.
 *
 * Card move hit-testing must accept nested/indented blocks; {@link blockIdsOf}
 * alone only lists roots and would reject every child hit.
 * @param blocks - Document block manager used to follow parent IDs.
 * @param element - Card whose root range defines the contained subtrees.
 * @param rootIds - Ordered document roots used to resolve the card's range.
 * @param blockId - Block to locate in those subtrees.
 * @returns Whether the block is a card root or one of its descendants.
 */
export function elementContainsBlock(
  blocks: Pick<BlocksApi, "getParentId">,
  element: EditorElementNode,
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
    id = blocks.getParentId(id);
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
 * @param editor - Document API whose first separator registration is preferred.
 * @param afterId - Root block after which the separator is inserted.
 * @returns Complete inserted separator block.
 * @throws When the active preset provides no separator block plugin.
 */
export function insertBlockElementSeparator(editor: ReactEditorApi | ReactPanelApi, afterId: string): EditorBlock {
  const shared = "editor" in editor ? editor.editor : editor;
  const type = shared.blockTypes.getDefaultBlockElementSeparatorType();
  if (!type) throw new Error("No block element separator type is registered");
  if ("editor" in editor) {
    const destination = editor.blocks.canRemove(afterId)
      ? editor.blocks.getInsertionDestinationAfter(afterId)
      : { parentId: afterId };
    return editor.blocks.insertBlock({ type, content: "" }, destination);
  }
  return editor.blocks.insertBlock({ type, content: "" }, editor.blocks.getInsertionDestinationAfter(afterId));
}

/** Owns the document's block-card projection, settings, and deferred reconciliation. */
export class BlockElementProjection {
  // Range endpoints are canonical persisted data, but moving an endpoint makes
  // them temporarily ambiguous. The last reconciled membership is an in-memory
  // matching hint only; explicit separator block types determine every segment.
  private memberships: ReadonlyMap<string, readonly string[]> = new Map();
  private avoidOverlap = true;
  private defaultWidth: number = EDGELESS_CARD_DEFAULT_FRAME.width;
  private queued = false;
  private destroyed = false;

  /**
   * Creates a projection for one pair of block and element roots without writing storage.
   * @param reactEditor - Shared runtime whose block ranges and cards stay consistent.
   * @param rootBlockId - Parent whose children form card ranges; null means document roots.
   * @param rootElementId - Container for projected cards; null means document element roots.
   */
  constructor(private readonly reactEditor: ReactEditorApi, readonly rootBlockId: string | null = null, readonly rootElementId: string | null = null) {}

  /**
   * Creates a separately reconciled pair of roots using this projection's layout defaults.
   * @param rootBlockId - Block parent to display, or null for document block roots.
   * @param rootElementId - Element container for cards, or null for document element roots.
   * @returns Unsubscribed projection; its owner must reconcile, subscribe, and destroy it.
   */
  createPanelProjection(rootBlockId: string | null, rootElementId: string | null): BlockElementProjection {
    const projection = new BlockElementProjection(this.reactEditor, rootBlockId, rootElementId);
    projection.setDefaultWidth(this.defaultWidth);
    projection.setOverlapAvoidance(this.avoidOverlap);
    return projection;
  }

  /**
   * Keeps the ordinary document-card ID deterministic while avoiding collisions
   * when another element subtree already displays the same block. Existing cards
   * are matched before this method, so their identities and geometry remain stable.
   */
  private availableElementId(blockId: string): string {
    const base = `${EDGELESS_BLOCK_ELEMENT_ID_PREFIX}${this.rootElementId === null ? "" : `${this.rootElementId}:`}${blockId}`;
    if (!this.reactEditor.elements.hasElement(base)) return base;
    return crypto.randomUUID();
  }

  /**
   * Configures whether future reconciled block cards avoid existing cards.
   * The setting belongs to this document runtime, independent of mounted views.
   * @param enabled - Whether new cards should search for a free frame.
   */
  setOverlapAvoidance(enabled: boolean): void { this.avoidOverlap = enabled; }

  /**
   * Configures the width used only when the reconciler creates a new block card.
   * The setting belongs to this document runtime; existing frames remain unchanged.
   * @param width - Positive finite width in canvas units; invalid values use 720.
   */
  setDefaultWidth(width: number): void {
    this.defaultWidth = Number.isFinite(width) && width > 0 ? width : EDGELESS_CARD_DEFAULT_FRAME.width;
  }

  /**
   * Coalesces synchronous document edits before repairing the React-owned block
   * element projection. This keeps initialization and collaborative update
   * bursts deterministic without coupling the projection to a mounted surface.
   */
  schedule = (): void => {
    if (this.queued || this.destroyed) return;
    this.queued = true;
    queueMicrotask(() => {
      this.queued = false;
      if (!this.destroyed) this.reconcile();
    });
  };

  /** Cancels queued work and releases previous membership hints. */
  destroy(): void {
    this.destroyed = true;
    this.memberships = new Map();
  }

  /**
   * Reconciles persisted block elements with current root runs.
   * Registered root separator types define unambiguous runs; empty paragraphs
   * are ordinary card content. Membership matching remains necessary because
   * moving a stored start/end block can make its range cross a separator before
   * derived props are repaired. Global assignment preserves the most existing
   * elements instead of letting a greedy local match recreate another card.
   *
   * @returns No value; required element changes are committed synchronously.
   */
  reconcile(): void {
    if (this.destroyed) return;
    const reactEditor = this.reactEditor;

    // Build the two sides of the projection: current document roots and the
    // persisted canvas elements that render ranges of those roots as cards.
    // A deleted root is not an instruction to use document roots. Keep the
    // projection inactive until undo or a remote update restores its container.
    if (this.rootBlockId !== null && !reactEditor.blocks.hasBlock(this.rootBlockId)) return;
    if (this.rootElementId !== null && !reactEditor.elements.hasElement(this.rootElementId)) return;
    const elements = new PanelElements(reactEditor.elements, reactEditor.getDocument(), this.rootElementId);
    const rootIds = this.rootBlockId !== null
      ? reactEditor.blocks.getBlockNode(this.rootBlockId)!.childIds
      : reactEditor.blocks.getRootIds();
    const roots = rootIds.flatMap((id) => {
      const node = reactEditor.blocks.getBlockNode(id);
      return node ? [node] : [];
    });
    const rootOrder = roots.map((block) => block.id);
    const rootSet = new Set(rootOrder);
    // Element roots limit the search; surviving block boundaries identify which
    // block scope can update the element. Fully deleted ranges can be removed.
    const existing = elements.getElementNodes().filter((element) => {
      if (element.type !== EDGELESS_BLOCK_ELEMENT_TYPE) return false;
      const parent = blockElementRoot(element, reactEditor.blocks);
      return parent === undefined || parent === this.rootBlockId;
    });
    const currentRanges = new Map(existing.map((element) => [element.id, blockIdsOf(element, rootOrder)]));

    // A moved range endpoint can temporarily make its persisted start/end pair
    // describe the wrong run. Prefer the last known membership in that case so
    // the same card keeps its identity and canvas geometry through the move.
    const previousRangesById = this.memberships;
    const previousRanges = new Map(existing.map((element) => {
      const cached = previousRangesById.get(element.id);
      return [element.id, cached ? cached.filter((id) => rootSet.has(id)) : currentRanges.get(element.id) ?? []] as const;
    }));

    // Root separator blocks are boundaries, not card content. Every non-empty
    // run between them must be represented by exactly one block element.
    const segments: EditorBlockNode[][] = [];
    let segment: EditorBlockNode[] = [];
    roots.forEach((block) => {
      if (reactEditor.blockTypes.separatesBlockElements(block.type)) {
        if (segment.length) segments.push(segment);
        segment = [];
      } else segment.push(block);
    });
    if (segment.length) segments.push(segment);

    const continuityBase = rootOrder.length + 1;
    const anchorBonus = continuityBase ** 3;
    const retentionBonus = continuityBase ** 4;

    // Index block membership once to find candidate cards.
    const segmentByBlock = new Map<string, number>();
    segments.forEach((blocks, index) => blocks.forEach((block) => segmentByBlock.set(block.id, index)));
    const scores = segments.map(() => new Map<number, number>());
    existing.forEach((element, card) => {
      const previous = previousRanges.get(element.id) ?? [];
      const current = currentRanges.get(element.id) ?? [];
      const overlaps = new Map<number, { previous: number; current: number }>();
      const count = (ids: readonly string[], field: "previous" | "current") => {
        ids.forEach((id) => {
          const index = segmentByBlock.get(id);
          if (index === undefined) return;
          const overlap = overlaps.get(index) ?? { previous: 0, current: 0 };
          overlap[field] += 1;
          overlaps.set(index, overlap);
        });
      };
      count(previous, "previous");
      count(current, "current");
      // A valid start can retain a card whose end temporarily disappeared.
      const start = element.props.startBlockId;
      const startSegment = typeof start === "string" ? segmentByBlock.get(start) : undefined;
      if (startSegment !== undefined && segments[startSegment]![0]!.id === start && !overlaps.has(startSegment)) {
        overlaps.set(startSegment, { previous: 0, current: 0 });
      }
      overlaps.forEach((overlap, index) => {
        // First-block ownership breaks ties; retaining a reusable card wins first.
        const first = segments[index]![0]!.id;
        const ownsFirst = previous[0] === first || element.props.startBlockId === first;
        const canReuse = overlap.previous > 0 || overlap.current > 0;
        scores[index]!.set(card, (canReuse ? retentionBonus : 0) + (ownsFirst ? anchorBonus : 0)
          + overlap.previous * continuityBase + overlap.current);
      });
    });

    // Solve competing assignments together, preserving split/merge continuity.
    const matches = matchConnectedSegments(scores);
    const avoidOverlap = this.avoidOverlap;
    const defaultWidth = this.defaultWidth;
    const occupied = existing.map((element) => element.frame);

    // Produce the canonical element for each segment. Matched cards retain all
    // presentation state; only new cards receive default placement and sizing.
    const desired = segments.map((blocks, index): EditorElementNode => {
      const existingElement = existing[matches[index] ?? -1];
      const preferred = { ...EDGELESS_CARD_DEFAULT_FRAME, width: defaultWidth, x: 60 + index * 24, y: 60 + index * 24 };
      const frame = existingElement?.frame ?? (avoidOverlap ? nonOverlappingBlockFrame(preferred, occupied) : preferred);
      if (!existingElement) occupied.push(frame);
      return {
        id: existingElement?.id ?? this.availableElementId(blocks[0]!.id),
        childIds: existingElement?.childIds ?? [],
        type: EDGELESS_BLOCK_ELEMENT_TYPE,
        frame,
        zIndex: existingElement?.zIndex ?? index,
        props: { ...existingElement?.props, ...blockRangeProps(blocks.map((block) => block.id)) },
      };
    });

    // Diff the desired projection against persisted elements. Updates are
    // limited to range boundaries so reconciliation never resets card geometry.
    const desiredIds = new Set(desired.map((element) => element.id));
    const validRanges = new Map(desired.map((element) => [element.props.startBlockId, element.props.endBlockId]));
    // Overlapping areas can contain more than one valid presentation of a range.
    // Removing one would make its narrower Panel recreate it and lose its geometry.
    const remove = existing.filter((element) => !desiredIds.has(element.id)
      && (!validRanges.has(element.props.startBlockId) || validRanges.get(element.props.startBlockId) !== element.props.endBlockId))
      .map((element) => element.id);
    const insert = desired.filter((element) => !elements.hasElement(element.id));
    const update = desired.flatMap((element) => {
      const current = elements.getElementNode(element.id);
      return current && (current.props.startBlockId !== element.props.startBlockId || current.props.endBlockId !== element.props.endBlockId)
        ? [{ id: element.id, patch: { props: element.props } }]
        : [];
    });

    // Save exact membership before publishing writes; a following structural
    // change can then match cards even when persisted endpoints are ambiguous.
    const desiredMemberships = new Map(desired.map((element, index) => [
      element.id,
      segments[index]!.map((block) => block.id),
    ]));
    this.memberships = desiredMemberships;
    if (!remove.length && !insert.length && !update.length) return;

    reactEditor.history.batchUpdatesWithoutHistory(() => {
      remove.forEach((id) => elements.removeElementAndPromoteChildren(id));
      insert.forEach((element) => elements.insertElement(element));
      if (update.length) elements.updateElements(update);
    });
  }
}
