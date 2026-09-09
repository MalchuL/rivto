/**
 * Shared native modal presentation for container blocks. The subtree stays mounted
 * so selection, editing and drag registrations survive expansion and collapse.
 * @module
 */
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
const DIALOG_CLASS = "rivto-kanban-dialog";
const EXPAND_CLASS = "rivto-kanban-expand";
const ExpandContext = createContext<{ expanded: boolean; label: string; toggle: () => void } | null>(null);

/**
 * Expands the existing board into the browser's modal top layer. Keeping one
 * mounted subtree preserves editable DOM, selection and drag registrations.
 * @param props - Board subtree supplied by the shared block renderer.
 * @returns Inline board, or the same board in an accessible modal dialog.
 */
export function BlockModal({ children, label }: { children: ReactNode; label: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [expanded, setExpanded] = useState(false);
  /**
   * Switches the existing dialog between inline and modal presentation.
   * @param modal - Whether the board should open in a centered overlay.
   * @returns Nothing; native dialog APIs manage focus trapping and inert content.
   */
  const expand = (modal: boolean) => {
    const element = dialog.current;
    if (!element) return;
    element.close();
    if (modal) element.showModal();
    else element.show();
    setExpanded(modal);
    element.querySelector<HTMLButtonElement>(`.${EXPAND_CLASS}`)?.focus();
  };
  return (
    <dialog ref={dialog} open className={DIALOG_CLASS} role={expanded ? "dialog" : "group"}
      aria-label={expanded ? `Expanded ${label}` : `${label} board`}
      onCancel={(event) => { event.preventDefault(); expand(false); }}>
      <ExpandContext.Provider value={{ expanded, label, toggle: () => expand(!expanded) }}>
        {children}
      </ExpandContext.Provider>
    </dialog>
  );
}

/**
 * Places the board's modal toggle in its registered right-hand block slot.
 * @returns A button using the owning board's dialog state.
 */
export function BlockModalButton() {
  const state = useContext(ExpandContext);
  if (!state) return null;
  return <button className={EXPAND_CLASS} type="button" onClick={state.toggle}
    aria-label={state.expanded ? `Collapse ${state.label}` : `Expand ${state.label}`} aria-expanded={state.expanded}>
    {state.expanded ? "↙" : "↗"}
  </button>;
}

