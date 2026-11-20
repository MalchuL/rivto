import type {
  TextSelectionGesture,
  TextSelectionPosition,
  TextSelectionQuery,
} from "../../text/types";
import type { BrowserCaretDocument, BrowserTextSelectionPoint } from "./types";
import { readTextPosition } from "./read-text-selection";
import { resolveBrowserTextPoint, setBrowserTextSelection } from "./restore-text-selection";

/** Retains exact browser selection endpoints for one pointer gesture. */
export class BrowserTextSelectionGesture implements TextSelectionGesture {
  #anchor?: BrowserTextSelectionPoint;
  #pendingHead?: BrowserTextSelectionPoint;
  #head?: BrowserTextSelectionPoint;
  readonly #root: HTMLElement;
  readonly #query: TextSelectionQuery;
  readonly #mountMissing: (ownerId: string) => void;
  readonly #isAttached: () => boolean;

  /**
   * Binds browser point operations to the originating occurrence and caller.
   *
   * @param root - Mounted occurrence owning the gesture.
   * @param query - Selectors identifying content, owners, and boundaries.
   * @param mountMissing - Requests synchronous mounting of an absent owner.
   * @param isAttached - Checks the originating caller and Root attachment.
   */
  constructor(
    root: HTMLElement,
    query: TextSelectionQuery,
    mountMissing: (ownerId: string) => void,
    isAttached: () => boolean,
  ) {
    this.#root = root;
    this.#query = query;
    this.#mountMissing = mountMissing;
    this.#isAttached = isAttached;
  }

  /**
   * Captures the fixed endpoint beneath the initial pointer coordinates.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns Owner identity and UTF-16 offset, or undefined when unavailable.
   */
  readAnchor(x: number, y: number): TextSelectionPosition | undefined {
    if (!this.#isAttached()) {
      return undefined;
    }
    this.#anchor = this.readPoint(x, y);
    return this.#isAttached() && this.#anchor
      ? readTextPosition(this.#root, this.#anchor.node, this.#anchor.offset, this.#query)
      : undefined;
  }

  /**
   * Captures a candidate moving endpoint without replacing the published one.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns Owner identity and UTF-16 offset, or undefined when unavailable.
   */
  readHead(x: number, y: number): TextSelectionPosition | undefined {
    if (!this.#isAttached()) {
      return undefined;
    }
    this.#pendingHead = this.readPoint(x, y);
    return this.#isAttached() && this.#pendingHead
      ? readTextPosition(this.#root, this.#pendingHead.node, this.#pendingHead.offset, this.#query)
      : undefined;
  }

  /**
   * Checks whether this gesture began in editable content.
   *
   * @returns True while attached and a browser anchor was captured.
   */
  hasAnchor(): boolean {
    return this.#isAttached() && this.#anchor !== undefined;
  }

  /**
   * Checks whether the latest hit test found a browser endpoint.
   *
   * @returns True even when that endpoint cannot be mapped to an owner position.
   */
  hasPendingHead(): boolean {
    return this.#isAttached() && this.#pendingHead !== undefined;
  }

  /**
   * Checks whether the latest published selection retained a browser endpoint.
   *
   * @returns True while attached and a moving endpoint is available for restoration.
   */
  hasHead(): boolean {
    return this.#isAttached() && this.#head !== undefined;
  }

  /**
   * Publishes or clears the moving browser endpoint for the current selection.
   *
   * @param hasHead - Whether selection uses the most recent hit-test endpoint.
   * @returns The retained endpoint matches the published selection while attached.
   */
  commitHead(hasHead: boolean): void {
    if (this.#isAttached()) {
      this.#head = hasHead ? this.#pendingHead : undefined;
    }
  }

  /**
   * Replaces the fixed endpoint with an existing selection's portable position.
   *
   * Resolution can synchronously mount an absent virtual endpoint. The original
   * pointer point becomes the pending moving endpoint when both exist.
   *
   * @param position - Existing directed selection endpoint.
   * @returns True when the position and original pointer point are both available.
   * @throws Propagates endpoint resolution and synchronous mounting failures.
   */
  setAnchor(position: TextSelectionPosition): boolean {
    if (!this.#isAttached()) {
      return false;
    }
    const anchor = resolveBrowserTextPoint(
      this.#root,
      this.#query,
      position,
      this.#mountMissing,
      this.#isAttached,
    );
    if (!anchor || !this.#anchor || !this.#isAttached()) {
      return false;
    }
    this.#pendingHead = this.#anchor;
    this.#anchor = anchor;
    return true;
  }

  /**
   * Restores the directed native range using the retained live endpoints.
   *
   * A gesture created by an attached selection owner cannot restore into a later attachment.
   *
   * @returns The browser selection is restored when both endpoints exist.
   * @throws Propagates browser range failures.
   */
  restore(): void {
    if (this.#isAttached() && this.#anchor && this.#head) {
      setBrowserTextSelection(this.#anchor, this.#head);
    }
  }

  /**
   * Resolves the nearest selectable browser endpoint at viewport coordinates.
   *
   * Prefer the browser's caret hit test: Firefox's `caretPositionFromPoint`
   * provides an offset node and offset; Chromium's `caretRangeFromPoint`
   * provides a Range start container and offset. Both can return Text nodes.
   * If the hit falls outside the chosen content host, or the browser only tests
   * the focused contenteditable, text nodes are measured locally instead.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns A live browser endpoint, or undefined when no owned content exists.
   */
  private readPoint(x: number, y: number): BrowserTextSelectionPoint | undefined {
    const content = this.contentNearPoint(x, y);
    if (!content) {
      return undefined;
    }
    const document = this.#root.ownerDocument;
    const caret = document.caretPositionFromPoint?.(x, y);
    const fallback = (document as BrowserCaretDocument).caretRangeFromPoint?.(x, y);
    const node = caret?.offsetNode ?? fallback?.startContainer;
    const offset = caret?.offset ?? fallback?.startOffset;
    return node && offset !== undefined && content.contains(node)
      ? { node, offset, content }
      : this.nearestTextPoint(content, x, y);
  }

  /**
   * Finds the editable content under the pointer, or the closest owned host in a gap.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns Hit content or the nearest eligible content host, if any.
   */
  private contentNearPoint(x: number, y: number): HTMLElement | undefined {
    const hit = this.#root.ownerDocument
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>(this.#query.contentSelector);
    if (
      hit &&
      this.#root.contains(hit) &&
      hit.closest(this.#query.boundarySelector) === this.#root
    ) {
      return hit;
    }
    return [...this.#root.querySelectorAll<HTMLElement>(this.#query.contentSelector)]
      .filter(
        (content) =>
          Boolean(
            content.closest(this.#query.ownerSelector)?.getAttribute(this.#query.ownerAttribute),
          ) && content.closest(this.#query.boundarySelector) === this.#root,
      )
      .map((content) => {
        const rect = content.getBoundingClientRect();
        const dx = Math.max(rect.left - x, 0, x - rect.right);
        const dy = Math.max(rect.top - y, 0, y - rect.bottom);
        return { content, distance: Math.hypot(dx, dy) };
      })
      .sort((left, right) => left.distance - right.distance)[0]?.content;
  }

  /**
   * Brute-force caret lookup inside one content element when browser hit testing
   * fails, such as when focus is in a different contenteditable.
   *
   * Walks every Text node under `content` (SHOW_TEXT — character Nodes only,
   * not Element tags), measures a collapsed Range rect at each character
   * offset, and picks the closest to `(x, y)`.
   *
   * @param content - Owned editable host whose text nodes are scanned.
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns Closest endpoint, or the content host at offset zero when it is empty.
   */
  private nearestTextPoint(content: HTMLElement, x: number, y: number): BrowserTextSelectionPoint {
    const document = content.ownerDocument;
    const walker = document.createTreeWalker(content, 4);
    let best: BrowserTextSelectionPoint | undefined;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const text = node.textContent ?? "";
      for (let offset = 0; offset <= text.length; offset += 1) {
        const range = document.createRange();
        range.setStart(node, offset);
        range.collapse(true);
        const rect = range.getBoundingClientRect();
        const distance = Math.hypot(x - rect.left, y - (rect.top + rect.height / 2));
        if (distance < bestDistance) {
          bestDistance = distance;
          best = { node, offset, content };
        }
      }
    }
    return best ?? { node: content, offset: 0, content };
  }
}
