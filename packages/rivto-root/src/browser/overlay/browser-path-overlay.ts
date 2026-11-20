import type { RegionBounds } from "../../geometry/types";
import type { PathOverlay, PathOverlayStyle } from "../../overlay/types";

/** Renders one inert SVG path in a borrowed occurrence's document. */
export class BrowserPathOverlay implements PathOverlay {
  private element?: SVGSVGElement;
  private path?: SVGPathElement;
  private readonly document: Document;
  private revision = 0;

  /**
   * Borrows the occurrence and its live attachment check.
   *
   * @param root - Mounted surface whose document receives the overlay.
   * @param style - CSS class and data markers used to present the overlay.
   * @param isAttached - Checks whether the original occurrence is still current.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly style: PathOverlayStyle,
    private readonly isAttached: () => boolean,
  ) {
    this.document = root.ownerDocument;
  }

  /**
   * Creates and appends an inert SVG with one path in the document body.
   *
   * @returns True when the overlay remains current after mounting; false after ownership changes.
   * @throws If an overlay is already retained or browser setup fails.
   */
  create(): boolean {
    if (this.element) {
      throw new Error("Path overlay is already created");
    }
    const revision = this.revision;
    if (!this.isOccurrenceCurrent() || !this.document.body) {
      return false;
    }
    const element = this.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    if (this.revision !== revision) {
      return false;
    }
    this.element = element;
    element.setAttribute("class", this.style.className);
    element.setAttribute("aria-hidden", "true");
    for (const [name, value] of Object.entries(this.style.attributes)) {
      element.setAttribute(name, value);
    }
    const path = this.document.createElementNS("http://www.w3.org/2000/svg", "path");
    this.path = path;
    element.append(path);
    if (!this.isOccurrenceCurrent() || this.element !== element || this.revision !== revision) {
      return false;
    }
    this.document.body.append(element);
    if (!this.isCurrent() || this.element !== element || this.revision !== revision) {
      element.remove();
      if (this.element === element) {
        this.element = undefined;
        this.path = undefined;
      }
      return false;
    }
    return true;
  }

  /**
   * Measures the SVG origin and bounds in viewport coordinates.
   *
   * @returns Detached bounds, or undefined before creation or after ownership changes.
   * @throws Propagates browser measurement and ownership failures.
   */
  readBounds(): RegionBounds | undefined {
    const element = this.element;
    if (!element || !this.isCurrent()) {
      return undefined;
    }
    const { left, top, width, height } = element.getBoundingClientRect();
    return this.isCurrent() && this.element === element ? { left, top, width, height } : undefined;
  }

  /**
   * Updates the retained path without exposing its SVG element.
   *
   * @param path - SVG path commands, or an empty string to clear the path.
   * @returns True when the current overlay accepted the update, otherwise false.
   * @throws Propagates browser mutation and ownership failures.
   */
  update(path: string): boolean {
    const element = this.path;
    if (!element || !this.isCurrent()) {
      return false;
    }
    if (element.getAttribute("d") !== path) {
      element.setAttribute("d", path);
    }
    return this.isCurrent() && this.path === element;
  }

  /**
   * Removes the captured overlay even after detachment or partial creation.
   *
   * @returns The overlay is removed and released; repeated calls are harmless.
   * @throws Propagates browser removal failures.
   */
  remove(): void {
    this.revision++;
    const element = this.element;
    element?.remove();
    if (this.element === element) {
      this.element = undefined;
      this.path = undefined;
    }
  }

  /**
   * Checks occurrence, document and retained overlay ownership.
   *
   * @returns True only for an attached occurrence and its original body-hosted SVG.
   */
  private isCurrent(): boolean {
    return (
      this.isOccurrenceCurrent() &&
      Boolean(this.element && this.element.parentElement === this.document.body)
    );
  }

  /**
   * Checks the borrowed occurrence without requiring a created overlay.
   *
   * @returns True while the occurrence remains attached to its captured document.
   */
  private isOccurrenceCurrent(): boolean {
    return this.isAttached() && this.root.ownerDocument === this.document;
  }
}
