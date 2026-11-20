import type { DocumentScroll } from "../../geometry/types";

/** Adjusts one captured document scrolling element while its Root remains current. */
export class BrowserDocumentScroll implements DocumentScroll {
  /**
   * Captures the browser element and its occurrence ownership check.
   *
   * @param element - Document scrolling element to adjust.
   * @param isCurrent - Checks the exact Root and document association.
   */
  constructor(
    private readonly element: Element,
    private readonly isCurrent: () => boolean,
  ) {}

  /**
   * Adjusts the captured document's vertical scroll position.
   *
   * If ownership ends while reading the scroll position, no write is made.
   *
   * @param delta - Vertical change in CSS pixels; positive values scroll down.
   * @returns The captured scroll position is adjusted while its Root remains current.
   * @throws Propagates browser scroll access and attachment-check failures.
   */
  adjustBy(delta: number): void {
    if (!this.isCurrent()) {
      return;
    }
    const top = this.element.scrollTop;
    if (this.isCurrent()) {
      this.element.scrollTop = top + delta;
    }
  }
}
