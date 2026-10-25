import { memo } from "react";
import type { BlockRenderer, BlockRendererProps } from "../../renderers/types";
import { useBlockRenderer } from "../../hooks/use-block-renderer";
import { BLOCK_EDITOR_CLASSES } from "../../block-editor-classes";
import { useBlockLayoutState } from "./block-layout-context";
import { useBlockRegion } from "./use-block-region";

/** Stable content component and ID, isolated from block layout state changes. */
interface BlockContentRendererProps extends BlockRendererProps {
  /** Stable component resolved from the live renderer registry. */
  readonly renderer: BlockRenderer;
}

/**
 * Keeps selection and shell updates from rerendering unchanged block content.
 *
 * React.memo lets React skip this boundary when blockId and the renderer component
 * identity are unchanged, even if the surrounding shell updates its selection.
 * Content still updates through its own state, context, and addressed subscriptions;
 * memo does not freeze the rendered block or prevent its data from changing.
 * The named function keeps BlockContentRenderer identifiable in DevTools and stack traces;
 * the outer constant holds the memoized component returned by React.memo.
 *
 * @param props - Persisted identity and stable content component.
 * @param props.blockId - Identity read by the renderer's addressed hooks.
 * @param props.renderer - Component resolved from the live host registry.
 * @returns The content renderer without child blocks or structural controls.
 */
const BlockContentRenderer = memo(function BlockContentRenderer({
  blockId,
  renderer: Content,
}: BlockContentRendererProps) {
  return <Content blockId={blockId} />;
});

/**
 * Places host content in the layout without acquiring recursive rendering responsibility.
 *
 * Block layout state updates can rerun this primitive, but the memoized content boundary keeps
 * an unchanged host component asleep. Its own hooks still observe live content.
 * Its committed ref declares this owner's body bounds for shared interaction
 * geometry; replacement and unmount release that registration.
 *
 * @returns The content host, empty when neither registration nor fallback supplies content.
 * @throws If outside a block layout, or renderer lookup/content rendering fails.
 */
export function BlockContent() {
  const { block } = useBlockLayoutState();
  const Content = useBlockRenderer(block.type);
  const ref = useBlockRegion(block.id, "content");
  return (
    <div ref={ref} className={BLOCK_EDITOR_CLASSES.content}>
      {Content && <BlockContentRenderer blockId={block.id} renderer={Content} />}
    </div>
  );
}
