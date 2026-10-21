import { BlockWrapper } from "../block-wrapper/block-wrapper";
import { memo, useCallback, useId, useMemo, useSyncExternalStore } from "react";
import type { BlockRendererProps, BlockLayout } from "../../renderers/types";
import type { BlockEditorNodeSnapshot } from "../../../adapter/types";
import type { BlockEditorNodeApi } from "../../../editor/blocks/block-editor-node-api";
import { useBlockNode } from "../../hooks/use-block-node";
import { useBlockSelected } from "../../hooks/use-block-selected";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";
import { BlockView } from "./block-view";
import { BlockLayoutContext, BlockChildrenContext } from "./block-layout-context";
import { DefaultBlockLayout } from "./default-block-layout";

/** Existing node fields and selection presentation used to build its single shell. */
interface BlockNodeViewProps extends BlockRendererProps {
  /** Stable borrowed node whose commands read current adapter data. */
  readonly node: BlockEditorNodeApi;
  /** Detached own-node snapshot; children have independent addressed subscriptions. */
  readonly block: BlockEditorNodeSnapshot;
  /** Current whole-block selection state used by the common shell. */
  readonly selected: boolean;
}

/** Stable identity and layout component; snapshots reach primitive consumers separately. */
interface BlockLayoutRendererProps extends BlockRendererProps {
  readonly layout: BlockLayout;
}

/**
 * Keeps layout composition asleep during block data, selection, and content changes.
 *
 * @param props - Stable identity and component selected from the live registry.
 * @param props.blockId - ID available to host-specific hooks.
 * @param props.layout - Component composing Page primitives through JSX.
 * @returns The host layout, whose subscribed primitive descendants still update.
 */
const BlockLayoutRenderer = memo(function BlockLayoutRenderer({
  blockId,
  layout: Layout,
}: BlockLayoutRendererProps) {
  return <Layout blockId={blockId} />;
});

/**
 * Resolves a live layout only for a node that currently exists.
 *
 * The shell applies the resolved CSS background value supplied by the host.
 * Primitive consumers receive current block layout state without changing occurrence identity.
 * Collapsing retains the occurrence-local child container but unmounts its
 * descendants and their subscriptions. Body slots remain outside that subtree
 * when composed separately by the layout, as in DefaultBlockLayout.
 *
 * @param props - Existing node, its stable identity, and whole-block selection state.
 * @param props.blockId - Renderer identity, also used as the structural DOM marker.
 * @param props.node - Stable live commands for slot contributions.
 * @param props.block - Detached node whose direct children are rendered separately.
 * @param props.selected - Whether the shell exposes whole-block selection.
 * @returns One shell and its replaceable layout even without a content renderer.
 * @throws Propagates registry and host component failures.
 */
function BlockNodeView({ blockId, node, block, selected }: BlockNodeViewProps) {
  const { slots, renderers } = useBlockEditorController();
  const subscribeSlots = useCallback((listener: () => void) => slots.subscribe(listener), [slots]);
  const readSlots = useCallback(() => slots.getSnapshot(), [slots]);
  const entries = useSyncExternalStore(subscribeSlots, readSlots, readSlots);
  const subscribeLayouts = useCallback(
    (listener: () => void) => renderers.subscribe(listener),
    [renderers],
  );
  const readLayout = useCallback(
    () => renderers.get(block.type)?.layout ?? DefaultBlockLayout,
    [renderers, block.type],
  );
  const layout = useSyncExternalStore(subscribeLayouts, readLayout, readLayout);
  const childrenId = useId();
  const layoutState = useMemo(
    () => ({ node, childrenId, block, selected, entries }),
    [node, childrenId, block, selected, entries],
  );
  const childrenState = useMemo(
    () => ({ blockId, childIds: block.childIds, childrenId, collapsed: block.collapsed === true }),
    [blockId, block.childIds, childrenId, block.collapsed],
  );
  return (
    <BlockLayoutContext.Provider value={layoutState}>
      <BlockChildrenContext.Provider value={childrenState}>
        <BlockWrapper block={block}>
          <BlockView block={block} selected={selected}>
            <BlockLayoutRenderer blockId={blockId} layout={layout} />
          </BlockView>
        </BlockWrapper>
      </BlockChildrenContext.Provider>
    </BlockLayoutContext.Provider>
  );
}

/**
 * Renders one addressed node and retains the identity of its unchanged descendants.
 *
 * @param props - Identity of the node to resolve through the current adapter.
 * @param props.blockId - Stable block identity; a deleted node renders no shell.
 * @returns Its selected shell and custom layout, or null for an unavailable node.
 * @throws Propagates adapter reads and renderer errors to the surrounding React boundary.
 */
export const BlockNode = memo(function BlockNode({ blockId }: BlockRendererProps) {
  const node = useBlockNode(blockId);
  const block = node.getSnapshot();
  const selected = useBlockSelected(blockId);
  if (!block) {
    return null;
  }
  return <BlockNodeView blockId={blockId} node={node} block={block} selected={selected} />;
});
