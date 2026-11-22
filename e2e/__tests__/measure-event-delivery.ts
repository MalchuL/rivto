import type { Page } from "@playwright/test";

/** Elapsed milliseconds from window capture to bubbling and to the second following frame. */
interface EventDeliveryTiming {
  readonly sync: number;
  readonly frames: number;
}

/**
 * Measures a native event through window bubbling and the following two browser frames.
 *
 * Each sample has its own browser-side state. Setup and Playwright round trips are outside
 * the timed interval. The scenario checks the editor state after the action completes.
 *
 * @param page - Warm demo where the input will be delivered.
 * @param eventType - Browser event emitted by the action that reaches window in both phases.
 * @param performInput - Issues the real Playwright keyboard or pointer action after setup.
 * @returns Synchronous delivery and two-frame durations in milliseconds.
 * @throws If the action fails, the page closes, or the expected event or frame times out.
 */
export async function measureEventDelivery(
  page: Page,
  eventType: keyof WindowEventMap,
  performInput: () => Promise<void>,
): Promise<EventDeliveryTiming> {
  const sample = await page.evaluateHandle(startEventTiming, eventType);
  try {
    await performInput();
    const timing = await page.waitForFunction((state) => state.timing, sample);
    try {
      const measured = await timing.jsonValue();
      if (!measured) {
        throw new Error(`Missing timing for ${eventType}`);
      }
      return measured;
    } finally {
      await timing.dispose();
    }
  } finally {
    try {
      if (!page.isClosed()) {
        await sample.evaluate(({ listeners }) => listeners.abort());
      }
    } finally {
      await sample.dispose();
    }
  }
}

/**
 * Arms a sample inside the browser before Playwright sends its input.
 *
 * Only the bubble phase of the captured event can finish this sample. The
 * controller also releases both listeners if the action fails or never bubbles.
 *
 * @param type - Native event to measure in the current window.
 * @returns Mutable browser state with the listener controller and eventual timings.
 */
function startEventTiming(type: keyof WindowEventMap) {
  const listeners = new AbortController();
  const state: { listeners: AbortController; timing?: EventDeliveryTiming } = { listeners };
  window.addEventListener(
    type,
    (captured) => {
      const start = performance.now();
      window.addEventListener(
        type,
        (bubbled) => {
          if (bubbled !== captured) {
            return;
          }
          const sync = performance.now() - start;
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              state.timing = { sync, frames: performance.now() - start };
            }),
          );
        },
        { signal: listeners.signal },
      );
    },
    { capture: true, once: true, signal: listeners.signal },
  );
  return state;
}
