import { Listeners } from "../utils";
import { deleteSelection } from "../managers/selection-manager/delete-selection";
import { isStructuralSelection, type Selection } from "../managers/selection-manager";
import type {
  BlockManagerApi,
  ElementManagerApi,
  HistoryBatch,
  SelectionManagerApi,
} from "../managers/types";

/** Operations borrowed by selection deletion; the panel retains their lifecycle. */
interface PanelSelectionEditor {
  /** Bounded block reads and mutations used by selection commands. */
  readonly blocks: Pick<
    BlockManagerApi,
    "hasBlock" | "canRemove" | "removeBlocks" | "replaceTextSelection" | "subscribeStructure"
  >;
  /** Bounded element membership and deletion. */
  readonly elements: Pick<
    ElementManagerApi,
    "hasElement" | "removeElements" | "subscribeStructure"
  >;
  /** Groups selection mutations into one history transaction. */
  readonly history: HistoryBatch;
}

/** Limits shared selection commands to the panel's current block and element boundaries. */
export class PanelSelection implements SelectionManagerApi {
  private readonly listeners = new Listeners<{ change: void }>();
  private readonly subscriptions: (() => void)[] = [];
  /**
   * Binds selection operations to one panel while retaining shared selection state.
   *
   * @param panel - Panel providing bounded block and element operations.
   * @param selection - Selection state owned by the source editor.
   */
  constructor(
    private readonly panel: PanelSelectionEditor,
    private readonly selection: Pick<
      SelectionManagerApi,
      | "get"
      | "snapshot"
      | "isBlockSelected"
      | "isElementSelected"
      | "resolveBlockSelection"
      | "set"
      | "clear"
      | "subscribe"
    >,
  ) {}

  /**
   * Reads a detached shared selection when all its members belong to this panel.
   *
   * @returns The selection, or undefined when empty or outside the panel.
   */
  get(): Selection | undefined {
    const current = this.selection.get();
    return current && this.contains(current) ? current : undefined;
  }

  /**
   * Reads the immutable shared selection snapshot within this panel.
   *
   * @returns The stable snapshot, or undefined when empty or outside the panel.
   */
  snapshot(): Selection | undefined {
    const current = this.selection.snapshot();
    return current && this.contains(current) ? current : undefined;
  }

  /**
   * Checks structural selection coverage for a visible block.
   *
   * @param id - Block identifier to inspect.
   * @returns True when the block is in this panel and structurally selected.
   */
  isBlockSelected(id: string): boolean {
    return this.panel.blocks.hasBlock(id) && this.selection.isBlockSelected(id);
  }

  /**
   * Checks whether a visible element belongs to the shared selection.
   *
   * @param id - Element identifier to inspect.
   * @returns True when the element is in this panel and selected.
   */
  isElementSelected(id: string): boolean {
    return this.panel.elements.hasElement(id) && this.selection.isElementSelected(id);
  }

  /**
   * Resolves block offsets only for a selection contained in this panel.
   *
   * @param selection - Optional selection; defaults to this panel's current selection.
   * @returns Live block ranges, or undefined when the selection is absent or outside the panel.
   */
  resolveBlockSelection(
    selection = this.get(),
  ): ReturnType<SelectionManagerApi["resolveBlockSelection"]> {
    return selection && this.contains(selection)
      ? this.selection.resolveBlockSelection(selection)
      : undefined;
  }

  /**
   * Publishes a shared selection after checking its panel membership.
   *
   * @param selection - Selection whose blocks and elements must all be visible in this panel.
   * @returns After the shared selection has been updated.
   * @throws If a selected record is outside the panel or the source rejects the selection.
   */
  set(selection: Selection): void {
    if (!this.contains(selection)) {
      throw new Error("Selection is outside panel");
    }
    this.selection.set(selection);
  }

  /**
   * Deletes the current panel selection through bounded block and element commands.
   *
   * Structural deletion protects an included root. Text replacement retains the
   * first block and publishes its resulting caret; all changes share one history batch.
   *
   * @param selection - Content to delete, defaulting to the current bounded selection.
   * @returns After deletion, or without changes when selection is absent, outside, or protected.
   * @throws If a bounded command or structural behavior fails.
   */
  delete(selection = this.selection.get()): void {
    if (!selection || !this.contains(selection)) {
      return;
    }
    if (
      isStructuralSelection(selection) &&
      selection.blocks.some(({ id }) => !this.panel.blocks.canRemove(id))
    ) {
      return;
    }
    deleteSelection(this.panel, this.selection, selection);
  }

  /**
   * Clears the shared selection only when it belongs to this panel.
   *
   * @returns After clearing, or without changes when the selection is outside this panel.
   */
  clear(): void {
    if (this.get()) {
      this.selection.clear();
    }
  }

  /**
   * Subscribes to changes of the source editor's shared selection and its panel membership.
   *
   * All observers share the same hierarchy subscriptions until the last observer leaves.
   *
   * @param listener - Callback invoked after a shared selection change or when hierarchy changes its visibility.
   * @returns Disposer for this subscription.
   */
  subscribe(listener: () => void): () => void {
    if (!this.listeners.size) {
      let visible = this.snapshot();
      const notifySelection = () => {
        visible = this.snapshot();
        this.listeners.emit("change");
      };
      const notifyMembership = () => {
        const next = this.snapshot();
        if (visible !== next) {
          visible = next;
          this.listeners.emit("change");
        }
      };
      try {
        this.subscriptions.push(this.selection.subscribe(notifySelection));
        this.subscriptions.push(this.panel.blocks.subscribeStructure(notifyMembership));
        this.subscriptions.push(this.panel.elements.subscribeStructure(notifyMembership));
      } catch (error) {
        this.destroy();
        throw error;
      }
    }
    const unsubscribe = this.listeners.subscribe("change", listener);
    return () => {
      unsubscribe();
      if (!this.listeners.size) {
        this.destroy();
      }
    };
  }

  /**
   * Releases selection subscriptions created through this panel.
   *
   * @returns After removing the panel's listeners from the shared selection.
   * @throws AggregateError after attempting every cleanup if any subscription fails.
   */
  destroy(): void {
    const errors: unknown[] = [];
    this.listeners.clear();
    for (const unsubscribe of this.subscriptions.splice(0)) {
      try {
        unsubscribe();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Panel selection cleanup failed");
    }
  }

  /**
   * Checks every selected block and element against the current panel boundaries.
   *
   * @param selection - Candidate shared selection.
   * @returns Whether all members are visible through this panel.
   */
  private contains(selection: Selection): boolean {
    return (
      selection.blocks.every(({ id }) => this.panel.blocks.hasBlock(id)) &&
      (selection.elements ?? []).every((id) => this.panel.elements.hasElement(id))
    );
  }
}
