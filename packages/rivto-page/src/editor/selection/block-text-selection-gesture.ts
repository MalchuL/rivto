import type { TextSelectionGesture } from "@chulane/rivto-root";
import type { BlockSelectionPosition, BlockTextSelectionGestureApi } from "./types";

/** Maps Root's owner identities to block positions for one pointer gesture. */
export class BlockTextSelectionGesture implements BlockTextSelectionGestureApi {
  readonly #gesture: TextSelectionGesture;

  /**
   * Borrows the occurrence-bound Root gesture for this pointer interaction.
   *
   * @param gesture - Root-owned browser endpoint operations for the attachment.
   */
  constructor(gesture: TextSelectionGesture) {
    this.#gesture = gesture;
  }

  /**
   * Captures the fixed endpoint beneath the initial pointer coordinates.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Block ID and UTF-16 offset, or undefined when caret hit testing fails.
   */
  readAnchor(x: number, y: number): BlockSelectionPosition | undefined {
    const point = this.#gesture.readAnchor(x, y);
    return point ? { blockId: point.ownerId, offset: point.offset } : undefined;
  }

  /**
   * Captures a candidate moving endpoint without replacing the last published endpoint.
   *
   * @param x - Horizontal client coordinate in CSS pixels.
   * @param y - Vertical client coordinate in CSS pixels.
   * @returns Block ID and UTF-16 offset, or undefined when the point cannot be mapped.
   */
  readHead(x: number, y: number): BlockSelectionPosition | undefined {
    const point = this.#gesture.readHead(x, y);
    return point ? { blockId: point.ownerId, offset: point.offset } : undefined;
  }

  /**
   * Checks whether this gesture began in editable content.
   *
   * @returns True when a browser anchor was captured and the attachment remains active.
   */
  hasAnchor(): boolean {
    return this.#gesture.hasAnchor();
  }

  /**
   * Checks whether the latest hit test found a browser endpoint.
   *
   * @returns True even when that endpoint cannot be mapped to a block position.
   */
  hasPendingHead(): boolean {
    return this.#gesture.hasPendingHead();
  }

  /**
   * Checks whether the latest published selection retained a browser endpoint.
   *
   * @returns True when a moving endpoint is available for restoration.
   */
  hasHead(): boolean {
    return this.#gesture.hasHead();
  }

  /**
   * Publishes or clears the moving browser endpoint for the current selection.
   *
   * @param hasHead - Whether the current selection uses the most recent hit-test endpoint.
   * @returns The retained endpoint matches the published selection.
   */
  commitHead(hasHead: boolean): void {
    this.#gesture.commitHead(hasHead);
  }

  /**
   * Replaces the fixed endpoint with an existing selection's portable position.
   *
   * Resolution can synchronously mount an absent virtual endpoint. The original
   * pointer point becomes the pending moving endpoint when both exist.
   *
   * @param position - Existing directed selection endpoint.
   * @returns True when the position and original pointer point are both available.
   * @throws Propagates selection endpoint resolution and synchronous mounting failures.
   */
  setAnchor(position: BlockSelectionPosition): boolean {
    return this.#gesture.setAnchor({ ownerId: position.blockId, offset: position.offset });
  }

  /**
   * Restores the directed native range using the retained live endpoints.
   *
   * A gesture created by the attached selection owner cannot restore into a later attachment.
   *
   * @returns The browser selection is restored when both endpoints exist.
   * @throws Propagates browser range failures from the Root gesture.
   */
  restore(): void {
    this.#gesture.restore();
  }
}
