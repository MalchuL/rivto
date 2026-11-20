import { observeCardHeightWhileMounted } from "./card-height-observation";
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
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { memo, useLayoutEffect, useRef } from "react";
import { ElementSlots } from "../../blocks";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { useEdgelessSelected } from "../../extensions/built-ins/selection/edgeless-runtime";
import { useEdgelessElementStyle } from "../../hooks/elements/use-edgeless-element-style";

const CARD_CLASS = "edgeless-card";
const CARD_CONTENT_CLASS = "edgeless-card-content";

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
  const { reactPanel: panel } = useReactPanelContext();
  const { ref: hostRef, identity: hostIdentity, style } = useEdgelessElementStyle(element);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const autoHeight = element.props.autoHeight !== false;
  const contentKey = blockIds.join("\0");
  useLayoutEffect(() => {
    const content = contentRef.current;
    const host = hostIdentity.current;
    if (!autoHeight || !content || !host) {
      return;
    }
    return observeCardHeightWhileMounted(panel, element, host, getBrowserElementIdentity(content));
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
