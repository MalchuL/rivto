import type { EditorElementNode } from "@chulane/rivto";
import type { InputRegion, RegionIdentity } from "@chulane/rivto-root";
import { scheduleCardHeight } from "./card-height-updates";
import type { EdgelessCardHeightPanel } from "./types";

const MIN_CARD_HEIGHT = 100;

/**
 * Rebinds card measurement when the panel's mounted occurrence changes.
 *
 * The previous observer and pending update are released before capturing
 * regions from the replacement Root. Disabled panels retain their mounted Root.
 *
 * @param panel - Borrowed panel with the current mounted occurrence.
 * @param element - Card snapshot supplying identity and measured geometry.
 * @param host - Opaque identity of the card shell.
 * @param content - Opaque identity of the card content.
 * @returns Disposer releasing the panel subscription and current measurement.
 * @throws Propagates region capture, measurement, subscription, and cleanup failures.
 */
export function observeCardHeightWhileMounted(
  panel: EdgelessCardHeightPanel,
  element: EditorElementNode,
  host: RegionIdentity,
  content: RegionIdentity,
): () => void {
  let currentRoot = panel.mountedRoot;
  let releaseMeasurement: (() => void) | undefined;
  let revision = 0;
  let active = true;
  /**
   * Captures card regions from the current mounted occurrence.
   *
   * @returns The current occurrence is observed when both card regions are available.
   * @throws Propagates region capture, measurement, and cleanup failures.
   */
  const bind = () => {
    if (!active) {
      return;
    }
    const nextRoot = panel.mountedRoot;
    if (nextRoot === currentRoot && releaseMeasurement && nextRoot?.isAttached()) {
      return;
    }
    const bindingRevision = ++revision;
    const releasePrevious = releaseMeasurement;
    releaseMeasurement = undefined;
    releasePrevious?.();
    if (revision !== bindingRevision || !active) {
      return;
    }
    currentRoot = nextRoot;
    if (!nextRoot?.isAttached()) {
      return;
    }
    const hostRegion = nextRoot.captureRegionByIdentity(host);
    const contentRegion = nextRoot.captureRegionByIdentity(content);
    if (hostRegion && contentRegion && revision === bindingRevision && active) {
      const release = observeCardHeight(panel, element, hostRegion, contentRegion);
      if (
        revision !== bindingRevision ||
        !active ||
        panel.mountedRoot !== nextRoot ||
        !nextRoot.isAttached()
      ) {
        release();
        return;
      }
      releaseMeasurement = release;
    }
  };
  const unsubscribe = panel.subscribeAvailability(bind);
  try {
    bind();
  } catch (error) {
    active = false;
    revision += 1;
    const errors: unknown[] = [error];
    for (const cleanup of [unsubscribe, releaseMeasurement]) {
      try {
        cleanup?.();
      } catch (cleanupError) {
        errors.push(cleanupError);
      }
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Card height observation setup failed");
    }
    throw error;
  }
  return () => {
    active = false;
    revision += 1;
    const release = releaseMeasurement;
    releaseMeasurement = undefined;
    try {
      unsubscribe();
    } finally {
      release?.();
    }
  };
}

/**
 * Observes content dimensions and releases pending writes when the mounted card changes.
 *
 * Selection is intentionally omitted from the caller's effect dependencies:
 * chrome-only `data-block-selected` must not remount ResizeObserver or force
 * scrollHeight. The observer also watches direct children for content-driven
 * size changes and keeps geometry-locked resize previews under gesture ownership.
 *
 * @param panel - Borrowed receiving panel's card update and transaction operations.
 * @param element - Captured card identity and geometry for this observation.
 * @param host - Captured card shell whose explicit height is temporarily unlocked.
 * @param content - Captured content whose scroll height supplies the card height.
 * @returns Cleanup disconnecting observation and withdrawing the pending measurement.
 * @throws Propagates layout measurement or observer registration failures.
 */
function observeCardHeight(
  panel: Parameters<typeof scheduleCardHeight>[0],
  element: EditorElementNode,
  host: InputRegion,
  content: Pick<InputRegion, "readUnconstrainedScrollHeight" | "observeSize">,
): () => void {
  let cancelHeight: (() => void) | undefined;
  /**
   * Queues content-driven height for a shared transaction when it drifted.
   *
   * Temporarily unlocks CSS height so `scrollHeight` reflects content, then
   * restores the previous inline height. Geometry-lock skips the read during
   * live resize. Measurements from sibling cards finish before their queued
   * document writes, avoiding repeated scene refreshes inside the same commit.
   *
   * @returns A changed content height is queued for the shared card update batch.
   */
  const measure = () => {
    if (host.readAttribute("data-edgeless-geometry-lock") === "true") {
      return;
    }
    cancelHeight?.();
    cancelHeight = undefined;
    const scrollHeight = content.readUnconstrainedScrollHeight(host);
    if (scrollHeight === undefined) {
      return;
    }
    const height = Math.max(MIN_CARD_HEIGHT, Math.ceil(scrollHeight + 2));
    if (Math.abs(element.frame.height - height) < 1) {
      return;
    }
    // Undoing a recorded height change would remeasure and record it again, trapping undo.
    cancelHeight = scheduleCardHeight(panel, element.id, element.frame.width, height);
  };
  measure();
  let disconnect: () => void;
  try {
    disconnect = content.observeSize(measure, {
      includeChildren: true,
      allowUnavailable: true,
    });
  } catch (error) {
    cancelHeight?.();
    throw error;
  }
  return () => {
    try {
      disconnect();
    } finally {
      cancelHeight?.();
    }
  };
}
