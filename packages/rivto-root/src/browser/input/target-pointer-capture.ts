import { capturePointer } from "./pointer-capture";
import type { InputRootOwnerCheck } from "./types";

/**
 * Captures a pointer on its nearest matching target inside the input root.
 *
 * Text-node targets use their parent element. A detached listener, missing
 * match, or match outside the root cannot acquire capture.
 *
 * @param pointer - Browser pointer delivery supplying the target and identity.
 * @param root - Mounted input root bounding the matching target.
 * @param selector - Selector identifying the target or its ancestor.
 * @param isAttached - Checks the originating listener attachment.
 * @returns Idempotent capture release, or undefined when no owned target matches.
 * @throws If selector evaluation or browser capture fails.
 */
export function captureTargetPointer(
  pointer: PointerEvent,
  root: HTMLElement,
  selector: string,
  isAttached: InputRootOwnerCheck,
): (() => void) | undefined {
  if (!isAttached()) {
    return undefined;
  }
  const view = root.ownerDocument.defaultView;
  const source = pointer.target;
  let element: Element | null = null;
  if (view && source instanceof view.Element) {
    element = source;
  } else if (view && source instanceof view.Text) {
    element = source.parentElement;
  }
  const target = element?.closest(selector);
  if (!target || !root.contains(target)) {
    return undefined;
  }
  return capturePointer(target, pointer.pointerId, () => isAttached() && root.contains(target));
}
