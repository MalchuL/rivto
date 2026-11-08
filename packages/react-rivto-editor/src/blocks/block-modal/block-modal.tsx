/**
 * Shared shadcn dialog presentation for container blocks. An expanded board uses
 * its own panel while both presentations edit the same persisted document.
 *
 * The dialog owns an EditorEmbed and page surface, so selection, keyboard input
 * and drag registrations belong to that occurrence instead of its parent panel.
 * Radix owns outside dismissal, Escape, focus trapping and scroll locking. The
 * toggle button uses the shared shadcn `Button` primitive. Structural rules for
 * the inline wrapper and expanded content live in the colocated `block-modal.css`.
 * @module
 */
import { editorControlProps } from "../../constants";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { Maximize2Icon, Minimize2Icon } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "../../components/ui/dialog";
import { EditorEmbed } from "../../components/editor-embed/editor-embed";
import { PageSurface } from "../../surfaces/page/page-surface";
import { useReactPanel } from "../../hooks/editor/use-react-panel";
const DIALOG_CLASS = "rivto-block-modal";
const EXPAND_CLASS = "rivto-block-modal-expand";
const ExpandContext = createContext<{
  blockId: string;
  expanded: boolean;
  label: string;
  toggle: () => void;
} | null>(null);

/**
 * Opens a protected subtree panel for the board in a shadcn dialog.
 *
 * The expanded panel borrows the same editor and document, with independent
 * selection, focus and event routing. Closing destroys only that panel's bindings;
 * edits and document history remain available in the original panel. The root
 * wrapper inside the expanded panel reuses this modal's collapse control.
 *
 * @param props - Board identity, label and original panel's rendered subtree.
 * @param props.blockId - Persisted root shown and protected by the modal panel.
 * @param props.children - Board content displayed in the original panel when closed.
 * @param props.label - Board name used in accessible dialog and toggle labels.
 * @returns Inline board or its independent subtree panel inside the dialog.
 * @throws If rendered outside an editor panel or embed context.
 */
export function BlockModal({
  blockId,
  children,
  label,
}: {
  blockId: string;
  children: ReactNode;
  label: string;
}) {
  const inline = useRef<HTMLDivElement>(null);
  const parent = useContext(ExpandContext);
  const panel = useReactPanel();
  const [expanded, setExpanded] = useState(false);
  if (parent?.expanded && parent.blockId === blockId) {
    return children;
  }
  return (
    <ExpandContext.Provider
      value={{ blockId, expanded, label, toggle: () => setExpanded(!expanded) }}
    >
      <Dialog open={expanded} onOpenChange={setExpanded}>
        <div ref={inline} className={DIALOG_CLASS} role="group" aria-label={`${label} board`}>
          {!expanded && children}
        </div>
        {expanded && (
          <DialogContent
            className="rivto-block-modal-content"
            showCloseButton={false}
            aria-describedby={undefined}
            aria-modal="true"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              inline.current?.querySelector<HTMLButtonElement>(`.${EXPAND_CLASS}`)?.focus();
            }}
          >
            <DialogTitle className="sr-only">Expanded {label}</DialogTitle>
            <EditorEmbed editor={panel.editor} rootBlockId={blockId}>
              <PageSurface />
            </EditorEmbed>
          </DialogContent>
        )}
      </Dialog>
    </ExpandContext.Provider>
  );
}

/**
 * Places the board's modal toggle in its registered right-hand block slot.
 * @returns A button using the owning board's dialog state.
 */
export function BlockModalButton() {
  const state = useContext(ExpandContext);
  if (!state) {
    return null;
  }
  return (
    <Button
      {...editorControlProps}
      variant="outline"
      size="icon-sm"
      className={`${EXPAND_CLASS} ml-2`}
      type="button"
      onClick={state.toggle}
      aria-label={state.expanded ? `Collapse ${state.label}` : `Expand ${state.label}`}
      aria-expanded={state.expanded}
    >
      {state.expanded ? <Minimize2Icon /> : <Maximize2Icon />}
    </Button>
  );
}
