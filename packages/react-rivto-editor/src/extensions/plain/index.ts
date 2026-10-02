/** Public entry point for the plain-text editor projection. */
export {
  PLAIN_EDITOR_EXTENSION_ID,
  plainEditorExtension,
} from "./extension";
export type { PlainEditorOptions } from "./extension";
export {
  isPlainBlockVisible,
  plainIndentBlocks,
  projectPlainOutline,
} from "./projection";
export type { PlainBlockSource, PlainOutlineNode } from "./projection";
