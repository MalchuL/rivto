import type { ReactEditorExtensionApi } from "../../../../editor/types";
/** Runtime registration for the trailing page insertion control. */
import { createElement } from "react";
import { TrailingBlock } from "./component";

/**
 * Mounts the configured number of page-end insertion targets.
 *
 * @param reactEditor - Runtime receiving the mounted component.
 * @param count - Number of insertion targets to render.
 * @returns No value.
 */
export function registerTrailingBlock(reactEditor: ReactEditorExtensionApi, count: number): void {
  reactEditor.extensions.mount(() => createElement(TrailingBlock, { count }));
}
