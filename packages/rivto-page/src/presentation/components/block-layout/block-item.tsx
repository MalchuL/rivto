import type { BlockEditorNodeSnapshot, BlockListType } from "../../../adapter/types";
import { BlockChildPlacementContext, BlockItemIdentityContext } from "./block-item-context";
import { useBlockNode } from "../../hooks/use-block-node";
import { forwardRef, useContext, type ReactNode, type HTMLAttributes } from "react";

/** Native placement styles and controls around one already-rendered child block. */
export interface BlockItemProps extends HTMLAttributes<HTMLDivElement> {
  /** Borrowed own-node snapshot for a decorator; omission observes the enclosing child placement. */
  readonly block?: BlockEditorNodeSnapshot;
  /** JSX contents arranged by the owning layout; no recursive traversal is performed here. */
  readonly children?: ReactNode;
}

/**
 * Provides optional item geometry without introducing another block identity.
 *
 * Host layouts supply widths through style; resize controls may share this wrapper.
 * The nested BlockNode remains the sole owner of its data-block-id and content.
 * A decorator supplies its existing block snapshot without adding a subscription.
 * Placement items without that snapshot observe their own node's list decoration.
 * Supplying a snapshot does not invent a document parent or canonical neighbors. Nested
 * items representing the same block retain the outer item as the sole counter owner.
 *
 * @param props - Native attributes, sizing parameters, and composed child/control JSX.
 * @param props.block - Current borrowed snapshot; omission subscribes to the child placement ID.
 * @param props.className - Additional classes appended to the package item hook.
 * @param props.children - The already-rendered child and optional host controls.
 * @param ref - Optional reference for item measurement or control positioning.
 * @returns A package-styled placement wrapper, not a second block shell.
 * @throws If neither a block snapshot nor a BlockChildren placement exists, or if
 * delegated node reads/subscriptions fail (including a placement outside BlockEditor).
 */
export const BlockItem = forwardRef<HTMLDivElement, BlockItemProps>(function BlockItem(
  { block, className, children, ...attributes },
  ref,
) {
  const placement = useContext(BlockChildPlacementContext);
  if (block) {
    return (
      <BlockItemFrame
        {...attributes}
        className={className}
        ref={ref}
        blockId={block.id}
        listType={block.listType}
      >
        {children}
      </BlockItemFrame>
    );
  }
  if (!placement) {
    throw new Error("BlockItem requires block or a BlockChildren item component");
  }
  return (
    <BlockItemContent {...attributes} className={className} ref={ref} blockId={placement.blockId}>
      {children}
    </BlockItemContent>
  );
});

/** Native item geometry bound to the child supplying its list decoration. */
interface BlockItemContentProps extends Omit<BlockItemProps, "block"> {
  readonly blockId: string;
}

/**
 * Keeps list counters on the optional outer item without creating a second block identity.
 *
 * @param props - Child identity and native placement attributes.
 * @param props.blockId - Actual child whose list type is reflected on the placement wrapper.
 * @param ref - Optional item measurement ref.
 * @returns A placement wrapper with the supplied child; only the outermost item
 * for this node owns its sibling counter.
 * @throws If outside BlockEditor or delegated node reads/subscriptions fail.
 */
const BlockItemContent = forwardRef<HTMLDivElement, BlockItemContentProps>(
  function BlockItemContent({ blockId, className, children, ...attributes }, ref) {
    const node = useBlockNode(blockId);
    const snapshot = node.getSnapshot();
    return (
      <BlockItemFrame
        {...attributes}
        className={className}
        ref={ref}
        blockId={blockId}
        listType={snapshot?.listType}
      >
        {children}
      </BlockItemFrame>
    );
  },
);

/** Identity and list decoration already supplied by a snapshot owner. */
interface BlockItemFrameProps extends BlockItemContentProps {
  readonly listType?: BlockListType;
}

/**
 * Places a supplied child and marks only its outermost item as the counter owner.
 *
 * @param props - Native attributes and captured identity/list decoration.
 * @param props.blockId - Stable ID used to distinguish nested wrappers for the same block.
 * @param props.listType - Current list decoration, or undefined for an undecorated/missing node.
 * @param props.className - Host classes appended to the package placement class.
 * @param props.children - Already-rendered node or next decorator, rendered once.
 * @param ref - Optional reference to this item's own element.
 * @returns One placement div without reading or subscribing to document data.
 */
const BlockItemFrame = forwardRef<HTMLDivElement, BlockItemFrameProps>(function BlockItemFrame(
  { blockId, listType, className, children, ...attributes },
  ref,
) {
  const outerItem = useContext(BlockItemIdentityContext);
  return (
    <BlockItemIdentityContext.Provider value={blockId}>
      <div
        {...attributes}
        ref={ref}
        data-block-in-item={outerItem === blockId || undefined}
        data-block-list-type={listType}
        className={["rivto-block-item", className].filter(Boolean).join(" ")}
      >
        {children}
      </div>
    </BlockItemIdentityContext.Provider>
  );
});
