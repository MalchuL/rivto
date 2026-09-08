/**
 * Detects clipboard events that belong to a non-block contenteditable host.
 *
 * Edgeless visual labels (text, stickers, shapes, connectors) are plain-text
 * `contentEditable` hosts without `data-block-content`. Structured copy/paste
 * must not claim those events: paste would follow the previous block selection,
 * and copy would serialize the selected visual as a new element.
 */
import { BLOCK_CONTENT_SELECTOR } from "../../constants";

/** Matches boolean and plaintext-only contenteditable hosts. */
const CONTENT_EDITABLE_SELECTOR = "[contenteditable=true], [contenteditable=plaintext-only]";

/**
 * True when a clipboard event should use native/plain-text editing instead of
 * structured block or visual clipboard handling.
 *
 * Checks both `event.target` and `document.activeElement` because Firefox can
 * dispatch copy/paste to `document.body` while a label still holds focus.
 *
 * @param event - Native copy, cut, or paste event.
 * @returns True when the focused host is an editable visual label.
 */
export function isNonBlockEditableClipboardEvent(event: Event): boolean {
  const target = eventElement(event);
  const active = activeElementFrom(event);
  return [target, active].some((node) => Boolean(node && isNonBlockEditableHost(node)));
}

/**
 * True when `origin` is inside a contenteditable that is not block text.
 *
 * @param origin - Event target or `document.activeElement`.
 * @returns True for visual label editors; false for page blocks and controls.
 */
function isNonBlockEditableHost(origin: { closest: Element["closest"] }): boolean {
  const editable = origin.closest<HTMLElement>(CONTENT_EDITABLE_SELECTOR);
  return Boolean(editable?.isContentEditable && !editable.closest(BLOCK_CONTENT_SELECTOR));
}

/**
 * Resolves a DOM element from an event target, including text-node targets.
 *
 * @param event - Native event whose target may be a Node rather than an Element.
 * @returns The nearest Element, or null when the target cannot answer `closest`.
 */
function eventElement(event: Event): { closest: Element["closest"] } | null {
  const target = event.target;
  if (isClosestHost(target)) return target;
  if (isNodeHost(target) && isClosestHost(target.parentElement)) return target.parentElement;
  return null;
}

/**
 * Reads `document.activeElement` from the event's document when available.
 *
 * @param event - Native event used to reach the owning document.
 * @returns The focused element, or null when focus is outside the document.
 */
function activeElementFrom(event: Event): { closest: Element["closest"] } | null {
  const target = event.target;
  const document = isNodeHost(target) ? target.ownerDocument : undefined;
  const active = document?.activeElement;
  return isClosestHost(active) ? active : null;
}

/**
 * Duck-types an object that can answer CSS `closest` queries.
 *
 * @param value - Candidate event target or focused node.
 * @returns True when `closest` is callable.
 */
function isClosestHost(value: unknown): value is { closest: Element["closest"] } {
  return Boolean(value) && typeof (value as { closest?: unknown }).closest === "function";
}

/**
 * Duck-types a Node-like object with a parent and owner document.
 *
 * @param value - Candidate event target.
 * @returns True when parent and document can be read.
 */
function isNodeHost(value: unknown): value is {
  parentElement: unknown;
  ownerDocument: { activeElement: unknown } | null;
} {
  return value !== null && typeof value === "object" && "ownerDocument" in value;
}
