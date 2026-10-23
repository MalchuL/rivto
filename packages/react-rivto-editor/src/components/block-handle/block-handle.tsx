import { DragHandle } from "@chulane/rivto-page";
import { BLOCK_HANDLE_CLASS } from "./constants";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import type { EditorBlockNode } from "@chulane/rivto";
import type { BlockSlotProps } from "../../managers";
import { useReactPanel } from "../../hooks";
import { editorControlProps } from "../../constants";
import { PageDragContext } from "../../surfaces/page/page-drag-context";
import { blockMenuTargets } from "../../managers/block-context-menu/targets";
import type { BlockContextMenuContext } from "../../managers/block-context-menu/types";
import { BlockContextMenu } from "./menu";

/** Application-owned navigation and optional handle artwork; no persisted icon state is introduced. */
export interface BlockHandleOptions {
  /**
   * Requests host navigation when the handle is clicked without completing a drag.
   *
   * A component callback takes precedence over the context callback. When neither
   * is provided, clicking does not navigate; menus and optional dragging still work.
   *
   * @param blockId - Stable document-local ID of the clicked block.
   * @returns No value; the host decides how and where to open the block.
   */
  readonly onOpen?: (blockId: string) => void;
  /**
   * Provides host artwork for the handle without persisting icon state.
   *
   * A component renderer takes precedence over the context renderer. Omission or
   * a nullish result uses the default four-dot grip. Artwork is decorative and
   * rendered inside an aria-hidden wrapper; it must not contain interactive controls.
   *
   * @param block - Current detached block snapshot supplied by the rendered slot.
   * @param collapsed - Whether the block's collapsed list property is true.
   * @returns Decorative React content, or null/undefined to use the default grip.
   */
  readonly renderIcon?: (block: EditorBlockNode, collapsed: boolean) => ReactNode;
}
/** Supplies navigation and artwork to handles within this application view. */
export const BlockHandleContext = createContext<BlockHandleOptions>({});

/**
 * One accessible control for opening, dragging, and block-local extension actions.
 * The button alone is the drag sensor activator; the row remains drag geometry.
 * Page owns gesture activation and click suppression through the shared DragHandle.
 * The host retains navigation, artwork, menu behavior and accessibility attributes.
 * Page marks the layout-resolved hovered row; visibility, keyboard focus feedback,
 * and collapsed presentation live in block-handle.css.
 * Component callbacks override context callbacks. A completed or cancelled
 * drag suppresses the following click; context-menu events capture structural
 * targets before mounting the menu and moving focus to its actions.
 *
 * @param props - Current slot snapshot and optional application overrides.
 * @param props.block - Detached block snapshot whose ID binds interactions.
 * @param props.onOpen - Host navigation callback overriding the context value.
 * @param props.renderIcon - Decorative renderer overriding the context value.
 * @returns The handle and, only while requested, its context menu.
 * @throws If rendered outside a React editor panel context.
 */
export function BlockHandle({ block, onOpen, renderIcon }: BlockSlotProps & BlockHandleOptions) {
  const options = useContext(BlockHandleContext);
  const pageDragEnabled = useContext(PageDragContext);
  const reactPanel = useReactPanel();
  const button = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<{ context: BlockContextMenuContext; x: number; y: number }>();
  /**
   * Captures structural selection targets before mounting the menu at an anchor.
   *
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @returns No value after the captured menu state has been scheduled for rendering.
   */
  const openMenu = (x: number, y: number) => {
    setMenu({ context: blockMenuTargets(reactPanel, block.id), x, y });
  };
  const collapsed = block.listProps.collapsed === true;
  return (
    <>
      <DragHandle
        {...editorControlProps}
        ref={button}
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
      >
        {(renderIcon ?? options.renderIcon)?.(block, collapsed)}
      </DragHandle>
      {menu && (
        <BlockContextMenu {...menu} close={() => setMenu(undefined)} handle={button.current} />
      )}
    </>
  );
}
