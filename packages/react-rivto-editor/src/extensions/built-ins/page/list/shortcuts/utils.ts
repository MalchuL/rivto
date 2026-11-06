/** Markdown-style input patterns recognized by page list shortcuts. */
import type { ListShortcutPatch } from "../types";

const LIST_SHORTCUTS: Readonly<Record<string, ListShortcutPatch>> = {
  "- ": { type: "list", checked: false },
  "[] ": { type: "checkbox", checked: false },
  "[ ] ": { type: "checkbox", checked: false },
  "[x] ": { type: "checkbox", checked: true },
  "[X] ": { type: "checkbox", checked: true },
};

/**
 * Resolves a complete typed prefix to its list patch.
 *
 * Numbered prefixes choose whether to restart or continue a sequence; their
 * numeric value is not stored as the displayed list number. Leading zeros are
 * accepted, and the numeric value determines the mode.
 *
 * @param value - Normalized prefix from the beginning of the block, including the inserted space.
 * @returns Matching list patch when recognized; otherwise undefined.
 *
 * @example
 * listShortcutPatch("- ");   // { type: "list", checked: false }
 * listShortcutPatch("[ ] "); // { type: "checkbox", checked: false }
 * listShortcutPatch("[x] "); // { type: "checkbox", checked: true }
 * listShortcutPatch("0. ");  // { type: "start_numbered_list", checked: false }
 * listShortcutPatch("1. ");  // { type: "start_numbered_list", checked: false }
 * listShortcutPatch("2. ");  // { type: "continue_numbered_list", checked: false }
 * listShortcutPatch("text "); // undefined
 */
export function listShortcutPatch(value: string): ListShortcutPatch | undefined {
  if (/^\d+\. $/.test(value)) {
    const type = Number.parseInt(value, 10) > 1 ? "continue_numbered_list" : "start_numbered_list";
    return { type, checked: false };
  }
  return LIST_SHORTCUTS[value];
}
