import type { ClipboardTarget } from "../../events/types";
import type { ClipboardClosestHost, ClipboardEventNode } from "./types";

/** Matches boolean and plaintext-only contenteditable hosts. */
const CONTENT_EDITABLE_SELECTOR = "[contenteditable=true], [contenteditable=plaintext-only]";

/**
 * Captures target and live focus queries for one clipboard event.
 *
 * Edgeless visual labels may be plain-text editing hosts outside structured
 * blocks. Some browsers dispatch clipboard input to the document body even
 * while a label or control has focus; both origins must be checked. The original
 * target is retained even if the native event is later dispatched again, while
 * its ancestry and the document's focus remain live.
 *
 * @param event - Browser copy, cut, or paste event.
 * @returns Browser-free capability intended for synchronous event delivery.
 */
export function captureClipboardTarget(event: Event): ClipboardTarget {
  const source = event.target;
  return {
    /**
     * Identifies marked text controls and editable hosts outside block text.
     *
     * @param controlSelector - Selector identifying marked controls.
     * @param blockContentSelector - Selector identifying structured block text.
     * @returns True when the event target or focused host owns independent text editing.
     * @throws If a supplied selector is invalid.
     */
    isIndependentTextEditing(controlSelector, blockContentSelector) {
      const target = eventElement(source);
      const active = activeElementFrom(source);
      return [target, active].some(
        (node) =>
          node !== null && isIndependentTextHost(node, controlSelector, blockContentSelector),
      );
    },
  };
}

/**
 * Checks a marked text input or contenteditable that is not block text.
 *
 * @param origin - Event target or document active element.
 * @param controlSelector - Selector identifying marked controls.
 * @param blockContentSelector - Selector identifying structured block text.
 * @returns True for text inputs and visual editors; false for ordinary page blocks.
 * @throws If a supplied selector is invalid.
 */
function isIndependentTextHost(
  origin: ClipboardClosestHost,
  controlSelector: string,
  blockContentSelector: string,
): boolean {
  // Input/textarea expose selectionStart; buttons share the pointer marker but not text editing.
  if (origin.closest(controlSelector) && "selectionStart" in origin) {
    return true;
  }
  const editable = origin.closest<HTMLElement>(CONTENT_EDITABLE_SELECTOR);
  return Boolean(editable?.isContentEditable && !editable.closest(blockContentSelector));
}

/**
 * Resolves a DOM element from an event target, including text-node targets.
 *
 * @param target - Captured target, which may be a node rather than an element.
 * @returns The nearest matching host, or null when the target cannot answer closest queries.
 */
function eventElement(target: EventTarget | null): ClipboardClosestHost | null {
  if (isClosestHost(target)) {
    return target;
  }
  if (isNodeHost(target) && isClosestHost(target.parentElement)) {
    return target.parentElement;
  }
  return null;
}

/**
 * Reads the focused element from the event target's document when available.
 *
 * @param target - Captured event target used to reach the owning document.
 * @returns The focused host, or null when focus is unavailable.
 */
function activeElementFrom(target: EventTarget | null): ClipboardClosestHost | null {
  const document = isNodeHost(target) ? target.ownerDocument : undefined;
  const active = document?.activeElement;
  return isClosestHost(active) ? active : null;
}

/**
 * Duck-types an object that can answer CSS closest queries.
 *
 * @param value - Candidate event target or focused node.
 * @returns True when closest is callable.
 */
function isClosestHost(value: unknown): value is ClipboardClosestHost {
  return (
    value !== null &&
    typeof value === "object" &&
    "closest" in value &&
    typeof value.closest === "function"
  );
}

/**
 * Duck-types a node-like object with a parent and owner document.
 *
 * @param value - Candidate event target.
 * @returns True when parent and document can be read.
 */
function isNodeHost(value: unknown): value is ClipboardEventNode {
  return value !== null && typeof value === "object" && "ownerDocument" in value;
}
