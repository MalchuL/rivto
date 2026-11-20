import type { DocumentAttribute } from "../../events/types";

/** Controls one document attribute without exposing the captured document. */
export class BrowserDocumentAttribute implements DocumentAttribute {
  /**
   * Captures the document independently of later occurrence moves or detachment.
   *
   * @param document - Document whose root attribute is controlled.
   * @param name - Attribute name on the document element.
   * @param isCurrent - Checks whether the originating occurrence still owns writes.
   */
  constructor(
    private readonly document: Document,
    private readonly name: string,
    private readonly isCurrent: () => boolean,
  ) {}

  /**
   * Sets the captured attribute while its originating occurrence remains current.
   *
   * @returns True when the attribute was written, or false when ownership no longer holds.
   * @throws If the ownership check or browser attribute write fails.
   */
  set(): boolean {
    if (!this.isCurrent()) {
      return false;
    }
    this.document.documentElement.setAttribute(this.name, "");
    return true;
  }

  /**
   * Removes the captured attribute after the final matching element disappears.
   *
   * The original document is inspected even after the occurrence is detached.
   *
   * @param selector - Selector identifying elements that still require the attribute.
   * @returns The attribute is removed when no matching element remains.
   * @throws If browser selector evaluation or attribute removal fails.
   */
  removeWhenAbsent(selector: string): void {
    if (!this.document.querySelector(selector)) {
      this.document.documentElement.removeAttribute(this.name);
    }
  }
}
