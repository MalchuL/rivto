/**
 * Public extension definition for structural block drag-and-drop.
 *
 * The optional feature depends inward on built-in navigation and clipboard
 * helpers, while the standard preset remains independent of drag behavior.
 *
 * @module
 */
import type { ReactEditorExtension } from "../../managers";
import { registerPageDrag } from "./register";
import type { PageDragExtensionOptions } from "./types";

/** Page drag configuration excluding the wrapper-owned React children slot. */
export type PageDragOptions = Omit<PageDragExtensionOptions, "children">;

/**
 * Creates structural drag-and-drop behavior for page and edgeless blocks.
 *
 * @param options - Pointer activation and page drop-zone tuning.
 * @returns Functional React editor extension installed by createReactEditor.
 */
export function pageDragExtension(options: PageDragOptions = {}): ReactEditorExtension {
  return {
    id: "drag.page",
    setup: (reactEditor) => registerPageDrag(reactEditor, options),
  };
}
