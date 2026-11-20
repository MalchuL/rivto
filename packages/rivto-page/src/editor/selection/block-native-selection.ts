import type { BlockEditorSelection } from "../../adapter/types";
import type { BlockEditorEventsApi } from "../events/types";
import type { BlockBrowserSelectionApi } from "./types";
import { BlockSelectionRanges } from "./block-selection-ranges";
import type { BlockPointerSelection } from "./block-pointer-selection";

/** Synchronizes native ranges with host-owned coverage without owning pointer gestures. */
export class BlockNativeSelection {
  /**
   * Borrows coverage and the pointer's current selection authority.
   *
   * @param events - Native observation registrations captured by extension setup.
   * @param selection - Host selection reads, writes and native-restoration state.
   * @param pointer - Read-only gesture authority; this observer cannot cancel it.
   * @param browserSelection - Occurrence-bound selection reads without browser objects.
   */
  constructor(
    private readonly events: Pick<BlockEditorEventsApi, "observe">,
    private readonly selection: Pick<
      BlockEditorSelection,
      "get" | "set" | "clear" | "isNativeSelectionSuspended"
    >,
    private readonly pointer: Pick<BlockPointerSelection, "isSelectionOwned">,
    private readonly browserSelection: Pick<
      BlockBrowserSelectionApi,
      "readEditorDOMSelection" | "hasVirtualizedMissingEndpoints"
    >,
  ) {}

  /**
   * Installs native selection registrations into the current extension scope.
   *
   * @returns Feature registrations have been captured by the extension owner.
   */
  install(): void {
    const events = this.events;
    events.observe(
      "selection.before-input",
      { type: "beforeinput", scope: "content", priority: 0 },
      this.onBeforeInput,
    );
    events.observe(
      "selection.change",
      { type: "selectionchange", target: "document", priority: 0 },
      this.onSelectionChange,
    );
  }

  /**
   * Captures the live DOM selection before input so undo can restore the original caret.
   *
   * @returns Host coverage captures the live caret without claiming input.
   */
  private onBeforeInput = () => {
    // Native selectionchange may arrive after typing and an immediate undo.
    // Capture the live caret before input mutates the document so history can
    // restore editable focus even when that asynchronous event has not arrived.
    const selection = this.browserSelection.readEditorDOMSelection();
    if (selection) {
      this.selection.set(selection);
    }
  };
  /**
   * Mirrors browser selection changes unless a host restoration, synthetic drag or missing virtual endpoint owns selection.
   *
   * @returns Host coverage follows native selection unless a host command, pointer or virtualization owns it.
   */
  private onSelectionChange = () => {
    if (this.pointer.isSelectionOwned() || this.selection.isNativeSelectionSuspended?.()) {
      return;
    }
    const selection = this.browserSelection.readEditorDOMSelection();
    const currentSelection = this.selection.get();
    if (
      !selection &&
      currentSelection &&
      this.browserSelection.hasVirtualizedMissingEndpoints(currentSelection)
    ) {
      return;
    }
    if (selection) {
      this.selection.set(selection);
    } else {
      // Losing the browser range keeps a structural selection and clears carets.
      const current = this.selection.get();
      // Virtualized missing endpoints were handled above. An absent native range
      // with mounted endpoints represents a normal loss of the editable caret.
      if (current && !BlockSelectionRanges.isStructuralSelection(current)) {
        this.selection.clear();
      }
    }
  };
}
