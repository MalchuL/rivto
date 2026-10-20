import { memo, useCallback, useSyncExternalStore } from "react";
import type { BlockEditorNode, BlockRenderer, BlockRendererProps } from "../../../adapter/types";
import { useBlockNode } from "../../hooks/use-block-node";
import { useBlockRenderer } from "../../hooks/use-block-renderer";
import { useBlockSelected } from "../../hooks/use-block-selected";
import { useBlockEditorController } from "../../hooks/use-block-editor-controller";

/** Content boundary inputs, independent of the surrounding block shell. */
interface BlockContentProps extends BlockRendererProps {
  /** Stable component resolved from the live renderer registry. */
  readonly renderer: BlockRenderer;
}

/** Existing node fields and selection presentation used to build its shell. */
interface BlockNodeContentProps extends BlockRendererProps {
  /** Detached own fields and ordered direct child IDs. */
  readonly block: BlockEditorNode;
  /** Whether the shell exposes whole-block selection. */
  readonly selected: boolean;
}

/** Ordered direct siblings rendered through memoized node boundaries. */
interface BlockChildrenProps {
  /** Stable unique IDs; descendants are resolved by each node separately. */
  readonly blockIds: readonly string[];
}

/**
 * Keeps selection and shell updates from rerendering unchanged block content.
 *
 * React.memo lets React skip this boundary when blockId and the renderer component
 * identity are unchanged, even if the surrounding shell updates its selection.
 * Content still updates through its own state, context, and addressed subscriptions;
 * memo does not freeze the rendered block or prevent its data from changing.
 * The named function keeps BlockContent identifiable in DevTools and stack traces;
 * the outer constant holds the memoized component returned by React.memo.
 *
 * @param props - Persisted identity and stable content component.
 * @param props.blockId - Identity read by the renderer's addressed hooks.
 * @param props.renderer - Component resolved from the live host registry.
 * @returns The content renderer without children or structural chrome.
 */
const BlockContent = memo(function BlockContent({ blockId, renderer: Content }: BlockContentProps) {
  return <Content blockId={blockId} />;
});

/**
 * Renders one addressed node and retains the identity of its unchanged descendants.
 *
 * @param props - Identity of the node to resolve inside the current region.
 * @param props.blockId - Stable block identity; a deleted node renders no shell.
 * @returns Its selected shell, content, and recursively rendered children, or null.
 * @throws Propagates adapter reads and renderer errors to the surrounding React boundary.
 */
const BlockTreeNode = memo(function BlockTreeNode({ blockId }: BlockRendererProps) {
  const block = useBlockNode(blockId);
  const selected = useBlockSelected(blockId);
  if (!block) {
    return null;
  }
  return <BlockNodeContent blockId={blockId} block={block} selected={selected} />;
});

/**
 * Resolves a live renderer only for a node that currently exists.
 *
 * @param props - Existing node, its stable identity, and whole-block selection state.
 * @param props.blockId - Renderer identity, also used as the structural DOM marker.
 * @param props.block - Detached node whose direct children are rendered separately.
 * @param props.selected - Whether the shell exposes whole-block selection.
 * @returns The shell and children even when no content renderer is registered.
 * @throws Propagates registry and content renderer failures.
 */
function BlockNodeContent({ blockId, block, selected }: BlockNodeContentProps) {
  const Content = useBlockRenderer(block.type);
  return (
    <div data-block-id={blockId} data-block-selected={selected || undefined}>
      {Content && <BlockContent blockId={blockId} renderer={Content} />}
      <BlockChildren blockIds={block.childIds} />
    </div>
  );
}

/**
 * Traverses only a root or child list whose identity or order has changed.
 *
 * @param props - Ordered unique IDs belonging to the current adapter region.
 * @param props.blockIds - Stable list of direct siblings, excluding descendant trees.
 * @returns Keyed memoized nodes without an additional layout wrapper.
 */
const BlockChildren = memo(function BlockChildren({ blockIds }: BlockChildrenProps) {
  return blockIds.map((blockId) => <BlockTreeNode key={blockId} blockId={blockId} />);
});

/**
 * Observes root boundaries independently of individual block contents.
 *
 * @returns The current root forest, or null when its owner is missing.
 * @throws If called outside BlockEditor or region reads/subscriptions fail.
 */
export function BlockTree() {
  const { region } = useBlockEditorController().adapter;
  const subscribe = useCallback((listener: () => void) => region.subscribe(listener), [region]);
  const getSnapshot = useCallback(() => region.getSnapshot(), [region]);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  if (snapshot.status === "missing") {
    return null;
  }
  return <BlockChildren blockIds={snapshot.blockIds} />;
}
