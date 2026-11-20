import type { KeyboardTarget } from "@chulane/rivto-root";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

/**
 * Captures a keyboard target from a normalized Root delivery.
 *
 * @param root - Fixture occurrence receiving the keyboard event.
 * @param event - Keyboard event to deliver to the occurrence.
 * @returns Live target queries captured for this delivery.
 * @throws If no keyboard target is delivered.
 */
export function captureTestKeyboardTarget(root: HTMLElement, event: KeyboardEvent): KeyboardTarget {
  const occurrence = new BrowserInputRoot(root);
  let target: KeyboardTarget | undefined;
  const detach = occurrence.observeInput("keydown", (input) => {
    target = input.keyboardTarget;
  });
  try {
    root.dispatchEvent(event);
  } finally {
    detach?.();
    occurrence.detach();
  }
  if (!target) {
    throw new Error("Keyboard target was not delivered");
  }
  return target;
}
