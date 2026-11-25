/**
 * Control that opens a widget's source editor.
 *
 * @module
 */
import { CodeXmlIcon, TriangleAlertIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../../../components/ui/button";
import { editorControlProps } from "../../../constants";

/** Editor-access state of an Unsafe HTML block, as shown on its edit button. */
export type UnsafeHtmlAccessState = "disabled" | "denied" | "enabled";

/** Props for {@link HtmlEditButton}. */
export interface HtmlEditButtonProps {
  /** True while the source editor is open; the button is hidden then. */
  readonly editing: boolean;
  /** Set only for Unsafe HTML blocks. `denied` shows a warning; `enabled` is announced. */
  readonly access?: UnsafeHtmlAccessState;
  /**
   * Opens the source editor.
   *
   * @returns The owner has opened the editor.
   */
  readonly onOpen: () => void;
  /**
   * Runs on pointer down, before the click; canvas elements select themselves here.
   *
   * @param event - Pointer event on the button.
   * @returns The owner has handled the event.
   */
  readonly onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * Shows the edit control at the upper right of a block or canvas element.
 *
 * Ordinary widgets reveal the button on hover or focus (see CSS). When an
 * Unsafe HTML widget asked for access it does not have, the button expands
 * into a warning explaining how to grant it.
 *
 * @param props - Editing state, optional access state and callbacks.
 * @returns The button, or nothing while editing.
 */
export function HtmlEditButton({ editing, access, onOpen, onPointerDown }: HtmlEditButtonProps) {
  if (editing) {
    return null;
  }
  const label = access ? "Edit Unsafe HTML" : "Edit HTML";
  const denied = access === "denied";
  return (
    <Button
      {...editorControlProps}
      type="button"
      variant="ghost"
      size={denied ? "sm" : "icon-xs"}
      className={denied ? "h-auto whitespace-normal" : undefined}
      aria-label={label}
      aria-description={
        access === "enabled" ? "Editor access is enabled for this HTML." : undefined
      }
      title={label}
      data-html-access={access}
      data-edgeless-ui="true"
      onPointerDown={onPointerDown}
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
    >
      {denied ? <TriangleAlertIcon aria-hidden="true" /> : <CodeXmlIcon aria-hidden="true" />}
      {denied && (
        <span role="alert">
          This HTML requested editor access. Enable it in edit mode to allow it.
        </span>
      )}
    </Button>
  );
}
