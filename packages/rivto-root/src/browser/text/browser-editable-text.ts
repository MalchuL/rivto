import type { EditableText } from "../../text/types";
import { captureTextSelection } from "../selection/text-selection";
import { insertEditablePlainText, readEditablePlainText } from "./editable-plain-text";

/** Browser-owned text and selection operations for one mounted editable. */
export class BrowserEditableText implements EditableText {
  private readonly document: Document;
  private readonly boundary: Element;

  /**
   * Captures the editable and its original occurrence boundary.
   *
   * @param root - Surface retaining the occurrence.
   * @param element - Editable owned by that surface.
   * @param identity - Stable opaque identity of the editable.
   * @param boundarySelector - Selector identifying nested occurrences.
   * @param isAttached - Checks the Root that owns this capability.
   * @throws If the browser rejects the boundary selector.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly element: HTMLElement,
    private readonly identity: object,
    private readonly boundarySelector: string,
    private readonly isAttached: () => boolean,
  ) {
    this.document = root.ownerDocument;
    this.boundary = root.closest(boundarySelector) ?? root;
  }

  /**
   * Reads the stable opaque identity of this editing host.
   *
   * @returns Identity captured at mount, including after detachment.
   */
  getIdentity(): object {
    return this.identity;
  }

  /**
   * Checks whether the host still belongs to the captured occurrence.
   *
   * @returns False after detachment, document movement, or crossing a nested boundary.
   * @throws Propagates browser selector and ownership-check failures.
   */
  isCurrent(): boolean {
    if (
      !this.isAttached() ||
      this.root.ownerDocument !== this.document ||
      !this.root.contains(this.element)
    ) {
      return false;
    }
    const boundary = this.element.closest(this.boundarySelector);
    return (
      (this.root.closest(this.boundarySelector) ?? this.root) === this.boundary &&
      (!boundary || boundary === this.boundary) &&
      this.isAttached() &&
      this.root.ownerDocument === this.document &&
      this.root.contains(this.element) &&
      (this.root.closest(this.boundarySelector) ?? this.root) === this.boundary &&
      (!this.element.closest(this.boundarySelector) ||
        this.element.closest(this.boundarySelector) === this.boundary)
    );
  }

  /**
   * Reads current plain text while this capability remains owned.
   *
   * @returns Text, or undefined if ownership changes during the read.
   * @throws Propagates browser text and ownership-check failures.
   */
  readText(): string | undefined {
    if (!this.isCurrent()) {
      return undefined;
    }
    const text = this.element.textContent ?? "";
    return this.isCurrent() ? text : undefined;
  }

  /**
   * Reads rendered plain text with line breaks while the host remains owned.
   *
   * @returns Normalized text, or undefined when ownership changes during the read.
   * @throws Propagates browser reads and ownership-check failures.
   */
  readRenderedText(): string | undefined {
    if (!this.isCurrent()) {
      return undefined;
    }
    const text = readEditablePlainText(this.element);
    return this.isCurrent() ? text : undefined;
  }

  /**
   * Inserts plain text into the captured host's current selection.
   *
   * @param text - Text to insert, including line breaks.
   * @returns True when insertion remains within the current owned host.
   * @throws Propagates browser selection and ownership-check failures.
   */
  insertText(text: string): boolean {
    return insertEditablePlainText(this.element, text, () => this.isCurrent());
  }

  /**
   * Replaces changed plain text and optionally restores browser selection.
   *
   * @param text - Complete plain text to render.
   * @param preserveSelection - Whether to retain selection around replacement.
   * @returns False when ownership ends during the operation.
   * @throws Propagates text, selection, and ownership-check failures.
   */
  synchronize(text: string, preserveSelection: boolean): boolean {
    if (!this.isCurrent()) {
      return false;
    }
    if (this.element.textContent === text) {
      return this.isCurrent();
    }
    const restore = preserveSelection ? captureTextSelection(this.element) : undefined;
    if (!this.isCurrent()) {
      return false;
    }
    this.element.textContent = text;
    if (!this.isCurrent()) {
      return false;
    }
    restore?.();
    return this.isCurrent();
  }
}
