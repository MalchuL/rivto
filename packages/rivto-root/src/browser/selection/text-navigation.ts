import type {
  TextNavigationMount,
  TextSelectionPosition,
  TextSelectionQuery,
} from "../../text/types";
import type { BrowserCaretCandidate, BrowserTextSelectionPoint } from "./types";

/**
 * Resolves the immediately adjacent editable owner within a local boundary.
 *
 * A contentless owner stops movement. Only an occurrence-wide boundary may ask
 * the host to mount an offscreen neighbor; a nested scope stays bounded.
 *
 * @param root - Mounted browser occurrence.
 * @param query - Selectors identifying content, owners, and boundaries.
 * @param ownerId - Current rendered owner identity.
 * @param direction - Previous or next rendered owner.
 * @param scopeSelector - Selector identifying an optional local boundary.
 * @param mountAdjacent - Requests mounting of neighboring content.
 * @param isCurrent - Checks the originating attachment.
 * @returns Neighbor identity and edge offset, or undefined when unavailable.
 * @throws Propagates selector and host mounting failures.
 */
export function adjacentBrowserTextPosition(
  root: HTMLElement,
  query: TextSelectionQuery,
  ownerId: string,
  direction: "left" | "right",
  scopeSelector: string,
  mountAdjacent: TextNavigationMount,
  isCurrent: () => boolean,
): TextSelectionPosition | undefined {
  if (!isCurrent()) {
    return undefined;
  }
  const owner = firstOwner(root, query, ownerId);
  if (!owner) {
    return undefined;
  }
  const candidate = owner.closest(scopeSelector);
  const scope = candidate && root.contains(candidate) ? candidate : root;
  const content = adjacentContent(
    root,
    query,
    ownerId,
    direction === "left" ? -1 : 1,
    mountAdjacent,
    scope,
    true,
    isCurrent,
  );
  const adjacentId = content?.closest(query.ownerSelector)?.getAttribute(query.ownerAttribute);
  if (!content || !adjacentId || !isCurrent()) {
    return undefined;
  }
  return {
    ownerId: adjacentId,
    offset: direction === "left" ? (content.textContent?.length ?? 0) : 0,
  };
}

/**
 * Resolves vertical caret movement using rendered visual lines.
 *
 * Soft wrapping does not exist in stored text. Every offset is measured; a cached
 * layout index can replace this scan if profiling shows long content needs one.
 * The host may mount one adjacent owner only when movement leaves the current
 * owner at the rendered edge. Focus and model selection are not changed here.
 *
 * @param root - Mounted browser occurrence.
 * @param query - Selectors identifying content, owners, and boundaries.
 * @param position - Current owner identity and UTF-16 caret offset.
 * @param direction - Previous or next visual line.
 * @param mountAdjacent - Requests mounting of neighboring content.
 * @param isCurrent - Checks the originating attachment.
 * @returns Nearest visual-line position, or undefined when unavailable.
 * @throws Propagates browser measurement and host mounting failures.
 */
export function verticalBrowserTextPosition(
  root: HTMLElement,
  query: TextSelectionQuery,
  position: TextSelectionPosition,
  direction: "up" | "down",
  mountAdjacent: TextNavigationMount,
  isCurrent: () => boolean,
): TextSelectionPosition | undefined {
  if (!isCurrent()) {
    return undefined;
  }
  const owner = firstOwner(root, query, position.ownerId);
  const content = owner && ownedContent(root, query, owner);
  if (!content) {
    return undefined;
  }
  const current = caretCandidate(content, position.offset);
  const lines = caretLines(content);
  const index = lines.reduce(
    (best, line, index) =>
      Math.abs(line[0]!.top - current.top) < Math.abs(lines[best]![0]!.top - current.top)
        ? index
        : best,
    0,
  );
  const next = lines[index + (direction === "up" ? -1 : 1)];
  if (next) {
    return isCurrent()
      ? { ownerId: position.ownerId, offset: closestOnLine(next, current.left).offset }
      : undefined;
  }
  const adjacent = adjacentContent(
    root,
    query,
    position.ownerId,
    direction === "up" ? -1 : 1,
    mountAdjacent,
    root,
    false,
    isCurrent,
  );
  const adjacentId = adjacent?.closest(query.ownerSelector)?.getAttribute(query.ownerAttribute);
  if (!adjacent || !adjacentId || !isCurrent()) {
    return undefined;
  }
  const targetLines = caretLines(adjacent);
  const target = direction === "up" ? targetLines.at(-1) : targetLines[0];
  return target && isCurrent()
    ? { ownerId: adjacentId, offset: closestOnLine(target, current.left).offset }
    : undefined;
}

/**
 * Finds the first rendered owner with an exact identity in this occurrence.
 *
 * @param root - Mounted browser occurrence.
 * @param query - Owner and boundary selectors.
 * @param ownerId - Exact owner identity.
 * @returns First owned shell, or undefined when absent.
 * @throws Propagates browser selector failures.
 */
function firstOwner(
  root: HTMLElement,
  query: TextSelectionQuery,
  ownerId: string,
): Element | undefined {
  return [...root.querySelectorAll(query.ownerSelector)].find(
    (owner) =>
      owner.getAttribute(query.ownerAttribute) === ownerId &&
      owner.closest(query.boundarySelector) === root,
  );
}

/**
 * Finds the first content host owned directly by a rendered shell.
 *
 * @param root - Mounted browser occurrence.
 * @param query - Content, owner, and boundary selectors.
 * @param owner - Rendered owner shell.
 * @returns Directly owned content, or undefined when absent.
 * @throws Propagates browser selector failures.
 */
function ownedContent(
  root: HTMLElement,
  query: TextSelectionQuery,
  owner: Element,
): HTMLElement | undefined {
  return [...owner.querySelectorAll<HTMLElement>(query.contentSelector)].find(
    (content) =>
      root.contains(content) &&
      content.closest(query.boundarySelector) === root &&
      content.closest(query.ownerSelector) === owner,
  );
}

/**
 * Finds the next editable rendered shell, mounting at the current DOM edge when needed.
 *
 * Walking actual shells preserves distinct render occurrences even when they
 * share an ID. Vertical movement spans the occurrence and skips contentless
 * owners; horizontal movement can stop immediately and retain a local scope.
 *
 * @param root - Mounted occurrence that owns candidates.
 * @param query - Content, owner, and boundary selectors.
 * @param ownerId - Current rendered owner identity.
 * @param step - Negative for previous, positive for next.
 * @param mountAdjacent - Requests mounting of an offscreen neighbor.
 * @param scope - Whole occurrence or a nested navigation boundary.
 * @param immediate - Whether a contentless neighbor stops the walk.
 * @param isCurrent - Checks the originating attachment.
 * @returns Adjacent content host, or undefined at an edge or after remount.
 * @throws Propagates host mounting and selector failures.
 */
function adjacentContent(
  root: HTMLElement,
  query: TextSelectionQuery,
  ownerId: string,
  step: -1 | 1,
  mountAdjacent: TextNavigationMount,
  scope: Element,
  immediate: boolean,
  isCurrent: () => boolean,
): HTMLElement | undefined {
  const owners = () =>
    [...scope.querySelectorAll<HTMLElement>(query.ownerSelector)].filter(
      (owner) => root.contains(owner) && owner.closest(query.boundarySelector) === root,
    );
  let rendered = owners();
  let index = rendered.findIndex((owner) => owner.getAttribute(query.ownerAttribute) === ownerId);
  if (index < 0) {
    return undefined;
  }
  if (
    scope === root &&
    ((step < 0 && index === 0) || (step > 0 && index === rendered.length - 1))
  ) {
    mountAdjacent(ownerId, step);
    if (!isCurrent()) {
      return undefined;
    }
    rendered = owners();
    index = rendered.findIndex((owner) => owner.getAttribute(query.ownerAttribute) === ownerId);
    if (index < 0) {
      return undefined;
    }
  }
  for (let next = index + step; next >= 0 && next < rendered.length; next += step) {
    const owner = rendered[next]!;
    const content = ownedContent(root, query, owner);
    if (content && owner.getAttribute(query.ownerAttribute)) {
      return content;
    }
    if (immediate) {
      return undefined;
    }
  }
  return undefined;
}

/**
 * Converts a flat UTF-16 offset into a live text or content element endpoint.
 *
 * @param content - Editable host whose text nodes are walked.
 * @param requestedOffset - Requested UTF-16 offset; negatives clamp to zero.
 * @returns Live browser point clamped to the last text node or empty host.
 * @throws Propagates browser text traversal failures.
 */
function pointAtOffset(
  content: HTMLElement,
  requestedOffset: number,
): Pick<BrowserTextSelectionPoint, "node" | "offset"> {
  const walker = content.ownerDocument.createTreeWalker(content, 4);
  let remaining = Math.max(0, requestedOffset);
  let last: Node | undefined;
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    last = node;
    const length = node.textContent?.length ?? 0;
    if (remaining <= length) {
      return { node, offset: remaining };
    }
    remaining -= length;
  }
  return last
    ? { node: last, offset: last.textContent?.length ?? 0 }
    : { node: content, offset: 0 };
}

/**
 * Measures a collapsed caret, falling back to an adjacent character box.
 *
 * @param content - Mounted editable host whose layout is measured synchronously.
 * @param offset - UTF-16 offset, clamped to the host's text length.
 * @returns Text offset and viewport coordinates of the caret candidate.
 * @throws Propagates browser range and geometry failures.
 */
function caretCandidate(content: HTMLElement, offset: number): BrowserCaretCandidate {
  const length = content.textContent?.length ?? 0;
  const safeOffset = Math.max(0, Math.min(offset, length));
  const point = pointAtOffset(content, safeOffset);
  const range = content.ownerDocument.createRange();
  range.setStart(point.node, point.offset);
  range.collapse(true);
  let rect = range.getBoundingClientRect();
  if (!rect.height && length) {
    const fromPrevious = safeOffset === length;
    const start = pointAtOffset(content, fromPrevious ? safeOffset - 1 : safeOffset);
    const end = pointAtOffset(content, fromPrevious ? safeOffset : safeOffset + 1);
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    rect = range.getBoundingClientRect();
    return { offset: safeOffset, left: fromPrevious ? rect.right : rect.left, top: rect.top };
  }
  const contentRect = content.getBoundingClientRect();
  return {
    offset: safeOffset,
    left: rect.left || contentRect.left,
    top: rect.top || contentRect.top,
  };
}

/**
 * Groups measured character positions into rendered visual lines.
 *
 * @param content - Mounted editable host; every text offset is measured.
 * @returns Lines ordered vertically, grouping tops within two CSS pixels.
 * @throws Propagates browser range and geometry failures.
 */
function caretLines(content: HTMLElement): BrowserCaretCandidate[][] {
  const length = content.textContent?.length ?? 0;
  const lines: BrowserCaretCandidate[][] = [];
  for (let offset = 0; offset <= length; offset += 1) {
    const candidate = caretCandidate(content, offset);
    const line = lines.find((items) => Math.abs(items[0]!.top - candidate.top) < 2);
    if (line) {
      line.push(candidate);
    } else {
      lines.push([candidate]);
    }
  }
  return lines.sort((left, right) => left[0]!.top - right[0]!.top);
}

/**
 * Chooses the character on one visual line nearest a viewport x-coordinate.
 *
 * @param line - Nonempty measured line in text-offset order.
 * @param x - Desired horizontal viewport coordinate in CSS pixels.
 * @returns Nearest candidate, retaining the earlier offset for equal distances.
 */
function closestOnLine(line: BrowserCaretCandidate[], x: number): BrowserCaretCandidate {
  return line.reduce((closest, candidate) =>
    Math.abs(candidate.left - x) < Math.abs(closest.left - x) ? candidate : closest,
  );
}
