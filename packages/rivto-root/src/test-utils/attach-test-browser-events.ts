import type { BrowserEvents } from "../browser/events/browser-events";
import { BrowserInputRoot } from "../browser/input/browser-input-root";

/**
 * Attaches a test event manager to a fixture-owned browser Root.
 *
 * @param events - Event manager whose registrations are under test.
 * @param element - Fixture element serving as the occurrence mount.
 * @returns Disposer releasing the event attachment and fixture Root.
 * @throws Propagates setup or cleanup failures, including failed rollback.
 */
export function attachTestBrowserEvents(
  events: Pick<BrowserEvents, "attach">,
  element: HTMLElement,
): () => void {
  const root = new BrowserInputRoot(element);
  let detach: () => void;
  try {
    detach = events.attach(root);
  } catch (error) {
    try {
      root.detach();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Test Root setup failed");
    }
    throw error;
  }
  return () => {
    const errors: unknown[] = [];
    for (const release of [detach, () => root.detach()]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Test Root cleanup failed");
    }
  };
}
