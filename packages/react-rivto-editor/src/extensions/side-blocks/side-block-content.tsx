import { BlockEditor, type BlockWrapperProps } from "@chulane/rivto-page";
import { useLayoutEffect } from "react";
import { useEditorRoot, useRootBlockIds } from "../../hooks";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import { SideBlockCard } from "./side-block-card";

/**
 * Renders the side collection using the panel's registered Page layouts.
 *
 * The panel owns the Page controller. This component borrows its attachment and
 * installs a card wrapper for this view until it unmounts.
 *
 * @returns The side block forest with the same registered layouts as the page.
 */
export function SideBlockContent() {
  const { reactPanel: panel } = useReactPanelContext();
  const { ref } = useEditorRoot();
  useLayoutEffect(
    () => panel.page.wrappers.register({ component: SideBlockPageCard, priority: 100 }),
    [panel],
  );
  return (
    <BlockEditor
      editor={panel.page}
      emptyDropParentId={panel.rootBlockId ?? null}
      ref={ref}
      data-rivto-surface="block"
      className="rivto-side-block-content"
    />
  );
}

/**
 * Wraps each side root in a card while leaving nested Page layouts intact.
 *
 * @param props - Page node and its existing composed subtree.
 * @param props.block - Node determining whether this occurrence is a side root.
 * @param props.children - Existing Page-owned block shell and descendants.
 * @returns A root card or the unchanged nested subtree.
 */
function SideBlockPageCard({ block, children }: BlockWrapperProps) {
  const roots = useRootBlockIds();
  if (!roots.includes(block.id)) {
    return children;
  }
  return (
    <SideBlockCard blockId={block.id} className="rivto-side-block-card" data-block-id={undefined}>
      {children}
    </SideBlockCard>
  );
}
