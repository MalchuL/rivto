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
 * Registration stays lazy, armed by pointer entry or keyboard focus. dnd-kit owns
 * drag accessibility attributes through its ref, without spreading sensor props.
 * Ancestor-dependent visibility and collapsed presentation live in block-handle.css.
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
  const reactPanel = useReactPanel();
  const { item, button, suppressClick, ref } = useBlockHandleDrag(block.id);
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

/**
 * Connects a handle button to its optional per-block drag registration.
 *
 * Observes only the requested block's placement notifications. When that block
 * participates in a drag, the suppression ref stays true through completion or
 * cancellation until the event handlers reset it. The callback ref retains the
 * button and forwards attachment and cleanup to the current dnd-kit handle.
 *
 * @param blockId - Stable document-local ID whose registration is observed.
 * @returns Optional drag context, button ref, click-suppression ref, and attachment
 * callback. Without a drag provider, the hook has no active drag subscription.
 */
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

/**
 * Builds button handlers separating navigation, menus, and drag activation.
 *
 * Pointer presses reset click suppression without preventing the drag sensor's
 * events. React context-menu events prevent the native menu and open block actions
 * directly using the viewport coordinates supplied by the browser. Enter clears
 * stale suppression only when a keyboard drag is not active, leaving drag
 * completion to the sensor.
 *
 * @param suppressClick - Mutable flag set when this block participates in a drag.
 * @param open - Host navigation callback invoked by an unsuppressed click.
 * @param menu - Menu callback receiving viewport X and Y coordinates in CSS pixels.
 * @param dragging - Reads whether keyboard dragging currently owns Enter.
 * @returns Pointer-down, click, context-menu, and key-down props for the button.
 */
function handleEvents(
  suppressClick: RefObject<boolean>,
  open: () => void,
  menu: (x: number, y: number) => void,
  dragging: () => boolean,
): ButtonHTMLAttributes<HTMLButtonElement> {
  return {
    /**
     * Clears click suppression for a new pointer gesture without blocking drag activation.
     *
     * @returns No value after updating suppression or invoking the relevant callback.
     */
    onPointerDown: () => {
      suppressClick.current = false;
    },
    /**
     * Stops row click propagation and requests navigation unless the drag consumed this click.
     *
     * @param event - Button click whose propagation is stopped.
     * @returns No value after updating suppression or invoking the relevant callback.
     */
    onClick: (event) => {
      event.stopPropagation();
      if (!suppressClick.current) {
        open();
      }
    },
    /**
     * Suppresses the browser menu and opens block actions at the event coordinates.
     *
     * Browser-generated context-menu events use this handler regardless of their
     * input source; it captures targets before focus moves into the menu.
     *
     * @param event - Context-menu event supplying viewport coordinates.
     * @returns No value after updating suppression or invoking the relevant callback.
     */
    onContextMenu: (event) => {
      event.preventDefault();
      event.stopPropagation();
      menu(event.clientX, event.clientY);
    },
    /**
     * Preserves Enter ownership during keyboard dragging and clears stale click suppression.
     *
     * @param event - Keyboard event checked for the button's native Enter activation.
     * @returns No value after updating suppression or invoking the relevant callback.
     */
    onKeyDown: (event) => {
      if (event.key === "Enter" && !dragging()) {
        suppressClick.current = false;
      }
    },
  };
}
