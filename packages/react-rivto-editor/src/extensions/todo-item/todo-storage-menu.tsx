/**
 * Renders one TODO-storage toolbar menu as an in-flow disclosure panel.
 *
 * The Filter and Order menus deliberately avoid portal- and popper-based
 * primitives (Popover, Dialog, DropdownMenu). Those render their panel inside
 * a `position: fixed`, transformed wrapper, and `@dnd-kit` derives document
 * offsets from the `offsetParent` chain when a keyboard drag starts. Inside a
 * fixed wrapper that offset is wrong, so picking up a status row scrolls the
 * page away from the storage block and the sortable loses every drop target.
 * A `Collapsible` panel positioned absolutely under its trigger keeps the
 * sortable in normal document flow, which preserves keyboard sorting while
 * still looking like a dropdown.
 *
 * The menu owns its open state, closes when a pointer lands outside it or
 * Escape is pressed while it has focus, and exposes the panel as a non-modal
 * `dialog` so hosts and tests can address it by its accessible name.
 *
 * @module
 */
import { editorControlProps } from "../../constants";
import { useCallback, useEffect, useId, useState, useSyncExternalStore } from "react";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import type { TodoStorageMenuProps } from "./types";
import { Button } from "../../components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "../../components/ui/collapsible";
import {
  TODO_STORAGE_MENU_CLASS,
  TODO_STORAGE_MENU_PANEL_CLASS,
  TODO_STORAGE_MENU_TRIGGER_CLASS,
} from "./todo-item-classes";

export type { TodoStorageMenuProps } from "./types";

/**
 * Renders a trigger button with an absolutely positioned disclosure panel.
 *
 * @param props - Trigger text, panel accessible name, and panel content.
 * @param props.label - Visible label on the trigger button.
 * @param props.panelLabel - Accessible name for the opened panel.
 * @param props.children - Controls rendered inside the disclosure panel.
 * @returns A collapsible menu that stays inside the toolbar's layout flow.
 * @throws If rendered outside a React panel context.
 */
export function TodoStorageMenu({ label, panelLabel, children }: TodoStorageMenuProps) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const selector = `[id=${JSON.stringify(id)}]`;
  const { reactPanel } = useReactPanelContext();
  const subscribe = useCallback(
    (listener: () => void) => (open ? reactPanel.subscribeAvailability(listener) : () => {}),
    [open, reactPanel],
  );
  const inputRoot = useSyncExternalStore(
    subscribe,
    () => (open ? reactPanel.inputRoot : undefined),
    () => undefined,
  );

  useEffect(() => {
    if (!open || !inputRoot) {
      return;
    }
    // Capture phase runs before block selection or sibling menus handle the
    // press, so opening another menu closes this one in the same gesture.
    return inputRoot.observeWindowInput("pointerdown", "capture", (input) => {
      if (input.target && !input.target.hasAncestor(selector)) {
        setOpen(false);
      }
    });
  }, [open, inputRoot, selector]);

  useEffect(() => {
    if (!open || !inputRoot) {
      return;
    }
    return inputRoot.observeWindowInput("keydown", "bubble", (input) => {
      // dnd-kit cancels an in-flight keyboard sort with Escape and marks the
      // event handled; the menu must stay open so the rows can settle back.
      if (
        input.key !== "Escape" ||
        input.defaultPrevented ||
        !input.target?.hasAncestor(selector)
      ) {
        return;
      }
      input.preventDefault();
      setOpen(false);
    });
  }, [open, inputRoot, selector]);

  return (
    <Collapsible id={id} open={open} onOpenChange={setOpen} className={TODO_STORAGE_MENU_CLASS}>
      <CollapsibleTrigger asChild>
        <Button
          {...editorControlProps}
          variant="outline"
          size="sm"
          type="button"
          className={TODO_STORAGE_MENU_TRIGGER_CLASS}
        >
          {label}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent
        role="dialog"
        aria-label={panelLabel}
        className={TODO_STORAGE_MENU_PANEL_CLASS}
      >
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
