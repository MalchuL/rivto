import { useEffect, useRef, type RefObject } from "react";
import type { CanvasToolButtonProps, CanvasToolbarLayout } from "../types/toolbar";
import type { CanvasToolbarDismissalTools, CanvasToolbarInputAttachment } from "./types";
import { CANVAS_TOOL_ATTRIBUTE } from "./canvas-toolbar-markers";
import { useCanvasViewportLayers } from "./browser/use-canvas-viewport-layers";
import { attachCanvasToolbarDismissal } from "../browser/canvas-toolbar-input";

/**
 * Renders a native accessible tool button without an application-specific icon vocabulary.
 *
 * @param props - Label, optional icon content, pressed state and activation capability.
 * @returns A button whose icon is rendered exactly as registered.
 */
export function CanvasToolButton({
  label,
  icon,
  pressed,
  children,
  className,
  toolId,
  menuId,
  menuOpen,
  onActivate,
}: CanvasToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      aria-haspopup={menuOpen === undefined ? undefined : "dialog"}
      aria-controls={menuId}
      aria-expanded={menuOpen}
      className={className}
      data-canvas-control=""
      {...{ [CANVAS_TOOL_ATTRIBUTE]: toolId }}
      onClick={onActivate}
    >
      {icon}
      {children}
    </button>
  );
}

/**
 * Places a toolbar group dialog above the native toolbar without moving focus on open.
 *
 * @param props - Resolved toolbar contents, controlled menu and the active session.
 * @returns A toolbar with an optional non-modal group dialog.
 */
export function CanvasToolbarLayoutView({
  entries,
  content,
  menu,
  popoverId,
  setMenu,
  tools,
}: ToolbarLayoutProps) {
  const root = useRef<HTMLDivElement>(null);
  useToolbarDismissal(root, menu, setMenu, tools);

  return (
    <div
      ref={root}
      role="toolbar"
      aria-label="Canvas tools"
      data-canvas-control=""
      data-menu-open={menu ?? undefined}
      style={{ position: "relative", display: "flex", gap: 4 }}
    >
      {entries}
      {menu && (
        <div
          id={popoverId}
          role="dialog"
          aria-label={menu}
          style={{
            position: "absolute",
            bottom: "100%",
            background: "white",
            padding: 8,
            border: "1px solid #ddd",
          }}
        >
          {content}
        </div>
      )}
    </div>
  );
}

/** Native toolbar presentation and its receiving tool session. */
interface ToolbarLayoutProps extends CanvasToolbarLayout {
  readonly tools: CanvasToolbarDismissalTools;
}

/**
 * Dismisses an open toolbar menu according to keyboard and active-tool policy.
 *
 * Escape resets the active tool unless an earlier listener prevented its default.
 * Pointer input outside the toolbar closes the menu only when the active tool does
 * not retain it; input inside the toolbar leaves the menu open.
 *
 * @param root - Toolbar node used to distinguish outside pointer input.
 * @param menu - Open group identity, or null when closed.
 * @param setMenu - Publishes menu dismissal without moving focus.
 * @param tools - Session supplying fallback activation and menu retention policy.
 * @returns Normalized document listeners exist only while a menu is open.
 * @throws Propagates listener attachment, tool reset, and cleanup failures.
 */
function useToolbarDismissal(
  root: RefObject<HTMLDivElement | null>,
  menu: ToolbarLayoutProps["menu"],
  setMenu: ToolbarLayoutProps["setMenu"],
  tools: ToolbarLayoutProps["tools"],
) {
  const layers: CanvasToolbarInputAttachment | null = useCanvasViewportLayers();
  useEffect(() => {
    const element = root.current;
    if (!menu || !element) {
      return;
    }
    return attachCanvasToolbarDismissal(element, layers, setMenu, tools);
  }, [menu, setMenu, tools, layers]);
}
