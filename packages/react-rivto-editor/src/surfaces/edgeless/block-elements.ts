import { DEFAULT_BLOCK_TYPE, type EditorBlock, type EditorElement } from "@chulane/rivto";
import type { ReactEditor } from "../../types";

export const EDGELESS_BLOCK_ELEMENT_TYPE = "block";
export const EDGELESS_BLOCK_ELEMENT_ID_PREFIX = "rivto:block-element:";
export const EDGELESS_CARD_DEFAULT_FRAME = { x: 60, y: 60, width: 320, height: 120 } as const;
const RECONCILE_ORIGIN = Symbol("rivto-react-block-elements");

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
 * Identifies the default boundary between adjacent edgeless block elements.
 * Ownership and root-level checks are handled by reconciliation, so this
 * predicate only describes separator content.
 *
 * @param block - Root candidate read from the current document.
 * @returns True only for an empty paragraph.
 */
export function isDefaultBlockElementSeparator(block: EditorBlock): boolean {
  return block.type === DEFAULT_BLOCK_TYPE && block.content.length === 0;
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

/** @returns Inclusive persisted boundaries for one non-empty ordered root range. */
export function blockRangeProps(blockIds: readonly string[]): BlockElementProps {
  if (!blockIds.length) throw new Error("Block element range cannot be empty");
  return { startBlockId: blockIds[0]!, endBlockId: blockIds.at(-1)! };
}

/**
 * Reconciles persisted block elements with current root runs.
 * Existing owned empty roots remain editable while unowned separators split runs.
 * Identity and geometry are retained when ranges merge or need repair;
 * derived writes use a dedicated non-history transaction origin.
 *
 * @param reactEditor - React runtime that owns separator policy and the projection.
 * @returns No value; required element changes are committed synchronously.
 */
export function reconcileBlockElements(reactEditor: ReactEditor): void {
  const { editor } = reactEditor;
  const roots = editor.blocks.getBlocks();
  const rootOrder = roots.map((block) => block.id);
  const existing = editor.elements.getElements().filter((element) => element.type === EDGELESS_BLOCK_ELEMENT_TYPE);
  const ranges = new Map(existing.map((element) => [element.id, blockIdsOf(element, rootOrder)]));
  // A separator inside persisted boundaries is card content. Only an empty
  // root outside every range separates cards.
  const owned = new Set(existing.flatMap((element) => ranges.get(element.id) ?? []));
  const segments: EditorBlock[][] = [];
  let segment: EditorBlock[] = [];
  roots.forEach((block) => {
    if (!owned.has(block.id) && reactEditor.isBlockElementSeparator(block)) {
      if (segment.length) segments.push(segment);
      segment = [];
    } else segment.push(block);
  });
  if (segment.length) segments.push(segment);

  const byBlock = new Map<string, EditorElement[]>();
  existing.forEach((element) => ranges.get(element.id)?.forEach((id) => {
    const values = byBlock.get(id) ?? [];
    values.push(element);
    byBlock.set(id, values);
  }));
  const desired = segments.map((blocks, index): EditorElement => {
    // Ranges cannot cross an unowned separator, so one existing element can
    // overlap only one segment. The earliest overlap owns merged geometry.
    const existingElement = blocks.flatMap((block) => byBlock.get(block.id) ?? [])[0];
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
  if (!remove.length && !insert.length && !update.length) return;
  editor.document.crdt.transact(() => {
    if (remove.length) editor.document.elements.removeElements(remove);
    insert.forEach((element) => editor.document.elements.insertElement(element));
    if (update.length) editor.document.elements.updateElements(update);
  }, RECONCILE_ORIGIN);
}
