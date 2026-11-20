import type { BrowserListenerControl } from "../../events/types";
import { claimPointerOwner, getPointerOwner, releaseEventPointerOwner } from "./pointer-ownership";

/** Browser-default and pointer-ownership operations for one native delivery. */
export class BrowserEventControl implements BrowserListenerControl {
  readonly #event: Event;
  readonly #root: HTMLElement;

  /**
   * Borrows the event and its receiving surface during synchronous delivery.
   *
   * @param event - Native event whose default and pointer ownership are controlled.
   * @param root - Surface whose current document owns the event's pointer gesture.
   */
  constructor(event: Event, root: HTMLElement) {
    this.#event = event;
    this.#root = root;
  }

  /**
   * Reads the originating pointer owner shared across listener owners.
   *
   * @returns Opaque occurrence identity, or undefined without an owner.
   */
  readonly getPointerOwner = (): object | undefined => {
    return getPointerOwner(this.#event, this.#root.ownerDocument);
  };

  /**
   * Sets the current document pointer owner.
   *
   * @param owner - Opaque identity of the originating occurrence.
   * @returns Later pointer continuations can resolve the owner.
   */
  readonly claimPointerOwner = (owner: object): void => {
    claimPointerOwner(this.#root.ownerDocument, owner);
  };

  /**
   * Clears the gesture captured by this delivery if it is still current.
   *
   * @returns A newer gesture remains active.
   */
  readonly releasePointerOwner = (): void => {
    releaseEventPointerOwner(this.#event, this.#root.ownerDocument);
  };

  /**
   * Reads the live browser default-prevention state for this delivery.
   *
   * @returns Whether an earlier listener prevented the default.
   */
  readonly isDefaultPrevented = (): boolean => {
    return this.#event.defaultPrevented;
  };

  /**
   * Requests cancellation when this browser delivery permits it.
   *
   * @returns The default cancellation request has been made when cancelable.
   */
  readonly preventDefault = (): void => {
    if (this.#event.cancelable) {
      this.#event.preventDefault();
    }
  };
}
