/** Markdown-style input patterns recognized by page list shortcuts. */
import type { ListShortcutPatch } from "../types";

const LIST_SHORTCUTS: Readonly<Record<string, ListShortcutPatch>> = {
  "- ": { type: "list", checked: false },
  "[] ": { type: "checkbox", checked: false },
  "[ ] ": { type: "checkbox", checked: false },
  "[x] ": { type: "checkbox", checked: true },
  "[X] ": { type: "checkbox", checked: true },
  "1. ": { type: "start_numbered_list", checked: false },
};

/**
 * Resolves a complete typed prefix to its list patch.
 *
 * @param value - Normalized block content including the inserted space.
 * @returns Matching list patch when recognized.
 */
export function listShortcutPatch(value: string): ListShortcutPatch | undefined {
  return LIST_SHORTCUTS[value];
}
