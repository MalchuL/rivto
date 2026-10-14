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

/**
 * Renders one block element as a positioned canvas card.
 *
 * The shell owns only canvas geometry and object controls. BlockTree supplies
 * the existing recursive BlockView/content/dnd tree inside it, so both surfaces
 * share the complete block rendering and interaction policy.
 *
 * @param props - Card element snapshot and the block IDs it currently owns.
 * @param props.element - Persisted block element including frame and auto-height.
 * @param props.blockIds - Ordered root block IDs projected into this card.
 * @returns Positioned card host, or null when it owns no blocks.
 */
function EdgelessBlockElementView({
  element,
  blockIds,
}: {
  readonly element: EditorElementNode;
  readonly blockIds: readonly string[];
}) {
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
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    [...content.children].forEach((child) => observer.observe(child));
    // Selection is intentionally omitted from deps: chrome-only
    // `data-block-selected` must not remount ResizeObserver or force scrollHeight.
    return () => observer.disconnect();
  }, [autoHeight, contentKey, element.frame.height, element.frame.width, element.id, panel]);

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
