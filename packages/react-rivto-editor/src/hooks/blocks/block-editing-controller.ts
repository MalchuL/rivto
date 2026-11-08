import type { HTMLAttributes, RefObject } from "react";
import { restoreDOMSelection, saveDOMSelection } from "../../managers";

/** Owns one editable's DOM synchronization and composition; nested pointer gestures have a separate lifecycle. */
export class BlockEditingController {
  readonly elementRef: RefObject<HTMLDivElement | null> = { current: null };
  private syncedElement: HTMLDivElement | null = null;
  private composing = false;
  private content: string | undefined;

  /** Creates local state only; React attaches the ref and runs synchronization after commit. */
  constructor(private readonly setContent: (content: string) => void) {}

  /**
   * Reconciles command or remote text before paint while preserving an active text selection.
   *
   * A selection can remain inside an editable after focus moves to a menu or
   * another control. Restoring that stale selection would move focus back into
   * the editor, so only an active editable retains its browser selection.
   * An active IME retains DOM ownership until composition finishes.
   *
   * @param content - Current document text to display outside composition.
   * @returns Updates the editable text and, when applicable, its native selection.
   */
  synchronize(content: string): void {
    this.content = content;
    const element = this.elementRef.current;
    if (!element || this.composing) {
      return;
    }

    // A newly mounted editable has no live selection to preserve. Avoid a
    // document selection read for every block mounted by a large tree move.
    const wasMounted = this.syncedElement === element;
    this.syncedElement = element;
    if (element.textContent !== content) {
      const active = element.ownerDocument.activeElement;
      const selection =
        wasMounted && active && "isContentEditable" in active && active.isContentEditable === true
          ? saveDOMSelection(element)
          : null;
      element.textContent = content;
      restoreDOMSelection(element, selection);
    }
  }

  /** Persists input outside an active IME composition. */
  onInput: NonNullable<HTMLAttributes<HTMLDivElement>["onInput"]> = (event) => {
    if (!this.composing) {
      this.commit(event.currentTarget);
    }
  };

  /** Lets the IME own the DOM until it completes. */
  onCompositionStart = (): void => {
    this.composing = true;
  };

  /** Commits the final composition text once. */
  onCompositionEnd: NonNullable<HTMLAttributes<HTMLDivElement>["onCompositionEnd"]> = (event) => {
    this.composing = false;
    this.commit(event.currentTarget);
  };

  /**
   * Commits the editable host's complete plain text through the controller's content operation.
   *
   * @param element - Element snapshot or DOM host used by the operation.
   */
  private commit(element: HTMLDivElement): void {
    // ponytail: composition commits whole plain text; use beforeinput deltas if
    // concurrent character-level IME merging becomes a demonstrated need.
    const content = element.textContent ?? "";
    if (content !== this.content) {
      this.setContent(content);
      this.content = content;
    }
  }
}
