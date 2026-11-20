import type { RegionIdentity } from "@chulane/rivto-root";
import { DragHandle, type DragHandleBinding } from "@chulane/rivto-page";
import { BLOCK_HANDLE_CLASS } from "./constants";
import { createContext, useCallback, useContext, useRef, useState } from "react";
import { useReactPanel } from "../../hooks";
import { editorControlProps } from "../../constants";
import { PageDragContext } from "../../surfaces/page/page-drag-context";
import { blockMenuTargets } from "../../managers/block-context-menu/targets";
import type { BlockHandleMenuState, BlockHandleOptions, BlockHandleProps } from "./types";

export type { BlockHandleOptions } from "./types";
import { restoreBlockHandleFocus } from "./block-handle-focus";
import { BlockContextMenu } from "./menu";

/** Supplies navigation and artwork to handles within this application view. */
export const BlockHandleContext = createContext<BlockHandleOptions>({});

/**
 * One accessible control for opening, dragging, and block-local extension actions.
 * The button alone is the drag sensor activator; the row remains drag geometry.
 * Page owns gesture activation; the shared DragHandle preserves native click delivery.
 * The host retains navigation, artwork, menu behavior and accessibility attributes.
 * Page marks the layout-resolved hovered row; visibility, keyboard focus feedback,
 * and collapsed presentation live in block-handle.css.
 * Component callbacks override context callbacks. Clicks after completed or
 * cancelled dragging retain ordinary browser delivery. Pointer navigation is
 * skipped after the configured excursion threshold; returning to the press
 * origin cannot restore it. A new press and keyboard activation remain eligible.
 * Context-menu events capture
 * structural targets before mounting the menu and moving focus to its actions.
 *
 * @param props - Current slot snapshot and optional application overrides.
 * @param props.block - Detached block snapshot whose ID binds interactions.
 * @param props.onOpen - Host navigation callback overriding the context value.
 * @param props.renderIcon - Decorative renderer overriding the context value.
 * @param props.clickMovementThreshold - Positive pointer excursion in viewport CSS pixels overriding context; omission uses the shared handle's 4px default.
 * @returns The handle and, only while requested, its context menu.
 * @throws If rendered outside a React editor panel context.
 */
export function BlockHandle({
  block,
  onOpen,
  renderIcon,
  clickMovementThreshold,
}: BlockHandleProps) {
  const options = useContext(BlockHandleContext);
  const pageDragEnabled = useContext(PageDragContext);
  const reactPanel = useReactPanel();
  const [menu, setMenu] = useState<BlockHandleMenuState>();
  const handleIdentity = useRef<RegionIdentity | undefined>(undefined);
  const bindHandle = useCallback<DragHandleBinding>((identity) => {
    handleIdentity.current = identity;
    return () => {
      if (handleIdentity.current === identity) {
        handleIdentity.current = undefined;
      }
    };
  }, []);
  /**
   * Captures structural selection targets before mounting the menu at an anchor.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns No value after the captured menu state has been scheduled for rendering.
   */
  const openMenu = (x: number, y: number) => {
    const identity = handleIdentity.current;
    if (!identity) {
      return;
    }
    const inputRoot = reactPanel.inputRoot;
    setMenu({
      context: blockMenuTargets(reactPanel, block.id),
      x,
      y,
      identity,
      inputRoot,
    });
  };
  const collapsed = block.listProps.collapsed === true;
  return (
    <>
      <DragHandle
        {...editorControlProps}
        bindHandle={bindHandle}
        type="button"
        className={BLOCK_HANDLE_CLASS}
        contentEditable={false}
        aria-label={`Open block: ${block.content || block.type}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        data-collapsed={collapsed || undefined}
        data-draggable={pageDragEnabled || undefined}
        aria-roledescription={pageDragEnabled ? "draggable" : undefined}
        data-block-drag-handle="true"
        onOpen={() => (onOpen ?? options.onOpen)?.(block.id)}
        onMenu={openMenu}
        clickMovementThreshold={clickMovementThreshold ?? options.clickMovementThreshold}
      >
        {(renderIcon ?? options.renderIcon)?.(block, collapsed)}
      </DragHandle>
      {menu && (
        <BlockContextMenu
          context={menu.context}
          x={menu.x}
          y={menu.y}
          close={() => setMenu(undefined)}
          restoreFocus={() => restoreBlockHandleFocus(reactPanel, menu)}
        />
      )}
    </>
  );
}
