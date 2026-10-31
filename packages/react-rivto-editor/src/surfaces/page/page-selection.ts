import { Listeners } from "@chulane/rivto-utils";
import {
  createEdgelessSelection,
  isEdgelessSelectionActive,
} from "../../extensions/built-ins/selection/edgeless-runtime";
import {
  isStructuralSelection,
  type ModeManagerApi,
  type PanelAPI,
  type Selection,
} from "@chulane/rivto";
import type {
  BlockEditorBlocks,
  BlockEditorSelection,
  BlockSelectionSnapshot,
} from "@chulane/rivto-page";
import type { PanelSelectionApi } from "../../managers/selection/api";
import type { BlockTypesApi } from "../../managers/blocks/block-types-api";
import type { BlockBehaviorsApi } from "../../managers/blocks/block-behaviors-api";
import { BLOCK_TEXT_METADATA_KEY } from "../../managers/selection/block-text-metadata";

/** Existing host stores borrowed by Page; no independent writable selection is created. */
interface PageSelectionHost {
  readonly mode?: Pick<ModeManagerApi, "get" | "subscribe">;
  readonly getRoot?: () => HTMLElement | null;
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode">;
  readonly selection: Pick<
    PanelSelectionApi,
    "snapshot" | "set" | "clear" | "subscribe" | "isBlockSelected" | "hasPendingSelectionCallback"
  >;
  readonly document: { readonly selection: Pick<PanelAPI["document"]["selection"], "snapshot"> };
  readonly editor: {
    readonly blockTypes: Pick<
      BlockTypesApi,
      "getDefinition" | "separatesBlockElements" | "subscribe"
    >;
    readonly blockBehaviors: Pick<BlockBehaviorsApi, "subscribe">;
  };
  readonly subscribe: PanelAPI["subscribe"];
}

/** Panel-owned selection adapter with addressed membership feedback and model-based outline order. */
export class PageSelection implements BlockEditorSelection {
  /** Selection membership subscribers keyed by block ID. */
  private readonly listeners = new Listeners<Record<string, void>>();
  private readonly releases: Array<() => void> = [];
  private previousSelection: Selection | undefined;
  private order: readonly string[] = [];
  private orderDirty = true;
  private destroyed = false;

  /**
   * Observes the existing panel stores without acquiring document or controller ownership.
   *
   * The previous shared snapshot is retained only to compute changed membership
   * IDs. Commands always read and write the panel's authoritative selection.
   *
   * @param panel - Panel selection, live definitions and document-change notifications.
   * @param blocks - Addressed structural snapshots, including unmounted nodes.
   * @throws Rolls back installed subscriptions if later setup fails.
   */
  constructor(
    private readonly panel: PageSelectionHost,
    private readonly blocks: Pick<BlockEditorBlocks, "getBlockIds" | "getBlockNode">,
  ) {
    this.previousSelection = panel.document.selection.snapshot();
    try {
      this.releases.push(panel.selection.subscribe(this.publishMembership));
      this.releases.push(panel.subscribe(this.invalidateOrder));
      this.releases.push(panel.editor.blockBehaviors.subscribe(this.invalidateOrder));
      this.releases.push(panel.editor.blockTypes.subscribe(this.invalidateOrder));
      if (panel.mode) {
        this.releases.push(panel.mode.subscribe(this.invalidateOrder));
      }
    } catch (error) {
      try {
        this.destroy();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page selection setup failed");
      }
      throw error;
    }
  }

  /**
   * Preserves command-owned model selection until the host restores its DOM endpoints.
   *
   * @returns Whether a scheduled host caret restoration is still pending.
   */
  isNativeSelectionSuspended(): boolean {
    return this.panel.selection.hasPendingSelectionCallback;
  }

  /**
   * Reads block coverage owned by this panel, excluding element-only selection.
   *
   * @returns The existing stable panel snapshot, or undefined without local block coverage.
   */
  get(): BlockSelectionSnapshot | undefined {
    const selection = this.panel.selection.snapshot();
    return selection?.blocks.length ? selection : undefined;
  }

  /**
   * Publishes Page coverage through the panel's existing validation and ownership rules.
   *
   * @param selection - Directed immutable ranges supplied by Page interaction.
   * @returns The panel has accepted or cleared coverage according to its boundary policy.
   * @throws Propagates host selection validation and subscriber failures.
   */
  set(selection: BlockSelectionSnapshot): void {
    let next: Selection = { ...selection, blocks: selection.blocks.map((range) => ({ ...range })) };
    if (this.panel.mode?.get() === "edgeless" && isStructuralSelection(next)) {
      const current = this.panel.selection.snapshot();
      const active = isEdgelessSelectionActive(current);
      next = createEdgelessSelection(
        { ...next, pluginData: { ...current?.pluginData, ...next.pluginData } },
        active,
        active ? current?.elements : [],
      );
    }
    this.panel.selection.set(next);
  }

  /**
   * Reserves canvas background and active pan gestures for the host's element tools.
   *
   * A mounted surface determines ownership independently of the document mode.
   * Page embeddings remain selectable inside an Edgeless document, while
   * unclaimed canvas block input retains ordinary row and body selection.
   *
   * @param event - Native input about to start block selection.
   * @returns Whether this input belongs to writing-page or canvas block content.
   */
  canStartSelection(event: MouseEvent): boolean {
    const root = this.panel.getRoot?.();
    const surface = root?.dataset.rivtoSurface ?? this.panel.mode?.get();
    if (surface !== "edgeless") {
      return true;
    }
    if (root?.dataset.panningReady === "true" || root?.dataset.edgelessPanTool === "true") {
      return false;
    }
    const target = event.target;
    return target instanceof Element && !!target.closest("[data-block-id]");
  }

  /**
   * Clears the authoritative panel selection and its addressed membership feedback.
   *
   * @returns The host's selection clear operation has completed.
   */
  clear(): void {
    this.panel.selection.clear();
  }

  /**
   * Reads the complete expanded model order without consulting mounted DOM.
   *
   * The first read after a document or behavior change visits the expanded
   * outline, excluding root separators hidden by the canvas card projection. Nested
   * separators remain selectable. Mode and definition changes invalidate this
   * projection as well. Subsequent gesture reads reuse the array. Payload-only changes
   * preserve the previous array identity when the resulting order is unchanged.
   *
   * @returns Stable expanded IDs, including blocks outside the virtual viewport.
   * @throws Propagates addressed model reads and host visibility-rule failures.
   */
  getSelectableBlockIds(): readonly string[] {
    if (!this.orderDirty) {
      return this.order;
    }
    const next: string[] = [];
    const roots = this.blocks.getBlockIds();
    const displayed =
      this.panel.mode?.get() === "edgeless"
        ? roots.filter((id) => {
            const block = this.panel.blocks.getBlockNode(id);
            return block && !this.panel.editor.blockTypes.separatesBlockElements(block.type);
          })
        : roots;
    const pending = [...displayed].reverse();
    while (pending.length) {
      const node = this.blocks.getBlockNode(pending.pop()!);
      if (!node) {
        continue;
      }
      next.push(node.id);
      if (!node.collapsed) {
        for (let index = node.childIds.length - 1; index >= 0; index -= 1) {
          pending.push(node.childIds[index]!);
        }
      }
    }
    if (next.length !== this.order.length || next.some((id, index) => this.order[index] !== id)) {
      this.order = next;
    }
    this.orderDirty = false;
    return this.order;
  }

  /**
   * Reads host-declared text coverage independently of whether a renderer is mounted.
   *
   * Empty text has length zero. A renderer without the annotation is contentless
   * for range selection even if its persisted record happens to contain text.
   * Classification reads the live host definition and remains independent of
   * mounted DOM and viewport windowing.
   *
   * @param blockId - Block within the panel's displayed subtree.
   * @returns UTF-16 length, including zero for empty text, or undefined for a contentless or missing block.
   */
  getTextLength(blockId: string): number | undefined {
    const block = this.panel.blocks.getBlockNode(blockId);
    if (!block) {
      return undefined;
    }
    const definition = this.panel.editor.blockTypes.getDefinition(block.type);
    return definition?.metadata?.[BLOCK_TEXT_METADATA_KEY] === true
      ? block.content.length
      : undefined;
  }

  /**
   * Reads shared whole-block membership using the panel's existing selection semantics.
   *
   * @param blockId - Identity whose structural coverage is requested.
   * @returns Whether the whole accessible block is selected, including in another occurrence.
   */
  isBlockSelected(blockId: string): boolean {
    return (
      Boolean(this.panel.blocks.getBlockNode(blockId)) &&
      this.panel.selection.isBlockSelected(blockId)
    );
  }

  /**
   * Observes only changes to one block's whole-block coverage.
   *
   * @param blockId - Stable identity to observe, including an unmounted node.
   * @param listener - Callback invoked after that membership bit changes.
   * @returns Idempotent disposer removing this registration.
   * @throws If the adapter has been destroyed.
   */
  subscribeBlock(blockId: string, listener: () => void): () => void {
    if (this.destroyed) {
      throw new Error("Page selection is destroyed");
    }
    // Keep repeated registrations of the same listener independently disposable.
    const notify = () => listener();
    return this.listeners.subscribe(blockId, notify);
  }

  /**
   * Releases every owned subscription without modifying host selection or document data.
   *
   * @returns No adapter observers or addressed listeners remain; repeated destruction is harmless.
   * @throws AggregateError after attempting all releases if cleanup fails.
   */
  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    this.listeners.clear();
    const errors: unknown[] = [];
    for (const release of this.releases.splice(0).reverse()) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Page selection cleanup failed");
    }
  }

  /**
   * Invalidates only the derived outline order after a host change.
   *
   * @returns The next order read will reconcile IDs while preserving unchanged array identity.
   */
  private invalidateOrder = (): void => {
    this.orderDirty = true;
  };

  /**
   * Delivers membership notifications only for IDs changed between shared snapshots.
   *
   * @returns The comparison snapshot and affected addressed subscribers are current.
   * @throws Propagates subscriber failures after updating the comparison snapshot.
   */
  private publishMembership = (): void => {
    const previousSelection = this.previousSelection;
    this.previousSelection = this.panel.document.selection.snapshot();
    if (!this.listeners.size || previousSelection?.blocks === this.previousSelection?.blocks) {
      return;
    }
    const previous = this.structuralIds(previousSelection);
    const next = this.structuralIds(this.previousSelection);
    for (const id of previous) {
      if (!next.has(id)) {
        this.notifyBlock(id);
      }
    }
    for (const id of next) {
      if (!previous.has(id)) {
        this.notifyBlock(id);
      }
    }
  };

  /**
   * Notifies a captured group of observers for one changed block.
   *
   * @param blockId - Identity whose whole-block coverage changed.
   * @returns All captured listeners were invoked unless one threw.
   * @throws Propagates the first observer failure.
   */
  private notifyBlock(blockId: string): void {
    this.listeners.emit(blockId);
  }

  /**
   * Extracts whole-block coverage from the authoritative shared snapshot.
   *
   * @param selection - Current or previous shared selection, possibly element-only.
   * @returns IDs whose range covers the complete block with the live-end sentinel.
   */
  private structuralIds(selection: Selection | undefined): Set<string> {
    const ids = new Set<string>();
    for (const range of selection?.blocks ?? []) {
      if (range.start === 0 && range.end === -1) {
        ids.add(range.id);
      }
    }
    return ids;
  }
}
