/**
 * Demo-only document-order numbers drawn to the left of each page block.
 *
 * The ordinal is the block's depth-first position in the full outline, starting
 * at 1. Hierarchy changes rebuild that map once per document; text edits do not.
 * Nested blocks keep the same left column as their ancestors. Edgeless cards omit the
 * numbers because their frames are not a vertical outline.
 */
import type { DocumentModel } from "@chulane/document-model";
import {
  useEditorView,
  type BlockSlotProps,
  type EditorViewApi,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import { useCallback, useRef, useSyncExternalStore, type CSSProperties } from "react";

const DEMO_BLOCK_NUMBER_CLASS = "demo-block-number";

/**
 * Containers whose children are a layout, not another outline level.
 *
 * Those descendants stay in the document but do not take a gutter number, so
 * the left column stays contiguous down the page.
 */
const LAYOUT_CONTAINER_TYPES = new Set(["table", "kanban", "columns", "bento", "todo-storage"]);

/** One block's stable outline position used by the left-hand label. */
interface BlockOrdinal {
  /** Depth-first position in the document, starting at 1. */
  readonly number: number;
  /** Nesting depth of the block, with roots at 0. */
  readonly depth: number;
}

interface BlockOrderCache {
  /** Shared ordinal map; replaced only after a hierarchy change. */
  map: ReadonlyMap<string, BlockOrdinal>;
}

const blockOrders = new WeakMap<DocumentModel, BlockOrderCache>();

/**
 * Assigns a depth-first ordinal to every block in one detached forest.
 *
 * @param blocks - Ordered roots, each carrying nested children.
 * @returns Ordinals keyed by block id.
 */
function buildOrdinals(
  blocks: ReturnType<EditorViewApi["blocks"]["getBlocks"]>,
): ReadonlyMap<string, BlockOrdinal> {
  const map = new Map<string, BlockOrdinal>();
  let number = 1;
  /**
   * Records one sibling list and then its descendants.
   *
   * @param nodes - Siblings in document order.
   * @param depth - Nesting depth of this sibling list.
   * @returns Nothing.
   */
  const visit = (nodes: typeof blocks, depth: number): void => {
    for (const node of nodes) {
      map.set(node.id, { number, depth });
      number += 1;
      if (!LAYOUT_CONTAINER_TYPES.has(node.type)) visit(node.children, depth + 1);
    }
  };
  visit(blocks, 0);
  return map;
}

/**
 * Returns the displayed document's ordinal map, building it on first read.
 *
 * @param editorView - Editor whose outline supplies the numbers.
 * @returns The shared ordinal map for that document.
 */
function blockOrderSnapshot(editorView: EditorViewApi): ReadonlyMap<string, BlockOrdinal> {
  const document = editorView.getDocument();
  if (!document) throw new Error("Document context is required for gutter numbering");
  let cache = blockOrders.get(document);
  if (!cache) {
    cache = { map: buildOrdinals(editorView.blocks.getBlocks()) };
    blockOrders.set(document, cache);
  }
  return cache.map;
}

/**
 * Drops a cached ordinal map so the next read follows the new hierarchy.
 *
 * @param document - Loaded model whose outline changed.
 * @returns Nothing.
 */
function invalidateBlockOrder(document: DocumentModel): void {
  blockOrders.delete(document);
}

/**
 * Subscribes one page row to document-order numbers.
 *
 * @param block - Block whose label is being rendered.
 * @returns Its ordinal, or undefined when the block is no longer in the outline.
 */
function useBlockOrdinal(block: BlockSlotProps["block"]): BlockOrdinal | undefined {
  const editorView = useEditorView();
  // Read after document publication: undo can notify structure observers
  // before every affected root/child snapshot has been invalidated.
  const subscribe = useCallback((listener: () => void) => editorView.subscribe(listener), [editorView]);
  const previous = useRef<BlockOrdinal | undefined>(undefined);
  const getBlockOrderSnapshot = useCallback(() => {
    const current = blockOrderSnapshot(editorView).get(block.id);
    // Unchanged labels keep their snapshot and skip a render.
    if (current?.number !== previous.current?.number || current?.depth !== previous.current?.depth) {
      previous.current = current;
    }
    return previous.current;
  }, [editorView, block.id]);
  return useSyncExternalStore(subscribe, getBlockOrderSnapshot, getBlockOrderSnapshot);
}

/** Draws the block's document-order number in the page's left gutter. */
function BlockNumberSlot({ block }: BlockSlotProps) {
  const ordinal = useBlockOrdinal(block);
  if (!ordinal) return null;
  const style = { "--demo-block-depth": ordinal.depth } as CSSProperties;
  return <span className={DEMO_BLOCK_NUMBER_CLASS} style={style}>{ordinal.number}</span>;
}

/**
 * Registers the left-hand document-order label for page mode.
 *
 * @returns The demo extension installed with the other page chrome.
 */
export function blockNumberExtension(): ReactEditorExtension {
  return {
    id: "demo.block-number",
    /**
     * Invalidates shared numbering before mounted rows read the new outline.
     * @param editorRuntime - Runtime owning the structure subscription and labels.
     * @returns Cleanup for the subscription and cached outline.
     */
    setup(editorRuntime) {
      // Invalidate once during structure observation. Rows read on document
      // publication, sharing one rebuild after all storage observers finish.
      const document = editorRuntime.getDocument();
      const unsubscribe = document.blocks.subscribeStructure(() => invalidateBlockOrder(document));
      editorRuntime.surfaces.registerBlockSlot({
        position: "left",
        mode: "block",
        component: BlockNumberSlot,
      });
      return () => {
        unsubscribe();
        invalidateBlockOrder(document);
      };
    },
  };
}
