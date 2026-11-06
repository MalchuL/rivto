import { useCallback, useLayoutEffect, useRef } from "react";
import type { ReactPanelApi } from "../../panels/types";

/**
 * Batches content-driven card measurements in one history-free transaction per frame.
 *
 * A global typography or font-load change can resize every card together. Keeping
 * their existing measurement callbacks in one batch prevents one document notification
 * and surface update per card. Initial mount measurements remain synchronous.
 *
 * Scheduling the same callback more than once before the frame runs deduplicates
 * it by function identity. Cancellation removes that callback from the pending set;
 * repeated cancellation is harmless and cannot interrupt an executing measurement.
 * Each frame snapshots and clears the set before running callbacks in insertion
 * order, so work scheduled during execution belongs to a later frame.
 *
 * Unmounting or changing the panel cancels the scheduled frame and discards pending
 * callbacks. Use the scheduler only while its owning surface is mounted. Callback
 * failures propagate from the animation-frame callback; later callbacks in that
 * batch are not run. Individual cards own DOM measurement and geometry-lock checks.
 *
 * @param panel - Surface owner whose element measurements share one transaction
 * excluded from document undo history.
 * @returns Scheduler stable while panel identity is unchanged. It accepts a synchronous
 * card measurement and returns an idempotent cancellation callback for that pending
 * function; scheduling does not measure the card or mutate the document immediately.
 */
export function useCardHeightMeasurements(panel: ReactPanelApi) {
  const pending = useRef(new Set<() => void>());
  const frame = useRef<number | undefined>(undefined);
  useLayoutEffect(() => {
    const measurements = pending.current;
    return () => {
      if (frame.current !== undefined) {
        cancelAnimationFrame(frame.current);
        frame.current = undefined;
      }
      measurements.clear();
    };
  }, [panel]);
  return useCallback(
    (measure: () => void) => {
      pending.current.add(measure);
      if (frame.current === undefined) {
        frame.current = requestAnimationFrame(() => {
          frame.current = undefined;
          const measurements = [...pending.current];
          pending.current.clear();
          panel.batchUpdatesWithoutHistory(() => {
            measurements.forEach((measurement) => measurement());
          });
        });
      }
      return () => {
        pending.current.delete(measure);
      };
    },
    [panel],
  );
}
