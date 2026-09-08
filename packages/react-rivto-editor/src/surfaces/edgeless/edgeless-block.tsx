/**
 * Positioned canvas card for one block element.
 *
 * Selection chrome subscribes per card ID so marquee growth does not re-render
 * unselected neighbors. `BlockTree` is memoized on the `blockIds` reference so
 * flipping `data-block-selected` does not re-parse Markdown. Auto-height
 * measure is scoped to geometry and content, never to selection, so reading
 * `scrollHeight` cannot hitch pointermove.
 */
import type { EditorElement } from "@chulane/rivto";
import { useLayoutEffect, useRef, type CSSProperties } from "react";
import { useEdgelessSelected } from "../../extensions/edgeless/edgeless-runtime";
import { BlockTree, ElementSlots } from "../../blocks";
import { useReactEditor } from "../../hooks";

const AUTO_HEIGHT_ORIGIN = Symbol("rivto-react-block-element-auto-height");
const CARD_CLASS = "edgeless-card";
const CARD_CONTENT_CLASS = "edgeless-card-content";
const RESIZE_HANDLE_CLASS = "edgeless-resize-handle";
const RESIZE_HANDLES = ["n", "e", "s", "w", "nw", "ne", "sw", "se"] as const;
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
export function EdgelessBlockElement({
  element,
  blockIds,
}: {
  readonly element: EditorElement;
  readonly blockIds: readonly string[];
}) {
  const selected = useEdgelessSelected(element.id);
  const reactEditor = useReactEditor();
  const hostRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoHeight = element.props.autoHeight !== false;
  const contentKey = blockIds.join("\0");
  /**
   * During resize, transform writes preview geometry as inline styles and sets
   * data-edgeless-geometry-lock. Re-renders must echo those inline values back
   * through the style prop — omitting them lets React clear left/top/width/height
   * and the card jumps.
   */
  const host = hostRef.current;
  const geometryLocked = host?.dataset.edgelessGeometryLock === "true";
  const style: CSSProperties = {
    left: geometryLocked && host.style.left ? host.style.left : element.frame.x,
    top: geometryLocked && host.style.top ? host.style.top : element.frame.y,
    width: geometryLocked && host.style.width ? host.style.width : element.frame.width,
    height: geometryLocked && host.style.height ? host.style.height : element.frame.height,
    zIndex: element.zIndex,
  };

  useLayoutEffect(() => {
    const content = contentRef.current;
    const host = hostRef.current;
    if (!autoHeight || !content || !host) return;
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
      if (host.dataset.edgelessGeometryLock === "true") return;
      const previousHeight = host.style.height;
      host.style.height = "auto";
      const height = Math.max(MIN_CARD_HEIGHT, Math.ceil(content.scrollHeight + 2));
      host.style.height = previousHeight;
      if (Math.abs(element.frame.height - height) < 1) return;
      reactEditor.editor.document.crdt.transact(() => {
        reactEditor.editor.document.elements.updateElement(element.id, { frame: { height } });
      }, AUTO_HEIGHT_ORIGIN);
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(content);
    [...content.children].forEach((child) => observer.observe(child));
    // Selection is intentionally omitted from deps: chrome-only
    // `data-block-selected` must not remount ResizeObserver or force scrollHeight.
    return () => observer.disconnect();
  }, [autoHeight, contentKey, element.frame.height, element.frame.width, element.id, reactEditor]);

  if (!blockIds.length) return null;

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
      {RESIZE_HANDLES.map((corner) => (
        <button
          key={corner}
          type="button"
          className={RESIZE_HANDLE_CLASS}
          data-edgeless-resize-handle={corner}
          aria-label={`Resize canvas block ${corner}`}
        />
      ))}
    </section>
  );
}
