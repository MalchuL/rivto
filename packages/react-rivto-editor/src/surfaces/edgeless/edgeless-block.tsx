/**
 * Positioned canvas card for one block element.
 *
 * Selection chrome subscribes per card ID so marquee growth does not re-render
 * unselected neighbors. `BlockTree` is memoized on the `blockIds` reference so
 * flipping `data-block-selected` does not re-parse Markdown. Auto-height
 * measure is scoped to geometry and content, never to selection, so reading
 * `scrollHeight` cannot hitch pointermove.
 */
import type { EditorElementNode } from "@chulane/rivto";
import { memo, useLayoutEffect, useRef } from "react";
import { BlockTree, ElementSlots } from "../../blocks";
import { usePanel } from "../../hooks";
import { useEdgelessSelected } from "../../extensions/built-ins/selection/edgeless-runtime";
import { useEdgelessElementStyle } from "../../hooks/elements/use-edgeless-element-style";

const CARD_CLASS = "edgeless-card";
const CARD_CONTENT_CLASS = "edgeless-card-content";
const MIN_CARD_HEIGHT = 100;

/** Geometry, projected roots, and the surface-owned auto-height scheduler for one card. */
interface EdgelessBlockElementProps {
  /** Persisted card snapshot supplying geometry and the autoHeight policy. */
  readonly element: EditorElementNode;
  /** Ordered root block IDs rendered inside this card through the shared block tree. */
  readonly blockIds: readonly string[];
  /**
   * Queues a content measurement in the surface's next history-free frame batch.
   * The card cancels pending work when its observation effect is replaced or unmounted.
   *
   * @param measure - Existing synchronous card measurement to run, deduplicated by callback identity.
   * @returns Idempotent cancellation for the pending callback; it does not undo a completed measurement.
   */
  readonly scheduleHeightMeasurement: (measure: () => void) => () => void;
}

/**
 * Renders one block element as a positioned canvas card.
 *
 * The shell owns only canvas geometry and object controls. BlockTree supplies
 * the existing recursive BlockView/content/dnd tree inside it, so both surfaces
 * share the complete block rendering and interaction policy.
 *
 * Auto-height defaults to enabled unless explicitly false. The card measures once
 * synchronously after commit, then queues ResizeObserver measurements through the
 * surface scheduler. Height writes bypass undo history, geometry-locked cards skip
 * measurement during live resize, and cleanup disconnects observation and cancels
 * any pending measurement before its owner is replaced.
 *
 * @param props - Card element snapshot and the block IDs it currently owns.
 * @param props.element - Persisted block element including frame and auto-height.
 * @param props.blockIds - Ordered root block IDs projected into this card.
 * @param props.scheduleHeightMeasurement - Surface-owned scheduler that batches resize observations.
 * @returns Positioned card host, or null when it owns no blocks.
 */
function EdgelessBlockElementView({
  element,
  blockIds,
  scheduleHeightMeasurement,
}: EdgelessBlockElementProps) {
  const selected = useEdgelessSelected(element.id);
  const panel = usePanel();
  const { ref: hostRef, style } = useEdgelessElementStyle(element);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoHeight = element.props.autoHeight !== false;
  const contentKey = blockIds.join("\0");
  useLayoutEffect(() => {
    const content = contentRef.current;
    const host = hostRef.current;
    if (!autoHeight || !content || !host) {
      return;
    }
    /**
     * Writes content-driven height into the element frame when it drifted.
     *
     * Temporarily unlocks CSS height so `scrollHeight` reflects content, then
     * restores the previous inline height. Geometry-lock skips the read during
     * live resize.
     *
     * @returns Nothing.
     */
    const measure = () => {
      if (host.dataset.edgelessGeometryLock === "true") {
        return;
      }
      const previousHeight = host.style.height;
      host.style.height = "auto";
      const height = Math.max(MIN_CARD_HEIGHT, Math.ceil(content.scrollHeight + 2));
      host.style.height = previousHeight;
      if (Math.abs(element.frame.height - height) < 1) {
        return;
      }
      // Undoing a recorded height change would remeasure and record it again, trapping undo.
      panel.batchUpdatesWithoutHistory(() => {
        panel.elements.updateElement(element.id, { frame: { height } });
      });
    };
    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    let cancelMeasurement: (() => void) | undefined;
    const observer = new ResizeObserver(() => {
      cancelMeasurement?.();
      cancelMeasurement = scheduleHeightMeasurement(measure);
    });
    observer.observe(content);
    [...content.children].forEach((child) => observer.observe(child));
    // Selection is intentionally omitted from deps: chrome-only
    // `data-block-selected` must not remount ResizeObserver or force scrollHeight.
    return () => {
      observer.disconnect();
      cancelMeasurement?.();
    };
  }, [
    autoHeight,
    contentKey,
    element.frame.height,
    element.frame.width,
    element.id,
    panel,
    scheduleHeightMeasurement,
  ]);

  if (!blockIds.length) {
    return null;
  }

  return (
    <section
      ref={hostRef}
      className={CARD_CLASS}
      data-edgeless-root={element.id}
      data-edgeless-object-kind="block"
      data-edgeless-object-id={element.id}
      data-block-selected={selected || undefined}
      data-auto-height={autoHeight ? "true" : "false"}
      style={style}
      tabIndex={0}
    >
      <div ref={contentRef} className={CARD_CONTENT_CLASS} data-edgeless-card-content="true">
        <BlockTree blockIds={blockIds} />
      </div>
      <ElementSlots element={element} selected={selected} />
    </section>
  );
}

/**
 * Skips unchanged cards when another element updates in the shared collection.
 *
 * @param previous - Previously rendered stable element, block range, and measurement scheduler.
 * @param next - Candidate element, block range, and measurement scheduler.
 * @returns Whether element and scheduler identities match and both block ID lists
 * contain the same IDs in the same order, so the card render can be skipped.
 */
function sameEdgelessBlockElement(
  previous: EdgelessBlockElementProps,
  next: EdgelessBlockElementProps,
): boolean {
  return (
    previous.element === next.element &&
    previous.scheduleHeightMeasurement === next.scheduleHeightMeasurement &&
    previous.blockIds.length === next.blockIds.length &&
    previous.blockIds.every((id, index) => id === next.blockIds[index])
  );
}

/** Memoized positioned card woken by its own selection or changed persisted inputs. */
export const EdgelessBlockElement = memo(EdgelessBlockElementView, sameEdgelessBlockElement);
