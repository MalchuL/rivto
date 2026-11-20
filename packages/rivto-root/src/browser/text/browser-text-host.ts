import type {
  ContentBounds,
  ContentCaret,
  ContentCaretGeometry,
  TextHost,
  TextHostIdentity,
} from "../../text/types";
import { captureTextSelection, restoreTextCaret } from "../selection/text-selection";

/**
 * Captures content identity while keeping its browser element inside the adapter.
 *
 * Reads remain live on the same host, including if the host is later replaced.
 * The caller must guard deferred reads with its originating attachment capability.
 *
 * @param content - Content host resolved for an input, or null when absent.
 * @param root - Owning surface used to reject a host moved outside its occurrence.
 * @param boundarySelector - Optional selector identifying nested occurrences.
 * @param canRestoreCaret - Optional live focus and attachment guard for caret restoration.
 * @returns Browser-free content operations, or undefined without a content host.
 */
export function captureBrowserTextHost(
  content: HTMLElement | null,
  root: HTMLElement,
  boundarySelector?: string,
  canRestoreCaret?: () => boolean,
): TextHost | undefined {
  if (!content) {
    return undefined;
  }
  const boundary = boundarySelector ? (root.closest(boundarySelector) ?? root) : undefined;
  if (!isInOccurrence(content, root, boundarySelector, boundary)) {
    return undefined;
  }
  return new BrowserTextHost(content, root, boundarySelector, boundary, canRestoreCaret);
}

/**
 * Checks that a host remains within the same surface and nested occurrence boundary.
 *
 * @param content - Captured content host.
 * @param root - Surface that received the input.
 * @param selector - Optional selector identifying occurrence boundaries.
 * @param boundary - Boundary captured for the surface, when a selector was supplied.
 * @returns True if the host remains in the original occurrence.
 * @throws If the browser rejects the boundary selector.
 */
function isInOccurrence(
  content: HTMLElement,
  root: HTMLElement,
  selector?: string,
  boundary?: Element,
): boolean {
  if (!root.contains(content)) {
    return false;
  }
  if (!selector) {
    return true;
  }
  const contentBoundary = content.closest(selector);
  return (
    (root.closest(selector) ?? root) === boundary &&
    (!contentBoundary || contentBoundary === boundary)
  );
}

/** Browser-owned content reads and prefix decoration for one captured host. */
class BrowserTextHost implements TextHost {
  /**
   * Retains the content host and its owning occurrence for live reads.
   *
   * @param content - Captured content host.
   * @param root - Surface owning this input occurrence.
   * @param boundarySelector - Optional selector identifying nested occurrences.
   * @param boundary - The surface's boundary at capture time.
   * @param canRestoreCaret - Optional guard checked before changing browser selection.
   */
  constructor(
    private readonly content: HTMLElement,
    private readonly root: HTMLElement,
    private readonly boundarySelector?: string,
    private readonly boundary?: Element,
    private readonly canRestoreCaret?: () => boolean,
  ) {}

  /**
   * Restores a collapsed caret while the captured host remains in its occurrence.
   *
   * @param offset - UTF-16 offset from the beginning of the host.
   * @returns The document selection is updated when the host is still owned.
   * @throws Propagates browser selection and text traversal failures.
   */
  restoreCaret(offset: number): void {
    if (
      (this.canRestoreCaret?.() ?? true) &&
      isInOccurrence(this.content, this.root, this.boundarySelector, this.boundary)
    ) {
      restoreTextCaret(this.content, offset);
    }
  }

  /**
   * Compares captured host identities without returning either browser element.
   *
   * @param other - Another content capability to compare.
   * @returns True when both capabilities capture the same element; false for other providers.
   */
  isSameHost(other: TextHostIdentity): boolean {
    return other instanceof BrowserTextHost && other.content === this.content;
  }

  /**
   * Reads live text from this captured content host.
   *
   * @returns Its current text, or an empty string when none exists.
   */
  readText(): string {
    return this.content.textContent ?? "";
  }

  /**
   * Checks whether this captured content host is in a document.
   *
   * @returns Its current browser connectivity.
   */
  isConnected(): boolean {
    return this.content.isConnected;
  }

  /**
   * Replaces the prefix decoration while retaining the current browser range.
   *
   * @param prefix - Leading text to wrap, or undefined to clear the decoration.
   * @param className - CSS class identifying the decoration span.
   * @returns Text is preserved and the selection is restored when possible.
   * @throws Propagates invalid selector, DOM mutation, or selection failures.
   */
  decoratePrefix(prefix: string | undefined, className: string): void {
    decorateContentPrefix(this.content, prefix, className);
  }

  /**
   * Reads an attribute from the nearest matching ancestor of the host.
   *
   * @param selector - Selector identifying the ancestor.
   * @param attribute - Attribute to read from the matching ancestor.
   * @returns Its value, or undefined when absent, outside the occurrence, or moved during the read.
   * @throws If the browser rejects the selector or attribute name.
   */
  readAncestorAttribute(selector: string, attribute: string): string | undefined {
    if (!isInOccurrence(this.content, this.root, this.boundarySelector, this.boundary)) {
      return undefined;
    }
    const ancestor = this.content.closest(selector);
    if (!ancestor || !this.root.contains(ancestor)) {
      return undefined;
    }
    const value = ancestor.getAttribute(attribute);
    if (
      !isInOccurrence(this.content, this.root, this.boundarySelector, this.boundary) ||
      !this.root.contains(ancestor) ||
      this.content.closest(selector) !== ancestor
    ) {
      return undefined;
    }
    return value ?? undefined;
  }

  /**
   * Reads text and a collapsed caret from the captured content host.
   *
   * @returns Live text and an offset only when the selection belongs to the host.
   * @throws Propagates browser selection and range creation failures.
   */
  readCaret(): ContentCaret {
    return readContentCaret(this.content);
  }

  /**
   * Measures the current browser caret and fallback content box.
   *
   * @returns Viewport-relative coordinates and viewport dimensions when available.
   * @throws Propagates browser selection and geometry failures.
   */
  measureCaret(): ContentCaretGeometry {
    return measureContentCaret(this.content);
  }
}

/**
 * Reads content text and a collapsed caret within one host.
 *
 * A range endpoint failure leaves the offset absent while preserving the text.
 *
 * @param content - Captured browser content host.
 * @returns Its live text and offset, or an absent offset for a nonlocal selection.
 * @throws Propagates browser selection or range creation failures.
 */
function readContentCaret(content: HTMLElement): ContentCaret {
  const selection = content.ownerDocument.getSelection();
  const text = content.textContent ?? "";
  if (
    !selection?.rangeCount ||
    !selection.isCollapsed ||
    !selection.focusNode ||
    !content.contains(selection.focusNode)
  ) {
    return { text, offset: undefined };
  }
  const range = content.ownerDocument.createRange();
  range.selectNodeContents(content);
  try {
    range.setEnd(selection.focusNode, selection.focusOffset);
    return { text, offset: range.toString().length };
  } catch {
    return { text, offset: undefined };
  }
}

/**
 * Copies caret and content geometry without exposing browser rectangles.
 *
 * @param content - Captured browser content host.
 * @returns Current caret and content edges plus viewport dimensions when available.
 * @throws Propagates browser selection or geometry measurement failures.
 */
function measureContentCaret(content: HTMLElement): ContentCaretGeometry {
  const selection = content.ownerDocument.getSelection();
  const caret = selection?.rangeCount ? selection.getRangeAt(0).getBoundingClientRect() : undefined;
  const bounds = content.getBoundingClientRect();
  const viewport = content.ownerDocument.defaultView;
  return {
    caret: caret ? copyBounds(caret) : undefined,
    content: copyBounds(bounds),
    viewport: viewport ? { width: viewport.innerWidth, height: viewport.innerHeight } : undefined,
  };
}

/**
 * Copies only the viewport edges used by floating editor controls.
 *
 * @param bounds - Browser rectangle or compatible measured edges.
 * @returns A detached set of CSS-pixel edges.
 */
function copyBounds(bounds: ContentBounds): ContentBounds {
  return { left: bounds.left, top: bounds.top, bottom: bounds.bottom };
}

/**
 * Replaces a leading text decoration without changing text or the current DOM range.
 *
 * @param content - Plain-text editable host to update.
 * @param prefix - Matching leading token, or undefined to clear decoration.
 * @param className - CSS class identifying the decoration span.
 * @returns The decoration is updated and the browser selection is restored when possible.
 * @throws Propagates invalid selector, DOM mutation, or selection failures.
 */
function decorateContentPrefix(
  content: HTMLElement,
  prefix: string | undefined,
  className: string,
): void {
  const text = content.textContent ?? "";
  const current = content.querySelector<HTMLElement>(`.${className}`);
  if (
    (!prefix && !current) ||
    (prefix && current?.textContent === prefix && current === content.firstChild)
  ) {
    return;
  }
  const restoreSelection = captureTextSelection(content);
  content.textContent = text;
  if (prefix) {
    const tail = content.firstChild;
    const prefixNode = content.ownerDocument.createElement("span");
    prefixNode.className = className;
    prefixNode.textContent = prefix;
    if (tail) {
      tail.textContent = text.slice(prefix.length);
      content.insertBefore(prefixNode, tail);
    } else {
      content.append(prefixNode);
    }
  }
  restoreSelection();
}
