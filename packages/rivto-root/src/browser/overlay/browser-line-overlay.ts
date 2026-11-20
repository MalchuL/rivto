import type { LineOverlay, LineOverlayPosition, LineOverlayStyle } from "../../overlay/types";

/** Renders one inert line within a borrowed browser occurrence. */
export class BrowserLineOverlay implements LineOverlay {
  private element?: HTMLElement;
  private readonly document: Document;
  /** Invalidates creation if removal occurs before a node is captured. */
  private revision = 0;

  /**
   * Borrows the source surface and its attachment check.
   *
   * @param root - Surface receiving the line.
   * @param style - CSS class and thickness used to present the line.
   * @param isAttached - Checks the originating occurrence before writes.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly style: LineOverlayStyle,
    private readonly isAttached: () => boolean,
  ) {
    this.document = root.ownerDocument;
  }

  /**
   * Positions or hides a line without measuring layout.
   *
   * @param position - Viewport position and length, or undefined to hide the line.
   * @returns True when the current occurrence accepted the update; false after ownership loss or cancellation.
   * @throws If an ownership check or browser creation, attachment, containment or style write fails.
   */
  update(position?: LineOverlayPosition): boolean {
    const revision = this.revision;
    if (!this.isCurrent() || this.revision !== revision) {
      return false;
    }
    const element = this.element ?? (position && this.createElement(revision));
    if (!element) {
      return !position && this.isCurrent() && this.revision === revision;
    }
    if (!this.isCurrent() || this.element !== element) {
      return false;
    }
    element.hidden = !position;
    if (position) {
      element.dataset.axis = position.orientation;
      element.style.transform = `translate(${position.x}px, ${position.y}px)`;
      element.style.width =
        position.orientation === "horizontal" ? `${position.length}px` : this.style.thickness;
      element.style.height =
        position.orientation === "vertical" ? `${position.length}px` : this.style.thickness;
    }
    return this.isCurrent() && this.element === element;
  }

  /**
   * Removes the captured line even after its occurrence is detached.
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
   * Checks the originating attachment and document before browser writes.
   *
   * @returns False after detachment, document movement, or reparenting of the retained line.
   * @throws Propagates attachment ownership or browser containment failures.
   */
  isCurrent(): boolean {
    if (!this.isOccurrenceCurrent()) {
      return false;
    }
    const element = this.element;
    return !element || this.root.contains(element);
  }

  /**
   * Creates and attaches the line while retaining partial setup for cleanup.
   *
   * @param revision - Removal revision captured before creation began.
   * @returns The created line, or undefined when ownership changed during attachment.
   * @throws If an ownership check or browser creation, attachment or containment fails.
   */
  private createElement(revision: number): HTMLElement | undefined {
    const element = this.document.createElement("div");
    if (this.revision !== revision) {
      return;
    }
    this.element = element;
    element.className = this.style.className;
    element.setAttribute("aria-hidden", "true");
    if (!this.isOccurrenceCurrent() || this.element !== element) {
      if (this.element === element) {
        this.element = undefined;
      }
      return;
    }
    this.root.append(element);
    if (!this.root.contains(element) || !this.isOccurrenceCurrent() || this.element !== element) {
      element.remove();
      if (this.element === element) {
        this.element = undefined;
      }
      return;
    }
    return element;
  }

  /**
   * Checks the originating attachment and document without inspecting a pending node.
   *
   * @returns False after detachment or when the occurrence moves to another document.
   * @throws Propagates attachment ownership failures.
   */
  private isOccurrenceCurrent(): boolean {
    return this.isAttached() && this.root.ownerDocument === this.document;
  }
}
