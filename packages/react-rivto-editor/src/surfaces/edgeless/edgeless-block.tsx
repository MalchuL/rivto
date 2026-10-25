import { scheduleCardHeight } from "./card-height-updates";
import { BlockRootNode, BlockDropLayout } from "@chulane/rivto-page";
/**
 * Positioned canvas card for one block element.
 *
 * Selection chrome subscribes per card ID so marquee growth does not re-render
 * unselected neighbors. The card is memoized on the `blockIds` contents so
 * flipping `data-block-selected` does not re-parse Markdown. Auto-height
 * measure is scoped to geometry and content, never to selection, so reading
 * `scrollHeight` cannot hitch pointermove.
 */
import type { EditorElementNode } from "@chulane/rivto";
import { memo, useLayoutEffect, useRef } from "react";
import { ElementSlots } from "../../blocks";
import { usePanel } from "../../hooks";
import { useEdgelessSelected } from "../../extensions/built-ins/selection/edgeless-runtime";
import { useEdgelessElementStyle } from "../../hooks/elements/use-edgeless-element-style";

const CARD_CLASS = "edgeless-card";
const CARD_CONTENT_CLASS = "edgeless-card-content";
const MIN_CARD_HEIGHT = 100;

interface EdgelessBlockElementProps {
  readonly element: EditorElementNode;
  readonly blockIds: readonly string[];
}

/**
 * Renders one block element as a positioned canvas card.
 *
 * The shell owns only canvas geometry and object controls. Page supplies
 * addressed block nodes with shared content, layout and drag ownership, so both surfaces
 * share the complete block rendering and interaction policy.
 *
 * @param props - Card element snapshot and the block IDs it currently owns.
 * @param props.element - Persisted block element including frame and auto-height.
 * @param props.blockIds - Ordered root block IDs projected into this card.
 * @returns Positioned card host, or null when it owns no blocks.
 */
function EdgelessBlockElementView({ element, blockIds }: EdgelessBlockElementProps) {
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
    return observeCardHeight(panel, element, host, content);
  }, [autoHeight, contentKey, element.frame.height, element.frame.width, element.id, panel]);

  if (!blockIds.length) {
    return null;
  }

  return (
    <section
      ref={hostRef}
      className={CARD_CLASS}
      data-edgeless-root={element.id}
      data-canvas-element={element.id}
      data-edgeless-object-kind="block"
      data-edgeless-object-id={element.id}
      data-block-selected={selected || undefined}
      data-auto-height={autoHeight ? "true" : "false"}
      style={style}
      tabIndex={0}
    >
      <BlockDropLayout options={{ axis: "vertical", order: blockIds }}>
        <div
          ref={contentRef}
          className={CARD_CONTENT_CLASS}
          data-edgeless-card-content="true"
          data-block-root-list
        >
          {blockIds.map((blockId) => (
            <BlockRootNode key={blockId} blockId={blockId} />
          ))}
        </div>
      </BlockDropLayout>
      <ElementSlots element={element} selected={selected} />
    </section>
  );
}

/**
 * Skips unchanged cards when another element updates in the shared collection.
 *
 * @param previous - Previously rendered stable element and block range.
 * @param next - Candidate element and block range.
 * @returns Whether both inputs describe the same card render.
 */
function sameEdgelessBlockElement(
  previous: { readonly element: EditorElementNode; readonly blockIds: readonly string[] },
  next: { readonly element: EditorElementNode; readonly blockIds: readonly string[] },
): boolean {
  return (
    previous.element === next.element &&
    previous.blockIds.length === next.blockIds.length &&
    previous.blockIds.every((id, index) => id === next.blockIds[index])
  );
}

/** Memoized positioned card woken by its own selection or changed persisted inputs. */
export const EdgelessBlockElement = memo(EdgelessBlockElementView, sameEdgelessBlockElement);

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
 * @param host - Mounted card shell whose explicit height is temporarily unlocked.
 * @param content - Mounted content whose scroll height supplies the card height.
 * @returns Cleanup disconnecting observation and withdrawing the pending measurement.
 * @throws Propagates layout measurement or observer registration failures.
 */
function observeCardHeight(
  panel: Parameters<typeof scheduleCardHeight>[0],
  element: EditorElementNode,
  host: HTMLElement,
  content: HTMLElement,
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
    if (host.dataset.edgelessGeometryLock === "true") {
      return;
    }
    cancelHeight?.();
    cancelHeight = undefined;
    const previousHeight = host.style.height;
    host.style.height = "auto";
    const height = Math.max(MIN_CARD_HEIGHT, Math.ceil(content.scrollHeight + 2));
    host.style.height = previousHeight;
    if (Math.abs(element.frame.height - height) < 1) {
      return;
    }
    // Undoing a recorded height change would remeasure and record it again, trapping undo.
    cancelHeight = scheduleCardHeight(panel, element.id, element.frame.width, height);
  };
  measure();
  const observer = typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
  observer?.observe(content);
  [...content.children].forEach((child) => observer?.observe(child));
  return () => {
    observer?.disconnect();
    cancelHeight?.();
  };
}
