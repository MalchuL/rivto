import type { BlockEditorSelection } from "../../adapter/types";
import type { BlockEditorEventsApi } from "../events/block-editor-events";
import type { BlockInputEvent } from "../events/block-input-event";
import { BlockVirtualizationController } from "../virtualization/block-virtualization-controller";
import { BlockDOMSelection } from "./block-dom-selection";
import { BlockSelectionRanges } from "./block-selection-ranges";
import type { BlockPointerSelection } from "./block-pointer-selection";

/** Synchronizes native ranges with host-owned coverage without owning pointer gestures. */
export class BlockNativeSelection {
  private readonly dom: BlockDOMSelection;

  /**
   * Borrows coverage and the pointer's current selection authority.
   *
   * @param events - Native observation registrations captured by extension setup.
   * @param selection - Host selection reads and writes used by DOM range conversion.
   * @param pointer - Read-only gesture authority; this observer cannot cancel it.
   */
  constructor(
    private readonly events: Pick<BlockEditorEventsApi, "observe">,
    private readonly selection: Pick<
      BlockEditorSelection,
      | "get"
      | "set"
      | "clear"
      | "getSelectableBlockIds"
      | "getTextLength"
      | "isNativeSelectionSuspended"
    >,
    private readonly pointer: Pick<BlockPointerSelection, "isSelectionOwned">,
  ) {
    this.dom = new BlockDOMSelection(selection);
  }

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
   * @param input - Occurrence receiving beforeinput, before native text mutation.
   * @returns Host coverage captures the live caret without claiming input.
   */
  private onBeforeInput = ({ root }: BlockInputEvent<"beforeinput">) => {
    // Native selectionchange may arrive after typing and an immediate undo.
    // Capture the live caret before input mutates the document so history can
    // restore editable focus even when that asynchronous event has not arrived.
    const selection = this.dom.readEditorDOMSelection(root);
    if (selection) {
      this.selection.set(selection);
    }
  };
  /**
   * Mirrors browser selection changes unless a host restoration, synthetic drag or missing virtual endpoint owns selection.
   *
   * @param input - Occurrence root receiving the document selectionchange.
   * @returns Host coverage follows native selection unless a host command, pointer or virtualization owns it.
   */
  private onSelectionChange = ({ root }: BlockInputEvent<"selectionchange">) => {
    if (this.pointer.isSelectionOwned() || this.selection.isNativeSelectionSuspended?.()) {
      return;
    }
    const selection = this.dom.readEditorDOMSelection(root);
    const currentSelection = this.selection.get();
    if (
      !selection &&
      BlockVirtualizationController.getForRoot(root) &&
      currentSelection &&
      [currentSelection.anchorBlockId, currentSelection.focusBlockId].some(
        (id) => id && !root.querySelector(`[data-block-id="${CSS.escape(id)}"]`),
      )
    ) {
      return;
    }
    if (selection) {
      this.selection.set(selection);
    } else {
      // Losing the browser range keeps a structural selection and clears carets.
      const current = this.selection.get();
      // Virtualized missing endpoints were handled above. An absent native range
      // with mounted endpoints clears the caret only while this occurrence retains focus.
      // Another panel taking focus must preserve this occurrence's retained selection.
      if (
        current &&
        root.contains(root.ownerDocument.activeElement) &&
        !BlockSelectionRanges.isStructuralSelection(current)
      ) {
        this.selection.clear();
      }
    }
  };
}
