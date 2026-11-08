import {
  useState,
  type HTMLAttributes,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";
import { BLOCK_EDITOR_CLASSES } from "@chulane/rivto-page";
import { BlockContextMenu } from "../../components/block-handle/menu";
import { blockMenuTargets } from "../../managers/block-context-menu/targets";
import type { BlockContextMenuContext } from "../../managers/block-context-menu/types";
import { useReactPanel } from "../../hooks";
import { BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../../constants";
import { isInPanel } from "../../panels/panel-dom";

/** Page-owned block shells, excluding block-like attributes inside rendered content. */
const BLOCK_SHELL_SELECTOR = `.${BLOCK_EDITOR_CLASSES.block}${BLOCK_ID_SELECTOR}`;

/** Card attributes and its side-block identity. */
export interface SideBlockCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Stable ID resolved within the containing side panel. */
  readonly blockId: string;
  /** Registered block content and optional card controls. */
  readonly children: ReactNode;
}

/** Captured target and screen position of the open block menu. */
interface SideBlockMenuState {
  readonly context: BlockContextMenuContext;
  readonly x: number;
  readonly y: number;
  /** Original keyboard target to restore after dismissal while it remains mounted. */
  readonly focus?: HTMLElement;
}

/**
 * Displays a side block with the shared block context menu.
 *
 * @param props - Block identity, card attributes, and children.
 * @param props.blockId - Side block targeted by the context menu.
 * @param props.children - Content displayed inside the card.
 * @returns A card that opens registered block actions on context-menu input.
 */
export function SideBlockCard({ blockId, children, ...attributes }: SideBlockCardProps) {
  const { menu, openAt, closeMenu, ownsTarget } = useSideBlockMenu(blockId);
  /**
   * Captures the side block as the target of the shared menu.
   *
   * @param event - Browser context-menu event on this card.
   * @returns Opens the menu at the pointer position.
   */
  function openMenu(event: MouseEvent<HTMLDivElement>): void {
    attributes.onContextMenu?.(event);
    if (event.defaultPrevented || !ownsTarget(event.target)) {
      return;
    }
    openAt(event, event.clientX, event.clientY);
  }
  /**
   * Opens the same menu from the standard keyboard context-menu shortcuts.
   *
   * @param event - Keyboard event originating inside this card.
   * @returns Opens the menu beside the focused element when the shortcut is available.
   */
  function openKeyboardMenu(event: KeyboardEvent<HTMLDivElement>): void {
    attributes.onKeyDown?.(event);
    if (
      event.defaultPrevented ||
      !ownsTarget(event.target) ||
      !(event.key === "ContextMenu" || (event.shiftKey && event.key === "F10"))
    ) {
      return;
    }
    const focus = event.target instanceof HTMLElement ? event.target : event.currentTarget;
    const bounds = focus.getBoundingClientRect();
    openAt(event, bounds.left, bounds.bottom, focus);
  }
  return (
    <div
      data-block-id={blockId}
      {...attributes}
      data-side-block-card
      onContextMenu={openMenu}
      onKeyDown={openKeyboardMenu}
    >
      {children}
      {menu && <BlockContextMenu {...menu} close={closeMenu} handle={null} />}
    </div>
  );
}

/**
 * Captures the current menu target and restores keyboard focus when it closes.
 *
 * @param blockId - Fallback root identity when the event has no nested block.
 * @returns Menu state, panel-bound event ownership and open/close callbacks.
 */
function useSideBlockMenu(blockId: string) {
  const panel = useReactPanel();
  const [menu, setMenu] = useState<SideBlockMenuState>();
  /**
   * Keeps events from nested editor occurrences with their own panel.
   *
   * @param target - Original browser event target.
   * @returns True when the active side-panel root owns this target.
   */
  function ownsTarget(target: EventTarget | null): boolean {
    const root = panel.getRoot();
    return Boolean(
      root && target instanceof Element && root.contains(target) && isInPanel(root, target),
    );
  }
  /**
   * Captures a local block target and menu anchor for the current panel.
   *
   * @param event - Original pointer or keyboard event, claimed before opening.
   * @param x - Horizontal viewport coordinate in CSS pixels.
   * @param y - Vertical viewport coordinate in CSS pixels.
   * @param focus - Optional keyboard target restored when the menu closes.
   * @returns Opens the shared menu for the nearest Page block shell, or the card root.
   */
  function openAt(event: SyntheticEvent, x: number, y: number, focus?: HTMLElement): void {
    event.preventDefault();
    event.stopPropagation();
    const target = event.target;
    const element = target instanceof Element ? target.closest(BLOCK_SHELL_SELECTOR) : null;
    const targetId = element?.getAttribute(BLOCK_ID_ATTRIBUTE);
    const menuBlockId = targetId && panel.blocks.hasBlock(targetId) ? targetId : blockId;
    setMenu({ context: blockMenuTargets(panel, menuBlockId), x, y, focus });
  }
  /**
   * Dismisses the menu and restores its still-mounted keyboard target.
   *
   * @returns Closes the menu and restores focus when possible.
   */
  function closeMenu(): void {
    setMenu(undefined);
    if (menu?.focus?.isConnected) {
      menu.focus.focus({ preventScroll: true });
    }
  }
  return { menu, openAt, closeMenu, ownsTarget };
}
