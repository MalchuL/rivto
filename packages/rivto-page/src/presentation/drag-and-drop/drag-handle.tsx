import { type ButtonHTMLAttributes } from "react";
import { useDragHandleBinding } from "./browser/use-drag-handle-binding";
import { useDragHandleClick } from "./browser/use-drag-handle-click";
import type { DragHandleProps } from "./types";

export type { DragHandleProps } from "./types";

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
 * @param props.clickMovementThreshold - Positive excursion threshold in viewport CSS pixels; defaults to 4 and reaching it prevents pointer navigation for that press.
 * @param props.onMenu - Menu callback receiving viewport X and Y coordinates in CSS pixels.
 * @param props.bindHandle - Optional binding receiving the mounted handle's opaque identity.
 * @returns Accessible button with host artwork or the default four-dot grip.
 * @throws RangeError when clickMovementThreshold is not finite and positive.
 */
export function DragHandle({
  onOpen,
  onMenu,
  bindHandle,
  children,
  clickMovementThreshold = 4,
  ...props
}: DragHandleProps) {
  const click = useDragHandleClick(clickMovementThreshold);
  const handleRef = useDragHandleBinding(bindHandle);
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
     * @param event - Context-menu event supplying viewport coordinates and the receiving handle.
     * @returns When a menu callback exists, native propagation is stopped and the host action is invoked; otherwise the event is left unchanged.
     */
    onContextMenu: (event) => {
      if (!onMenu) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      onMenu(event.clientX, event.clientY);
    },
  };
  return (
    <button
      {...props}
      {...events}
      ref={handleRef}
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
}
