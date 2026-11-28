/**
 * The button that opens a widget's source editor.
 *
 * @module
 */
import { CodeXmlIcon, TriangleAlertIcon } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Button } from "../../../components/ui/button";
import { editorControlProps } from "../../../constants";

/**
 * Editor-access state of an Unsafe HTML block, as shown on its edit button:
 * no access, a refused access attempt, or access granted.
 */
export type UnsafeHtmlAccessState = "disabled" | "denied" | "enabled";

/** Props for {@link HtmlEditButton}. */
export interface HtmlEditButtonProps {
  /** Whether the source editor is open. The button is hidden while it is. */
  readonly editing: boolean;
  /** Access state of an Unsafe HTML block; omitted for ordinary widgets. */
  readonly access?: UnsafeHtmlAccessState;
  /**
   * Opens the source editor. Called on click.
   *
   * @returns Nothing. The owner has opened the editor.
   */
  readonly onOpen: () => void;
  /**
   * Runs on pointer down, before the click. Canvas elements use it to select themselves.
   *
   * @param event - The pointer event on the button.
   * @returns Nothing.
   */
  readonly onPointerDown?: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * Renders the edit button at the upper right of a block or canvas element.
 *
 * For ordinary widgets the stylesheet reveals the button on hover or focus.
 * For Unsafe HTML blocks it also reflects the access state:
 * - `denied`: the widget tried to use access it does not have. The button
 *   grows into a visible warning that explains how to grant access;
 * - `enabled`: screen readers are told that editor access is on.
 *
 * Clicking does not propagate, so it never also selects the block or element.
 *
 * @param props - Editing state, optional access state and callbacks.
 * @param props.editing - Whether the source editor is open.
 * @param props.access - Access state of an Unsafe HTML block, if any.
 * @param props.onOpen - Opens the source editor.
 * @param props.onPointerDown - Runs on pointer down, before the click.
 * @returns The button, or nothing while the editor is open.
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
