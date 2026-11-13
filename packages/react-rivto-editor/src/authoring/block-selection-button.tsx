import { forwardRef, type ButtonHTMLAttributes } from "react";
import { BLOCK_SELECTION_ANCHOR_ATTRIBUTE, editorControlProps } from "../constants";

/** Native button attributes for an action that also permits structural selection dragging. */
export type BlockSelectionButtonProps = ButtonHTMLAttributes<HTMLButtonElement>;

/**
 * Renders an accessible native button that also starts block selection on drag.
 *
 * A selection gesture claimed by the editor must not invoke the action. Ordinary
 * keyboard activation and unclaimed pointer clicks remain native; modifier bindings
 * are interpreted by the editor rather than hardcoded by this component.
 *
 * @param props - Native button attributes and an optional action callback.
 * @param ref - Optional ref to the actual button.
 * @returns A button with the editor's control and selection markers.
 */
export const BlockSelectionButton = forwardRef<HTMLButtonElement, BlockSelectionButtonProps>(
  function BlockSelectionButton({ type = "button", onClick, ...props }, ref) {
    return (
      <button
        {...props}
        {...editorControlProps}
        {...{ [BLOCK_SELECTION_ANCHOR_ATTRIBUTE]: "" }}
        ref={ref}
        type={type}
        onClick={(event) => {
          if (!event.defaultPrevented) {
            onClick?.(event);
          }
        }}
      />
    );
  },
);
