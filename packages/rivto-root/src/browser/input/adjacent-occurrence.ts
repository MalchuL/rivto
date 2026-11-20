import type { AdjacentOccurrence } from "../../events/types";
import type { TextSelectionPosition, TextSelectionQuery } from "../../text/types";
import { inputElementIdentity } from "./input-element-identity";
import type { InputRootOwnerCheck } from "./types";

/** Borrowed access to a neighboring top-level occurrence in one document. */
class BrowserAdjacentOccurrence implements AdjacentOccurrence {
  readonly identity: object;
  private readonly document: Document;

  /**
   * Captures both occurrence elements and the document used to discover them.
   *
   * @param source - Originating occurrence element.
   * @param target - Adjacent occurrence element.
   * @param selector - Selector identifying top-level occurrences.
   * @param isAttached - Checks the originating Root's attachment.
   */
  constructor(
    private readonly source: HTMLElement,
    private readonly target: Element,
    private readonly selector: string,
    private readonly isAttached: InputRootOwnerCheck,
  ) {
    this.identity = inputElementIdentity(target);
    this.document = source.ownerDocument;
  }

  /**
   * Checks that both occurrences remain top-level in their captured document.
   *
   * @returns False after removal, document movement, nesting, or source detachment.
   * @throws Propagates selector and attachment-check failures.
   */
  isCurrent(): boolean {
    return (
      this.isAttached() &&
      this.source.isConnected &&
      this.target.isConnected &&
      this.source.ownerDocument === this.document &&
      this.target.ownerDocument === this.document &&
      this.source.matches(this.selector) &&
      this.target.matches(this.selector) &&
      !this.source.parentElement?.closest(this.selector) &&
      !this.target.parentElement?.closest(this.selector) &&
      this.isAttached() &&
      this.source.isConnected &&
      this.target.isConnected &&
      this.source.ownerDocument === this.document &&
      this.target.ownerDocument === this.document &&
      this.source.matches(this.selector) &&
      this.target.matches(this.selector) &&
      !this.source.parentElement?.closest(this.selector) &&
      !this.target.parentElement?.closest(this.selector)
    );
  }

  /**
   * Finds the first or last rendered owner with directly owned content.
   *
   * Contentless owners and owners in nested occurrences are skipped.
   *
   * @param query - Selectors identifying owners, content, and occurrence boundaries.
   * @param edge - First or last editable owner to inspect.
   * @returns Owner identity and UTF-16 edge offset, or undefined when missing or stale.
   * @throws Propagates selector, attribute, and attachment-check failures.
   */
  readEdgeTextPosition(
    query: TextSelectionQuery,
    edge: "first" | "last",
  ): TextSelectionPosition | undefined {
    if (!this.isCurrent()) {
      return undefined;
    }
    const boundary = this.target.closest(query.boundarySelector) ?? this.target;
    const owners = [...this.target.querySelectorAll(query.ownerSelector)];
    if (edge === "last") {
      owners.reverse();
    }
    for (const owner of owners) {
      const ownerBoundary = owner.closest(query.boundarySelector);
      if (ownerBoundary && ownerBoundary !== boundary) {
        continue;
      }
      const content = [...owner.querySelectorAll(query.contentSelector)].find(
        (candidate) => candidate.closest(query.ownerSelector) === owner,
      );
      const ownerId = owner.getAttribute(query.ownerAttribute);
      if (ownerId && content) {
        const offset = edge === "last" ? (content.textContent?.length ?? 0) : 0;
        const valid =
          this.target.contains(owner) &&
          owner.contains(content) &&
          owner.getAttribute(query.ownerAttribute) === ownerId &&
          content.closest(query.ownerSelector) === owner &&
          (owner.closest(query.boundarySelector) ?? boundary) === boundary &&
          this.isCurrent();
        return valid ? { ownerId, offset } : undefined;
      }
    }
    return undefined;
  }
}

/**
 * Finds an immediate neighboring top-level occurrence in document order.
 *
 * A nested occurrence is not a top-level entry and cannot initiate this lookup.
 *
 * @param root - Originating occurrence element.
 * @param selector - Selector identifying occurrences in document order.
 * @param direction - Whether to find the previous or next occurrence.
 * @param isAttached - Checks the originating Root's attachment.
 * @returns Adjacent occurrence capability, or undefined when missing or detached.
 * @throws Propagates selector and attachment-check failures.
 */
export function findBrowserAdjacentOccurrence(
  root: HTMLElement,
  selector: string,
  direction: "previous" | "next",
  isAttached: InputRootOwnerCheck,
): AdjacentOccurrence | undefined {
  if (!isAttached()) {
    return undefined;
  }
  const document = root.ownerDocument;
  const roots = [...document.querySelectorAll(selector)].filter(
    (candidate) => !candidate.parentElement?.closest(selector),
  );
  const index = roots.indexOf(root);
  const target = index < 0 ? undefined : roots[index + (direction === "previous" ? -1 : 1)];
  if (!target || !isAttached() || root.ownerDocument !== document) {
    return undefined;
  }
  const occurrence = new BrowserAdjacentOccurrence(root, target, selector, isAttached);
  return occurrence.isCurrent() ? occurrence : undefined;
}
