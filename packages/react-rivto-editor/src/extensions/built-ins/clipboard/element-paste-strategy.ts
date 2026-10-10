import type { EditorRuntime } from "../../../editor/editor-runtime";
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
import type { EditorViewApi } from "../../../editor-view/types";
import { blockIdsOf, blockRangeProps, insertBlockElementSeparator } from "../../../elements/block-element-projection";
import { createEdgelessSelection, findEdgelessRuntime } from "../selection/edgeless-runtime";

/** Canvas-specific clipboard paste strategy. */
export class ElementPasteStrategy implements PasteStrategy {
  /** Document managers used by both the installed controller and its view-bound operations. */
  get runtime(): EditorRuntime { return "runtime" in this.editor ? this.editor.runtime : this.editor; }

  /**
   * Creates a strategy for one React runtime.
   * @param editor - Runtime receiving canvas elements.
   */
  constructor(private readonly editor: EditorViewApi | EditorRuntime) {}

  /** Returns an independent strategy using the receiving view's surface and selection. */
  createViewStrategy(editorView: EditorViewApi): ElementPasteStrategy { return new ElementPasteStrategy(editorView); }

  /**
   * Accepts edgeless pastes that carry canvas elements or selected block objects.
   * @param context - Shared clipboard payload and paste intent.
   * @param _placement - Unused; canvas geometry is copied from source frames.
   * @returns True when this strategy should run after any block insertion.
   */
  matches(context: PasteContext, _placement: PastePlacement): boolean {
    // Core mode can be edgeless even when paste targets a page embedding.
    // Use the receiving surface so page paste does not create canvas elements.
    if (("runtime" in this.editor ? this.editor.events.getSurfaceType() : this.runtime.editorViews.getSurfaceType()) !== "edgeless") return false;
    if (!context.bundle) return false;
    if (context.bundle.elements?.length) return true;
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
    const selected = new Set(bundle.selectedElementIds ?? bundle.elements?.map((element) => element.id));
    const sources = (bundle.elements ?? []).filter((element) => selected.has(element.id));
    const elementIdMap = this.runtime.elements.createImportIdMap(sources.map((element) => element.id));
    const pastedRootIds = bundle.blocks.flatMap((block) => context.blockIdMap?.get(block.id) ?? []);
    if (!sources.length && !pastedRootIds.length) return undefined;
    const sourceRootIds = bundle.blocks.map((block) => block.id);
    const created: string[] = [];
    const importedElementIds = new Map<string, string>();
    const topLayer = Math.max(0, ...this.runtime.elements.getElements().map((element) => element.zIndex));
    this.runtime.history.batchUpdates(() => {
      if (!sources.length && pastedRootIds.length) {
        created.push(this.runtime.elements.insertElement({
          type: "block",
          frame: { x: 60, y: 60, width: 320, height: 120 },
          zIndex: topLayer + 1,
          props: blockRangeProps(pastedRootIds),
        }).id);
      }
      sources.forEach((source, index) => {
        const id = elementIdMap.get(source.id)!;
        if (source.type === "block") {
          const blockIds = blockIdsOf(source, sourceRootIds).flatMap((id) => context.blockIdMap?.get(id) ?? []);
          if (!blockIds.length) return;
          const first = blockIds[0];
          const roots = this.runtime.blocks.getRootIds();
          const before = first ? roots[roots.indexOf(first) - 1] : undefined;
          if (before) insertBlockElementSeparator(this.runtime, before);
          const createdElement = this.runtime.elements.insertElement({
            id,
            type: "block",
            frame: { ...source.frame, x: source.frame.x + 24, y: source.frame.y + 24 },
            zIndex: topLayer + index + 1,
            props: blockRangeProps(blockIds),
          });
          created.push(createdElement.id);
          importedElementIds.set(source.id, createdElement.id);
        } else {
          const createdElement = this.runtime.elements.insertElement({
            id,
            type: source.type,
            frame: { ...source.frame, x: source.frame.x + 24, y: source.frame.y + 24 },
            zIndex: topLayer + index + 1,
            props: structuredClone(source.props),
          });
          created.push(createdElement.id);
          importedElementIds.set(source.id, createdElement.id);
        }
      });
    });
    return created.length ? {
      proposedSelection: createEdgelessSelection(this.editor.selection.get(), true, created),
      elementIdMap: importedElementIds,
    } : undefined;
  }

  /**
   * Returns a structural selection for active canvas block objects.
   * @returns Block selection covering selected canvas block roots, if any.
   */
  private canvasBlockSelection(): Selection | undefined {
    const snapshot = findEdgelessRuntime(this.editor)?.get();
    const blockIds = snapshot?.active ? snapshot.items.flatMap((id) => {
      const element = this.runtime.elements.getElement(id);
      return element?.type === "block" ? blockIdsOf(element, this.runtime.blocks.getRootIds()) : [];
    }) : [];
    return blockIds.length ? createStructuralSelection(blockIds) : undefined;
  }
}
