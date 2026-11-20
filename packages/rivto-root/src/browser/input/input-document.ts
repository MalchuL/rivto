import type { InputDocument, InputHit } from "../../events/types";
import type { InputRootOwnerCheck } from "./types";
import { captureBrowserInputHit, readBrowserInputHit } from "./input-hit";

/** Document hit testing tied to the originating occurrence and document. */
export class BrowserInputDocument implements InputDocument {
  private readonly document: Document;

  /**
   * Captures the browser document without transferring occurrence ownership.
   *
   * @param root - Connected occurrence element.
   * @param isAttached - Checks the originating Root's lifetime.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly isAttached: InputRootOwnerCheck,
  ) {
    this.document = root.ownerDocument;
  }

  /**
   * Checks the captured document and occurrence before and after the owner callback.
   *
   * @returns False after disconnection, replacement, or adoption into another document.
   * @throws Propagates occurrence ownership failures.
   */
  isCurrent(): boolean {
    return (
      this.root.isConnected &&
      this.root.ownerDocument === this.document &&
      this.isAttached() &&
      this.root.isConnected &&
      this.root.ownerDocument === this.document
    );
  }

  /**
   * Reuses a current hit or captures the browser element at the supplied point.
   *
   * A returned hint remains owned by its caller. A newly captured hit must be
   * released by the caller after synchronous resolution.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @param hint - Optional borrowed hit to reuse when connected to this document.
   * @returns A valid hit, or undefined when no element is hit or ownership ends.
   * @throws Propagates browser hit testing and occurrence ownership failures.
   */
  captureHit(x: number, y: number, hint?: InputHit): InputHit | undefined {
    if (!this.isCurrent()) {
      return undefined;
    }
    if (readBrowserInputHit(hint, this.document)) {
      return this.isCurrent() ? hint : undefined;
    }
    const element = this.document.elementFromPoint(x, y);
    if (!element || !this.isCurrent()) {
      return undefined;
    }
    return captureBrowserInputHit(element);
  }
}
