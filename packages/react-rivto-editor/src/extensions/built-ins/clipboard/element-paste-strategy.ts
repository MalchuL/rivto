import type { ReactEditorApi } from "../../../editor/types";
import { restoreElementChildren } from "../../../elements/clipboard-element-props";
import type { ConvertedClipboardElements, CreatedClipboardRecords } from "../../../managers/clipboard/types";
/**
 * Recreates first-class canvas elements after core has pasted referenced blocks.
 *
 * Generic visual elements are cloned directly. Block elements remap their root
 * block references to the IDs produced by the core block paste strategy.
 * Matching is edgeless-only so page pastes never create canvas objects.
 */
import type { PasteContext, PastePlacement, PasteResult, PasteStrategy, Selection } from "@chulane/rivto";
import {
  createStructuralSelection,
} from "@chulane/rivto";
import type { ReactPanelApi } from "../../../panels/types";
import { blockIdsOf, blockRangeProps, insertBlockElementSeparator } from "../../../elements/block-element-projection";
import { createEdgelessSelection, findEdgelessRuntime } from "../selection/edgeless-runtime";

/** Canvas-specific clipboard paste strategy. */
export class ElementPasteStrategy implements PasteStrategy {
  /** Document managers used by both the installed strategy and its panel-bound operations. */
  get reactEditor(): ReactEditorApi { return "editor" in this.editor ? this.editor.editor : this.editor; }
  private rootIds() { return "editor" in this.editor ? this.editor.blocks.getRootIds() : this.reactEditor.blocks.getRootIds(); }
  private get elements() { return "editor" in this.editor ? this.editor.elements : this.reactEditor.elements; }

  /**
   * Creates a strategy for one React runtime.
   * @param editor - Receiving view, or runtime for a document-only operation.
   * @param converted - Converter output; omitted for direct strategy callers.
   * @param created - Records created by this paste, including generated cards and separators, for failure cleanup.
   */
  constructor(private readonly editor: ReactPanelApi | ReactEditorApi, private readonly converted?: ConvertedClipboardElements, private readonly created?: CreatedClipboardRecords) {}

  /** Returns an independent strategy using the receiving view's surface and selection. */
  createPanelStrategy(reactPanel: ReactPanelApi): ElementPasteStrategy { return new ElementPasteStrategy(reactPanel); }

  /**
   * Accepts edgeless pastes that carry canvas elements or selected block objects.
   * @param context - Shared clipboard payload and paste intent.
   * @param _placement - Unused; canvas geometry is copied from source frames.
   * @returns True when this strategy should run after any block insertion.
   */
  matches(context: PasteContext, _placement: PastePlacement): boolean {
    // Core mode can be edgeless even when paste targets a page embedding.
    // Use the receiving surface so page paste does not create canvas elements.
    if ("editor" in this.editor && this.editor.events.getSurfaceType() !== "edgeless") return false;
    if (!context.bundle) return false;
    if (context.bundle.elements?.length) return true;
    // An explicit empty target requests block insertion without borrowing canvas selection.
    if (!context.selection?.blocks.length && !context.selection?.elements?.length) return false;
    return Boolean(this.canvasBlockSelection());
  }

  /**
   * Recreates selected clipboard elements with a small visible offset.
   * @param context - Shared clipboard payload and paste intent.
   * @param _placement - Unused; canvas geometry is copied from source frames.
   * @returns Proposed selection containing newly created canvas elements.
   */
  paste(context: PasteContext, _placement: PastePlacement): PasteResult | undefined {
    const bundle = context.bundle;
    if (!bundle) return undefined;
    const converted = this.converted ?? this.reactEditor.clipboard.convertElements(bundle, this.editor, context.blockIdMap ?? new Map());
    const pastedRootIds = bundle.blocks.flatMap(block => context.blockIdMap?.get(block.id) ?? []);
    const created: string[] = [];
    this.reactEditor.history.batchUpdates(() => {
      if (!converted.nodes.length && !bundle.elements?.length && pastedRootIds.length) {
        const card = this.elements.insertElement({ type: "block", frame: { x: 60, y: 60, width: 320, height: 120 },
          zIndex: Math.max(0, ...this.elements.getElementNodes().map(node => node.zIndex)) + 1,
          props: blockRangeProps(pastedRootIds) });
        created.push(card.id);
        this.created?.elementIds.add(card.id);
      }
      for (const node of converted.nodes) {
        const blockIds = converted.referencedBlocks.get(node.id);
        if (blockIds?.length) {
          const roots = this.rootIds();
          const before = roots[roots.indexOf(blockIds[0]!) - 1];
          if (before) {
            const separator = insertBlockElementSeparator(this.editor, before);
            this.created?.blockIds.add(separator.id);
          }
        }
        const parentId = "editor" in this.editor ? this.editor.rootElementId : null;
        const inserted = this.reactEditor.elements.insertElement({ ...node, childIds: [] }, { parentId });
        created.push(inserted.id);
        this.created?.elementIds.add(inserted.id);
      }
      restoreElementChildren(this.elements, bundle.elements ?? [], converted.idMap);
    });
    return created.length ? {
      proposedSelection: createEdgelessSelection(("editor" in this.editor ? this.editor.selection : this.reactEditor.selection).get(), true, bundle.selectedElementIds?.length
        ? bundle.selectedElementIds.flatMap(id => converted.idMap.get(id) ?? []) : created),
      elementIdMap: converted.idMap,
    } : undefined;
  }

  /**
   * Returns a structural selection for active canvas block objects.
   * @returns Block selection covering selected canvas block roots, if any.
   */
  private canvasBlockSelection(): Selection | undefined {
    const snapshot = findEdgelessRuntime(this.editor)?.get();
    const blockIds = snapshot?.active ? snapshot.items.flatMap((id) => {
      const element = this.elements.getElementNode(id);
      return element?.type === "block" ? blockIdsOf(element, this.rootIds()) : [];
    }) : [];
    return blockIds.length ? createStructuralSelection(blockIds) : undefined;
  }
}
