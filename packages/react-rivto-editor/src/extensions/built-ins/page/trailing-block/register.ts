import type { EditorRuntime } from "../../../../editor-runtime";
/** Runtime registration for the trailing page insertion control. */
import { createElement } from "react";
import { TrailingBlock } from "./component";

/**
 * Mounts the configured number of page-end insertion targets.
 *
 * @param editorRuntime - Runtime receiving the mounted component.
 * @param count - Number of insertion targets to render.
 * @returns No value.
 */
export function registerTrailingBlock(editorRuntime: EditorRuntime, count: number): void {
  editorRuntime.extensions.mount(() => createElement(TrailingBlock, { count }));
}
