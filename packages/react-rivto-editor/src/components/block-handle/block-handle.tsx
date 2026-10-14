import { BLOCK_HANDLE_CLASS } from "./constants";
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
  type ButtonHTMLAttributes,
  type RefObject,
} from "react";
import type { EditorBlockNode } from "@chulane/rivto";
import type { BlockSlotProps } from "../../managers";
import { useReactPanel } from "../../hooks";
import { editorControlProps } from "../../constants";
import { PageDragItemContext } from "../../extensions/block-drag/state";
import { blockMenuTargets } from "../../managers/block-context-menu/targets";
import type { BlockContextMenuContext } from "../../managers/block-context-menu/types";
import { BlockContextMenu } from "./menu";

/** Application-owned navigation and optional handle artwork; no persisted icon state is introduced. */
export interface BlockHandleOptions {
  /** Navigates to this document-local block; omitted disables click navigation without disabling menus or drag. */
  readonly onOpen?: (blockId: string) => void;
  /** Receives the current detached block and collapse state; omitted or nullish output uses the default four-dot grip. */
  readonly renderIcon?: (block: EditorBlockNode, collapsed: boolean) => ReactNode;
}
/** Supplies navigation and artwork to handles within this application view. */
export const BlockHandleContext = createContext<BlockHandleOptions>({});

/**
 * One accessible control for opening, dragging, and block-local extension actions.
 * The button alone is the drag sensor activator; the row remains drag geometry.
 * Registration stays lazy, armed by pointer entry or keyboard focus. dnd-kit owns
 * drag accessibility attributes through its ref, without spreading sensor props.
 * Ancestor-dependent visibility and collapsed presentation live in block-handle.css.
 * @param props - Current block snapshot, with optional application overrides.
 * @returns The handle and, only while requested, its context menu.
 */
export function BlockHandle({ block, onOpen, renderIcon }: BlockSlotProps & BlockHandleOptions) {
  const options = useContext(BlockHandleContext);
  const reactPanel = useReactPanel();
  const { item, button, suppressClick, ref } = useBlockHandleDrag(block.id);
  const [menu, setMenu] = useState<{ context: BlockContextMenuContext; x: number; y: number }>();
  const openMenu = (x: number, y: number) => {
    setMenu({ context: blockMenuTargets(reactPanel, block.id), x, y });
  };
  const collapsed = block.listProps.collapsed === true;
  return (
    <>
      <button
        {...editorControlProps}
        ref={ref}
        type="button"
        className={BLOCK_HANDLE_CLASS}
        contentEditable={false}
        aria-label={`Open block: ${block.content || block.type}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        data-collapsed={collapsed || undefined}
        data-draggable={Boolean(item) || undefined}
        onPointerEnter={() => item?.placements.arm(block.id)}
        onFocus={() => item?.placements.arm(block.id)}
        {...handleEvents(
          suppressClick,
          () => (onOpen ?? options.onOpen)?.(block.id),
          openMenu,
          () => item?.placements.isKeyboardDragging() ?? false,
        )}
      >
        <span className="block-handle-icon" aria-hidden="true">
          {(renderIcon ?? options.renderIcon)?.(block, collapsed) ?? (
            <svg className="block-handle-grip" viewBox="0 0 16 16" fill="currentColor">
              <circle cx="5" cy="5" r="1.5" />
              <circle cx="11" cy="5" r="1.5" />
              <circle cx="5" cy="11" r="1.5" />
              <circle cx="11" cy="11" r="1.5" />
            </svg>
          )}
        </span>
      </button>
      {menu && (
        <BlockContextMenu {...menu} close={() => setMenu(undefined)} handle={button.current} />
      )}
    </>
  );
}

/** Keeps per-block drag subscriptions lazy and remembers a completed or cancelled gesture until the next press. */
function useBlockHandleDrag(blockId: string) {
  const item = useContext(PageDragItemContext);
  const button = useRef<HTMLButtonElement>(null);
  const suppressClick = useRef(false);
  const subscribe = useCallback(
    (listener: () => void) =>
      item?.placements.subscribe(blockId, () => {
        if (item.placements.isDragged(blockId)) {
          suppressClick.current = true;
        }
        listener();
      }) ?? (() => undefined),
    [blockId, item],
  );
  const snapshot = useCallback(
    () => item?.placements.getDraggable(blockId) ?? null,
    [blockId, item],
  );
  const draggable = useSyncExternalStore(subscribe, snapshot, snapshot);
  const ref = useCallback(
    (element: HTMLButtonElement | null) => {
      button.current = element;
      return draggable?.handleRef(element);
    },
    [draggable],
  );
  return { item, button, suppressClick, ref };
}

/** Separates click, context-menu, and keyboard intent without suppressing the drag sensor's pointer events. */
function handleEvents(
  suppressClick: RefObject<boolean>,
  open: () => void,
  menu: (x: number, y: number) => void,
  dragging: () => boolean,
): ButtonHTMLAttributes<HTMLButtonElement> {
  return {
    onPointerDown: () => {
      suppressClick.current = false;
    },
    onClick: (event) => {
      event.stopPropagation();
      if (!suppressClick.current) {
        open();
      }
    },
    onContextMenu: (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu(event.clientX, event.clientY);
    },
    onKeyDown: (event) => {
      if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
        event.preventDefault();
        const rect = event.currentTarget.getBoundingClientRect();
        menu(rect.left, rect.bottom);
      } else if (event.key === "Enter" && !dragging()) {
        suppressClick.current = false;
      }
    },
  };
}
