import type {
  RectangleOverlay,
  RectangleOverlayPosition,
  RectangleOverlayStyle,
} from "../../overlay/types";

/** Renders an inert rectangle in an occurrence or its document. */
export class BrowserRectangleOverlay implements RectangleOverlay {
  private element?: HTMLElement;
  private readonly document: Document;
  private revision = 0;

  /**
   * Borrows the occurrence and its attachment check for one overlay lifetime.
   *
   * @param root - Mounted surface whose document owns the rectangle.
   * @param style - Container, CSS properties, class and data markers used to present the rectangle.
   * @param isAttached - Checks the originating occurrence before writes.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly style: RectangleOverlayStyle,
    private readonly isAttached: () => boolean,
  ) {
    this.document = root.ownerDocument;
  }

  /**
   * Checks the originating occurrence and the retained rectangle's chosen container.
   *
   * @returns False after detachment, document movement, or rectangle reparenting.
   * @throws Propagates occurrence ownership checks.
   */
  isCurrent(): boolean {
    return (
      this.isOccurrenceCurrent() &&
      (!this.element ||
        this.element.parentElement ===
          (this.style.container === "root" ? this.root : this.document.body))
    );
  }

  /**
   * Shows or hides the rectangle without measuring layout.
   *
   * @param position - Viewport or root-local bounds in CSS pixels, or undefined to hide.
   * @returns True when the current occurrence accepted the update; false after ownership loss or cancellation.
   * @throws Propagates ownership, browser creation, attachment, and style failures.
   */
  update(position?: RectangleOverlayPosition): boolean {
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
    element.style.display = position ? "block" : "none";
    if (position) {
      element.style.left = `${position.x}px`;
      element.style.top = `${position.y}px`;
      element.style.width = `${position.width}px`;
      element.style.height = `${position.height}px`;
    }
    return this.isCurrent() && this.element === element && this.revision === revision;
  }

  /**
   * Removes the rectangle even after its occurrence has detached.
   *
   * @returns The node is removed and released, including after partial creation.
   * @throws If browser removal fails.
   */
  remove(): void {
    this.revision += 1;
    const element = this.element;
    element?.remove();
    if (this.element === element) {
      this.element = undefined;
    }
  }

  /**
   * Creates and attaches the rectangle while retaining partial setup for cleanup.
   *
   * @param revision - Removal revision captured before creation began.
   * @returns Created rectangle, or undefined when ownership changed during attachment.
   * @throws Propagates ownership, browser creation, attribute, and attachment failures.
   */
  private createElement(revision: number): HTMLElement | undefined {
    const element = this.document.createElement("div");
    if (this.revision !== revision) {
      return undefined;
    }
    this.element = element;
    element.className = this.style.className;
    for (const [name, value] of Object.entries(this.style.attributes)) {
      element.setAttribute(name, value);
    }
    for (const [name, value] of Object.entries(this.style.properties ?? {})) {
      element.style.setProperty(name, value);
    }
    if (!this.isOccurrenceCurrent() || this.element !== element || this.revision !== revision) {
      if (this.element === element) {
        this.element = undefined;
      }
      return undefined;
    }
    const parent = this.style.container === "root" ? this.root : this.document.body;
    parent.append(element);
    if (!this.isCurrent() || this.element !== element || this.revision !== revision) {
      element.remove();
      if (this.element === element) {
        this.element = undefined;
      }
      return undefined;
    }
    return element;
  }

  /**
   * Checks the originating attachment and document without inspecting a pending node.
   *
   * @returns False after detachment or movement to another document.
   * @throws Propagates occurrence ownership checks.
   */
  private isOccurrenceCurrent(): boolean {
    return this.isAttached() && this.root.ownerDocument === this.document;
  }
}
