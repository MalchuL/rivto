import type { PanelAPI } from "@chulane/rivto";

/** Borrowed transaction and element operations for measured card heights. */
type CardHeightPanel = Pick<PanelAPI, "batchUpdatesWithoutHistory"> & {
  readonly elements: Pick<PanelAPI["elements"], "getElementNode" | "updateElements">;
};

/** One measurement tied to the width at which the card content was laid out. */
interface CardHeightUpdate {
  readonly height: number;
  readonly width: number;
}

/** Pending measurements are weakly keyed by their receiving panel and released at the next microtask. */
const pendingHeights = new WeakMap<CardHeightPanel, Map<string, CardHeightUpdate>>();

/**
 * Coalesces card measurements from one render into a single history-excluded transaction.
 *
 * Measurements publish in a microtask after the current layout effects finish.
 * A later measurement of the same card replaces the earlier one. Cleanup cancels
 * only this measurement; it cannot withdraw a replacement from a newer mount.
 * Deleted cards, changed widths and cards switched to fixed height are skipped.
 *
 * @param panel - Borrowed receiving panel; no lifecycle operations are retained.
 * @param id - Persisted card identity measured by its mounted content.
 * @param width - Card width in canvas units when content was measured.
 * @param height - Measured content height in canvas units, including the card border.
 * @returns Disposer withdrawing this pending measurement when its card unmounts or changes.
 * @throws Document read and write failures propagate from the queued flush.
 */
export function scheduleCardHeight(
  panel: CardHeightPanel,
  id: string,
  width: number,
  height: number,
): () => void {
  let pending = pendingHeights.get(panel);
  if (!pending) {
    pending = new Map();
    pendingHeights.set(panel, pending);
    const batch = pending;
    queueMicrotask(() => flushCardHeights(panel, batch));
  }
  const update = { width, height };
  const batch = pending;
  batch.set(id, update);
  return () => {
    if (batch.get(id) === update) {
      batch.delete(id);
    }
  };
}

/**
 * Publishes still-current measurements after every card has finished reading layout.
 *
 * The pending collection is detached before writes so subscriber-triggered
 * measurements schedule another flush. No transaction opens for an empty batch.
 *
 * @param panel - Panel whose cards supplied the measurements.
 * @param pending - This microtask's measurements, excluding canceled entries.
 * @returns Valid card heights are updated together without a user undo item.
 * @throws Propagates element reads, transaction failures and synchronous subscriber errors.
 */
function flushCardHeights(
  panel: CardHeightPanel,
  pending: ReadonlyMap<string, CardHeightUpdate>,
): void {
  pendingHeights.delete(panel);
  const updates = [...pending].filter(([id, update]) => {
    const element = panel.elements.getElementNode(id);
    return (
      element &&
      element.props.autoHeight !== false &&
      element.frame.width === update.width &&
      Math.abs(element.frame.height - update.height) >= 1
    );
  });
  if (!updates.length) {
    return;
  }
  panel.batchUpdatesWithoutHistory(() => {
    panel.elements.updateElements(
      updates.map(([id, { height }]) => ({ id, patch: { frame: { height } } })),
    );
  });
}
