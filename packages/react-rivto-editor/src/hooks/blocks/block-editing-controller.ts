import type { HTMLAttributes, RefObject } from "react";
import { restoreDOMSelection, saveDOMSelection } from "../../managers";

/** Owns one editable's DOM synchronization and composition; nested pointer gestures have a separate lifecycle. */
export class BlockEditingController {
  readonly elementRef: RefObject<HTMLDivElement | null> = { current: null };
  private syncedElement: HTMLDivElement | null = null;
  private composing = false;

  /** Creates local state only; React attaches the ref and runs synchronization after commit. */
  constructor(private readonly setContent: (content: string) => void) {}

  /** Reconciles command or remote text before paint; an active IME retains ownership. */
  synchronize(content: string): void {
    const element = this.elementRef.current;
    if (!element || this.composing) return;

    // A newly mounted editable has no live selection to preserve. Avoid a
    // document selection read for every block mounted by a large tree move.
    const wasMounted = this.syncedElement === element;
    this.syncedElement = element;
    if (element.textContent !== content) {
      const selection = wasMounted ? saveDOMSelection(element) : null;
      element.textContent = content;
      restoreDOMSelection(element, selection);
    }
  }

  private commit(element: HTMLDivElement): void {
    // ponytail: composition commits whole plain text; use beforeinput deltas if
    // concurrent character-level IME merging becomes a demonstrated need.
    this.setContent(element.textContent ?? "");
  }

  /** Persists input outside an active IME composition. */
  onInput: NonNullable<HTMLAttributes<HTMLDivElement>["onInput"]> = (event) => {
    if (!this.composing) this.commit(event.currentTarget);
  };

  /** Lets the IME own the DOM until it completes. */
  onCompositionStart = (): void => { this.composing = true; };

  /** Commits the final composition text once. */
  onCompositionEnd: NonNullable<HTMLAttributes<HTMLDivElement>["onCompositionEnd"]> = (event) => {
    this.composing = false;
    this.commit(event.currentTarget);
  };
}
