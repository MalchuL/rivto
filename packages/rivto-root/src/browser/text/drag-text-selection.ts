import type { EditableTextSelectionEnd, EditableTextSelectionPointer } from "../../events/types";

/**
 * Begins a native drag selection inside one captured editable region.
 *
 * @param element - Editable browser host owned by the calling region.
 * @param isCurrent - Checks the exact region and occurrence.
 * @param input - Pointer sample and synchronous default-cancellation capability.
 * @param onEnd - Called after the gesture releases its browser listeners.
 * @returns Idempotent cancellation, or undefined when no valid editable hit exists.
 * @throws Propagates browser hit testing, selection, listener, and cleanup failures.
 */
export function beginEditableTextSelection(
  element: HTMLElement,
  isCurrent: () => boolean,
  input: EditableTextSelectionPointer,
  onEnd: EditableTextSelectionEnd,
): (() => void) | undefined {
  if (!isCurrent() || !element.isContentEditable) {
    return;
  }
  const document = element.ownerDocument;
  const selection = document.getSelection();
  const anchor = document.caretPositionFromPoint?.(input.clientX, input.clientY);
  // This gesture owns the editable child's selection. Prevent the browser from
  // running a second rich-content selection over highlighted DOM.
  // If hit-testing resolves the highlighted sibling instead, retain native
  // focus and selection rather than preventing a gesture we cannot restore.
  if (!selection || !anchor || !element.contains(anchor.offsetNode) || !isCurrent()) {
    return;
  }
  input.preventDefault();
  if (!isCurrent()) {
    return;
  }
  element.focus({ preventScroll: true });
  if (!isCurrent()) {
    return;
  }
  selection.setBaseAndExtent(anchor.offsetNode, anchor.offset, anchor.offsetNode, anchor.offset);
  if (!isCurrent()) {
    return;
  }
  return new EditableTextSelection(
    element,
    selection,
    anchor,
    input.pointerId,
    isCurrent,
    onEnd,
  ).start();
}

/** Owns the window listeners for one occurrence-bound editable drag selection. */
class EditableTextSelection {
  private readonly document: Document;
  private readonly view: Window | null;
  private readonly cleanups: (() => void)[] = [];
  private focus: CaretPosition;
  private active = true;

  /**
   * Captures the browser objects and ownership needed for this pointer gesture.
   *
   * @param element - Editable host containing the accepted anchor.
   * @param selection - Browser selection in the captured document.
   * @param anchor - Accepted initial caret position.
   * @param pointerId - Pointer identity admitted by the initiating input.
   * @param isCurrent - Checks the exact region and occurrence.
   * @param onEnd - Called once after the gesture releases its listeners.
   */
  constructor(
    private readonly element: HTMLElement,
    private readonly selection: Selection,
    private readonly anchor: CaretPosition,
    private readonly pointerId: number,
    private readonly isCurrent: () => boolean,
    private readonly onEnd: EditableTextSelectionEnd,
  ) {
    this.document = element.ownerDocument;
    this.view = this.document.defaultView;
    this.focus = anchor;
  }

  /**
   * Installs pointer tracking on the captured window, rolling back partial setup.
   *
   * @returns Idempotent gesture cancellation that remains valid after detachment.
   * @throws Propagates listener setup failures and aggregates failed rollback.
   */
  start(): () => void {
    const view = this.view;
    if (!view || !this.isActive()) {
      this.dispose();
      return this.dispose;
    }
    try {
      for (const [type, listener] of [
        ["pointermove", this.move],
        ["pointerup", this.finish],
        ["pointercancel", this.finish],
      ] as const) {
        if (!this.isActive()) {
          this.dispose();
          return this.dispose;
        }
        this.cleanups.push(() => view.removeEventListener(type, listener));
        view.addEventListener(type, listener);
        if (!this.active) {
          view.removeEventListener(type, listener);
          return this.dispose;
        }
      }
      if (!this.isActive()) {
        this.dispose();
      }
      return this.dispose;
    } catch (error) {
      try {
        this.dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Editable selection setup failed");
      }
      throw error;
    }
  }

  /**
   * Checks region and document ownership without exposing either browser object.
   *
   * @returns Whether the original region still belongs to its captured document.
   * @throws Propagates occurrence ownership failures.
   */
  private isOwned(): boolean {
    return this.isCurrent() && this.element.ownerDocument === this.document && this.isCurrent();
  }

  /**
   * Checks whether this gesture can still update its captured selection.
   *
   * @returns False after cancellation, detachment, or document movement.
   * @throws Propagates occurrence ownership failures.
   */
  private isActive(): boolean {
    return this.active && this.isOwned() && this.active;
  }

  /**
   * Extends the selection only for the pointer that started this gesture.
   *
   * @param event - Browser pointer movement observed in the captured window.
   * @returns The selection follows an owned caret hit, when one exists.
   * @throws Propagates browser hit testing, selection, and ownership failures.
   */
  private move = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    if (!this.isActive()) {
      this.dispose();
      return;
    }
    const next = this.document.caretPositionFromPoint?.(event.clientX, event.clientY);
    if (!next || !this.element.contains(next.offsetNode) || !this.isActive()) {
      return;
    }
    this.focus = next;
    this.selection.setBaseAndExtent(
      this.anchor.offsetNode,
      this.anchor.offset,
      next.offsetNode,
      next.offset,
    );
  };

  /**
   * Releases pointer tracking and restores the final selection in the same region.
   *
   * @param event - Browser pointer release or cancellation in the captured window.
   * @returns The final caret range is restored when the occurrence remains current.
   * @throws Propagates cleanup, focus, selection, and ownership failures.
   */
  private finish = (event: PointerEvent): void => {
    if (event.pointerId !== this.pointerId) {
      return;
    }
    if (!this.isActive()) {
      this.dispose();
      return;
    }
    this.dispose();
    if (!this.isOwned()) {
      return;
    }
    this.element.focus({ preventScroll: true });
    if (this.isOwned()) {
      this.selection.setBaseAndExtent(
        this.anchor.offsetNode,
        this.anchor.offset,
        this.focus.offsetNode,
        this.focus.offset,
      );
    }
  };

  /**
   * Removes every pointer listener and notifies the consumer once.
   *
   * @returns The gesture can no longer update browser selection.
   * @throws AggregateError if listener cleanup or the completion callback fails.
   */
  private dispose = (): void => {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    for (const cleanup of [...this.cleanups.splice(0).reverse(), this.onEnd]) {
      try {
        cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Editable selection cleanup failed");
    }
  };
}
