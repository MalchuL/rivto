import { useEffect, useRef, type RefObject } from "react";
import type { CanvasToolButtonProps, CanvasToolbarLayout } from "../types/toolbar";

/**
 * Renders a native accessible tool button without an application-specific icon vocabulary.
 *
 * @param props - Label, optional icon content, pressed state and native pointer handlers.
 * @returns A button whose icon is rendered exactly as registered.
 */
export function CanvasToolButton({
  label,
  icon,
  pressed,
  children,
  ...props
}: CanvasToolButtonProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      data-canvas-control=""
      {...props}
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
  readonly tools: {
    readonly active?: { readonly keepsMenuOpen: boolean };
    /**
     * Returns to the registry-defined default tool.
     *
     * @returns Active preview is cancelled and the fallback is activated.
     */
    reset(): void;
  };
}

/**
 * Dismisses an open toolbar menu according to keyboard and active-tool policy.
 *
 * @param root - Toolbar node used to distinguish outside pointer input.
 * @param menu - Open group identity, or null when closed.
 * @param setMenu - Publishes menu dismissal without moving focus.
 * @param tools - Session supplying fallback activation and menu retention policy.
 * @returns Document listeners exist only while a menu is open.
 */
function useToolbarDismissal(
  root: RefObject<HTMLDivElement | null>,
  menu: ToolbarLayoutProps["menu"],
  setMenu: ToolbarLayoutProps["setMenu"],
  tools: ToolbarLayoutProps["tools"],
) {
  useEffect(() => {
    if (!menu) {
      return;
    }
    /**
     * Closes the menu on Escape or outside input when the active tool permits dismissal.
     *
     * @param event - Keyboard or pointer input observed outside the toolbar's local handlers.
     * @returns Dismisses only the applicable menu without moving DOM focus.
     */
    const dismiss = (event: KeyboardEvent | PointerEvent) => {
      if ("key" in event) {
        if (event.key === "Escape" && !event.defaultPrevented) {
          tools.reset();
          setMenu(null);
        }
      } else if (!root.current?.contains(event.target as Node) && !tools.active?.keepsMenuOpen) {
        setMenu(null);
      }
    };
    document.addEventListener("keydown", dismiss);
    document.addEventListener("pointerdown", dismiss);
    return () => {
      document.removeEventListener("keydown", dismiss);
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [menu, setMenu, tools]);
}
