import type { TextHost, TextHostQuery } from "../../text/types";
import { captureBrowserTextHost } from "./browser-text-host";

/**
 * Finds the content directly owned by a matching element in one occurrence.
 *
 * Nested occurrence boundaries are excluded, and an owner's first matching
 * content host must belong directly to that owner rather than a nested owner.
 * The selected owner and host are checked again after browser reads so a
 * synchronous move or identity change cannot return a stale host.
 *
 * @param root - Mounted browser occurrence to search.
 * @param query - Host and ownership selectors supplied by the caller.
 * @returns Captured host, or undefined when no eligible host remains in the occurrence.
 * @throws If the browser rejects an evaluated selector or attribute name.
 */
export function findBrowserTextHost(root: HTMLElement, query: TextHostQuery): TextHost | undefined {
  const rootBoundary = root.closest(query.boundarySelector) ?? root;
  const owners = root.querySelectorAll<HTMLElement>(query.ownerSelector);
  const owner = [...owners].find((element) => {
    const boundary = element.closest(query.boundarySelector);
    return (
      element.getAttribute(query.ownerAttribute) === query.ownerValue &&
      root.contains(element) &&
      (!boundary || boundary === rootBoundary)
    );
  });
  const content = owner?.querySelector<HTMLElement>(query.contentSelector);
  if (
    !owner ||
    !content ||
    !root.contains(owner) ||
    !root.contains(content) ||
    content.closest(query.ownerSelector) !== owner
  ) {
    return undefined;
  }
  const ownerValue = owner.getAttribute(query.ownerAttribute);
  const boundary = content.closest(query.boundarySelector);
  const ownerBoundary = owner.closest(query.boundarySelector);
  if (
    (boundary && boundary !== rootBoundary) ||
    (ownerBoundary && ownerBoundary !== rootBoundary) ||
    ownerValue !== query.ownerValue ||
    (root.closest(query.boundarySelector) ?? root) !== rootBoundary ||
    !root.contains(owner) ||
    !root.contains(content) ||
    content.closest(query.ownerSelector) !== owner
  ) {
    return undefined;
  }
  return captureBrowserTextHost(content, root, query.boundarySelector);
}
