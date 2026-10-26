import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useDragHandleClick } from "./use-drag-handle-click";

/** Accessible handle capabilities; commands, artwork, and sensor attachment belong to the caller. */
export interface DragHandleProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "onClick" | "onPointerDown" | "onContextMenu" | "onKeyDown"
> {
  readonly children?: ReactNode;
  /** Finite positive excursion from pointer-down in viewport CSS pixels that prevents navigation, even after returning; defaults to 32. */
  readonly clickMovementThreshold?: number;
  /**
   * Requests navigation when the handle receives an eligible click without default prevention.
   *
   * @returns Host navigation has been requested; omission leaves the handle navigation-free.
   */
  readonly onOpen?: () => void;
  /**
   * Opens host actions at browser context-menu coordinates.
   *
   * @param x - Viewport X coordinate in CSS pixels.
   * @param y - Viewport Y coordinate in CSS pixels.
   * @returns Host actions have been requested; omission leaves the native menu available.
   */
  readonly onMenu?: (x: number, y: number) => void;
}

/**
 * Renders a sensor-independent button separating navigation, menus, and drag activation.
 *
 * Clicks retain ordinary browser delivery after drag completion and cancellation.
 * Pointer navigation is omitted once a press reaches clickMovementThreshold from
 * its origin, even after returning. Keyboard activation and subsequent presses
 * retain navigation; no other control's click is consumed.
 * This button opens navigation for eligible clicks that reach it without default prevention.
 * React context-menu events prevent the native menu and open block actions
 * directly using the viewport coordinates supplied by the browser. Enter and
 * Space retain native button activation through this same click handler.
 *
 * @param props - Native button attributes and host navigation/menu callbacks.
 * @param props.onOpen - Host navigation callback invoked by an eligible click without default prevention.
 * @param props.clickMovementThreshold - Positive excursion threshold in viewport CSS pixels; defaults to 32 and reaching it prevents pointer navigation for that press.
 * @param props.onMenu - Menu callback receiving viewport X and Y coordinates in CSS pixels.
 * @param ref - Optional drag sensor attachment forwarded to the button.
 * @returns Accessible button with host artwork or the default four-dot grip.
 * @throws RangeError when clickMovementThreshold is not finite and positive.
 */
export const DragHandle = forwardRef<HTMLButtonElement, DragHandleProps>(function DragHandle(
  { onOpen, onMenu, children, clickMovementThreshold = 32, ...props },
  ref,
) {
  const click = useDragHandleClick(clickMovementThreshold);
  const events: ButtonHTMLAttributes<HTMLButtonElement> = {
    onPointerDown: click.onPointerDown,
    /**
     * Stops row click propagation and requests navigation when default behavior is allowed.
     *
     * @param event - Button click whose propagation is stopped.
     * @returns Native propagation is stopped and the permitted host action is invoked.
     */
    onClick: (event) => {
      event.stopPropagation();
      if (!event.defaultPrevented && click.allowsClick(event.detail)) {
        onOpen?.();
      }
    },
    /**
     * Suppresses the browser menu and opens block actions at the event coordinates.
     *
     * Browser-generated context-menu events use this handler regardless of their
     * input source; it captures targets before focus moves into the menu.
     *
     * @param event - Context-menu event supplying viewport coordinates.
     * @returns Native propagation is stopped and the permitted host action is invoked.
     */
    onContextMenu: (event) => {
      if (!onMenu) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onMenu?.(event.clientX, event.clientY);
    },
  };
  return (
    <button
      {...props}
      {...events}
      ref={ref}
      type="button"
      contentEditable={false}
      data-block-drag-handle="true"
    >
      <span className="block-handle-icon" aria-hidden="true">
        {children ?? (
          <svg className="block-handle-grip" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="5" cy="5" r="1.5" />
            <circle cx="11" cy="5" r="1.5" />
            <circle cx="5" cy="11" r="1.5" />
            <circle cx="11" cy="11" r="1.5" />
          </svg>
        )}
      </span>
    </button>
  );
});
