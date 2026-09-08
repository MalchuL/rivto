/**
 * Compact Blocks / Edgeless switch for product chrome.
 *
 * Must render under `EditorView` so it can read `useEditorMode`. The control
 * is icon-only and matches the app's list/linked view toggle.
 */

"use client";

import { useEditorMode } from "@chulane/rivto-react";
import type { EditorMode } from "./editor-types";

const MODE_SWITCH_CLASS = "rivto-app-editor-mode-switch";

/**
 * Draws a 16px list-of-blocks glyph.
 *
 * @returns Inline SVG for the page/blocks mode button.
 */
function BlocksIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2 3.25h12a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5Zm0 4h12a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5Zm0 4h8a.75.75 0 0 1 0 1.5H2a.75.75 0 0 1 0-1.5Z"
      />
    </svg>
  );
}

/**
 * Draws a 16px canvas/board glyph.
 *
 * @returns Inline SVG for the edgeless mode button.
 */
function EdgelessIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path
        fill="currentColor"
        d="M2.5 2.5h5v5h-5v-5Zm6 0h5v3.5h-5V2.5Zm-6 6h3.5v5H2.5v-5Zm4.5 1.5h6.5v3.5H7V10Z"
      />
    </svg>
  );
}

/**
 * Small Blocks / Edgeless segmented control.
 *
 * @returns Mode toggle that no-ops when the requested mode is already active.
 */
export function EditorModeToggle() {
  const { mode, setMode } = useEditorMode();
  /**
   * Switches presentation mode without repeating work when already current.
   *
   * @param next - Page (`block`) or canvas (`edgeless`) mode.
   * @returns No value.
   */
  const switchMode = (next: EditorMode) => {
    if (next === mode) return;
    setMode(next);
  };

  return (
    <div className={MODE_SWITCH_CLASS} role="group" aria-label="Editor mode">
      <button
        type="button"
        title="Blocks"
        aria-label="Blocks mode"
        aria-pressed={mode === "block"}
        onClick={() => switchMode("block")}
      >
        <BlocksIcon />
      </button>
      <button
        type="button"
        title="Edgeless"
        aria-label="Edgeless mode"
        aria-pressed={mode === "edgeless"}
        onClick={() => switchMode("edgeless")}
      >
        <EdgelessIcon />
      </button>
    </div>
  );
}
