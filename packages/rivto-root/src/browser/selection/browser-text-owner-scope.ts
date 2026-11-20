import type { TextOwnerScope, TextSelectionQuery } from "../../text/types";
import type { InputRootOwnerCheck } from "../input/types";

/** Captures a text owner's local surface without exposing its browser element. */
export class BrowserTextOwnerScope implements TextOwnerScope {
  /**
   * Borrows one scope and the occurrence that bounds its lifetime.
   *
   * @param root - Occurrence whose attachment owns the scope.
   * @param scope - Captured local scope, possibly the occurrence itself.
   * @param query - Selectors identifying owners, content, and occurrence boundaries.
   * @param isAttached - Checks the originating occurrence's current attachment.
   */
  constructor(
    private readonly root: HTMLElement,
    private readonly scope: Element,
    private readonly query: TextSelectionQuery,
    private readonly isAttached: InputRootOwnerCheck,
  ) {}

  /**
   * Checks the first matching owner for directly owned content in this scope.
   *
   * Nested owner content is ignored. Nested occurrence owners are excluded.
   *
   * @param ownerId - Exact attribute identity of the rendered owner to inspect.
   * @returns False when the owner is missing, has content, or the scope is inactive.
   * @throws Propagates selector, attribute, and attachment-check failures.
   */
  hasContentlessOwner(ownerId: string): boolean {
    if (!this.isCurrent()) {
      return false;
    }
    const { query, root, scope } = this;
    const boundary = root.closest(query.boundarySelector) ?? root;
    const owner = [...scope.querySelectorAll(query.ownerSelector)].find((candidate) => {
      const candidateBoundary = candidate.closest(query.boundarySelector);
      return (
        candidate.getAttribute(query.ownerAttribute) === ownerId &&
        (!candidateBoundary || candidateBoundary === boundary)
      );
    });
    if (!owner) {
      return false;
    }
    const hasContent = [...owner.querySelectorAll(query.contentSelector)].some(
      (content) => content.closest(query.ownerSelector) === owner,
    );
    return (
      !hasContent &&
      this.isCurrent() &&
      scope.contains(owner) &&
      owner.getAttribute(query.ownerAttribute) === ownerId &&
      (owner.closest(query.boundarySelector) ?? boundary) === boundary &&
      this.isCurrent() &&
      scope.contains(owner)
    );
  }

  /**
   * Requests focus on this captured scope without scrolling it into view.
   *
   * @returns Focus is requested only while the scope remains attached.
   * @throws Propagates browser focus and attachment-check failures.
   */
  focus(): void {
    if (!this.isCurrent()) {
      return;
    }
    const HTMLElementType = this.root.ownerDocument.defaultView?.HTMLElement;
    if (HTMLElementType && this.scope instanceof HTMLElementType && this.isCurrent()) {
      this.scope.focus({ preventScroll: true });
    }
  }

  /**
   * Checks the captured scope against its originating occurrence.
   *
   * @returns True while the occurrence is attached and owns the scope without crossing a nested boundary.
   * @throws Propagates selector and attachment-check failures.
   */
  private isCurrent(): boolean {
    if (!this.isAttached() || !this.root.contains(this.scope)) {
      return false;
    }
    const boundary = this.root.closest(this.query.boundarySelector) ?? this.root;
    const scopeBoundary = this.scope.closest(this.query.boundarySelector);
    return (!scopeBoundary || scopeBoundary === boundary) && this.isAttached();
  }
}

/**
 * Captures the scope containing the first matching owner, falling back to the root.
 *
 * Nested occurrence owners are excluded. An owner outside a matching local
 * scope, or an owner that is not rendered, selects the occurrence itself.
 * Owners are compared in document order by their exact attribute value, without
 * interpolating the identity into a CSS selector.
 *
 * @param root - Mounted occurrence containing the candidate owners and scope.
 * @param query - Selectors identifying owners, content, and occurrence boundaries.
 * @param ownerId - Exact identity of the owner used to select the local scope.
 * @param scopeSelector - Selector identifying an optional local scope.
 * @param isAttached - Checks the originating occurrence's current attachment.
 * @returns Captured scope, or undefined if attachment ends during the lookup.
 * @throws Propagates selector, attribute, and attachment-check failures.
 */
export function captureBrowserTextOwnerScope(
  root: HTMLElement,
  query: TextSelectionQuery,
  ownerId: string,
  scopeSelector: string,
  isAttached: InputRootOwnerCheck,
): TextOwnerScope | undefined {
  if (!isAttached()) {
    return undefined;
  }
  const boundary = root.closest(query.boundarySelector) ?? root;
  const owner = [...root.querySelectorAll(query.ownerSelector)].find((candidate) => {
    const candidateBoundary = candidate.closest(query.boundarySelector);
    return (
      candidate.getAttribute(query.ownerAttribute) === ownerId &&
      (!candidateBoundary || candidateBoundary === boundary)
    );
  });
  const candidate = owner?.closest(scopeSelector);
  const scope = candidate && root.contains(candidate) ? candidate : root;
  if (
    owner &&
    (!root.contains(owner) ||
      owner.getAttribute(query.ownerAttribute) !== ownerId ||
      (owner.closest(query.boundarySelector) ?? boundary) !== boundary)
  ) {
    return undefined;
  }
  return isAttached() ? new BrowserTextOwnerScope(root, scope, query, isAttached) : undefined;
}
