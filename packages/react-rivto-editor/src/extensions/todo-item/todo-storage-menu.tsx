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
import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../components/ui/collapsible";
import {
  TODO_STORAGE_MENU_CLASS,
  TODO_STORAGE_MENU_PANEL_CLASS,
  TODO_STORAGE_MENU_TRIGGER_CLASS,
} from "./todo-item-classes";

/** Properties for one toolbar disclosure menu. */
export interface TodoStorageMenuProps {
  /** Visible trigger text, for example `Filter`. */
  readonly label: string;
  /** Accessible name announced for the opened panel, for example `Filters`. */
  readonly panelLabel: string;
  /** Panel content rendered only while the menu is open. */
  readonly children: ReactNode;
}

/**
 * Renders a trigger button with an absolutely positioned disclosure panel.
 *
 * @param props - Trigger text, panel accessible name, and panel content.
 * @returns A collapsible menu that stays inside the toolbar's layout flow.
 */
export function TodoStorageMenu({ label, panelLabel, children }: TodoStorageMenuProps) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const ownerDocument = root.current?.ownerDocument;
    if (!open || !ownerDocument) return;
    /** Closes the menu when a pointer press lands outside its trigger and panel. */
    const closeOutside = (event: PointerEvent): void => {
      const target = event.target as Node | null;
      if (target && !root.current?.contains(target)) setOpen(false);
    };
    // Capture phase runs before block selection or sibling menus handle the
    // press, so opening another menu closes this one in the same gesture.
    ownerDocument.addEventListener("pointerdown", closeOutside, true);
    return () => ownerDocument.removeEventListener("pointerdown", closeOutside, true);
  }, [open]);

  /**
   * Closes the menu on Escape unless a keyboard drag already consumed the key.
   *
   * @param event - Key press bubbling from the trigger or panel.
   * @returns Nothing.
   */
  const closeOnEscape = (event: KeyboardEvent<HTMLDivElement>): void => {
    // dnd-kit cancels an in-flight keyboard sort with Escape and marks the
    // event handled; the menu must stay open so the rows can settle back.
    if (event.key !== "Escape" || event.defaultPrevented) return;
    event.preventDefault();
    setOpen(false);
  };

  return (
    <Collapsible ref={root} open={open} onOpenChange={setOpen} className={TODO_STORAGE_MENU_CLASS} onKeyDown={closeOnEscape}>
      <CollapsibleTrigger asChild>
        <Button variant="outline" size="sm" type="button" className={TODO_STORAGE_MENU_TRIGGER_CLASS}>{label}</Button>
      </CollapsibleTrigger>
      <CollapsibleContent role="dialog" aria-label={panelLabel} className={TODO_STORAGE_MENU_PANEL_CLASS}>
        {children}
      </CollapsibleContent>
    </Collapsible>
  );
}
