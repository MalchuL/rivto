import type { TextOverlay, TextOverlayContent } from "../../overlay/types";

/** Renders one inert text overlay within a borrowed browser occurrence. */
export class BrowserTextOverlay implements TextOverlay {
  private element?: HTMLElement;
  private readonly document: Document;
  /** Invalidates creation if removal occurs before a node is captured. */
  private revision = 0;

  /**
   * Borrows the mounted surface and its attachment check.
   *
   * @param root - Surface receiving the overlay.
   * @param isAttached - Checks the originating occurrence before creation.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly isAttached: () => boolean,
  ) {
    this.document = root.ownerDocument;
  }

  /**
   * Checks whether visual creation has started.
   *
   * @returns True while a created node is retained, including after partial setup failure; false after successful removal.
   */
  isCreated(): boolean {
    return this.element !== undefined;
  }

  /**
   * Creates an inert text overlay and retains partial setup for cleanup.
   *
   * @param content - Plain text, row indentation and presentation classes.
   * @returns True when the overlay remains appended to its active occurrence in the captured document; false when ownership is inactive or the overlay is canceled or moved.
   * @throws If a previous node is still retained, an ownership check fails, or browser creation, attachment or containment fails.
   */
  create(content: TextOverlayContent): boolean {
    if (this.element) {
      throw new Error("Text overlay already created");
    }
    const revision = this.revision;
    if (!this.isCurrent() || this.revision !== revision) {
      return false;
    }
    const element = this.document.createElement("div");
    if (this.revision !== revision) {
      return false;
    }
    this.element = element;
    element.className = content.className;
    element.textContent = content.text;
    for (const line of content.lines) {
      const row = this.document.createElement("div");
      row.className = line.className;
      row.textContent = line.text;
      row.style.marginInlineStart = `${line.indent}px`;
      element.append(row);
    }
    if (!this.isCurrent() || this.element !== element) {
      if (this.element === element) {
        this.element = undefined;
      }
      return false;
    }
    this.root.append(element);
    const belongs = this.root.contains(element);
    if (!belongs || !this.isCurrent() || this.element !== element) {
      element.remove();
      if (this.element === element) {
        this.element = undefined;
      }
      return false;
    }
    return true;
  }

  /**
   * Moves the created overlay without reading layout.
   *
   * @param x - Horizontal viewport position in CSS pixels.
   * @param y - Vertical viewport position in CSS pixels.
   * @returns The overlay is moved while it remains in its attached occurrence and captured document; moved or reparented nodes are left unchanged.
   * @throws If an ownership check, browser containment check or style write fails.
   */
  move(x: number, y: number): void {
    const element = this.element;
    if (element && this.isCurrent() && this.root.contains(element) && this.element === element) {
      element.style.transform = `translate3d(${x}px, ${y}px, 0)`;
    }
  }

  /**
   * Removes the captured node even after its occurrence is detached.
   *
   * @returns The node is removed and released, including after partial creation.
   * @throws If browser removal fails.
   */
  remove(): void {
    this.revision++;
    const element = this.element;
    element?.remove();
    if (this.element === element) {
      this.element = undefined;
    }
  }

  /**
   * Checks the original attachment and the document captured when the overlay was borrowed.
   *
   * @returns False after detachment or when the occurrence moves to another document.
   * @throws Propagates attachment ownership failures.
   */
  private isCurrent(): boolean {
    return this.isAttached() && this.root.ownerDocument === this.document;
  }
}
