import type { EditorPanelProps } from "../editor-panel/types";

/** Properties for displaying a protected source block together with its descendants. */
export interface EditorEmbedProps extends Omit<EditorPanelProps, "rootBlockId"> {
  /** Required source block; it can be edited but cannot be removed or moved through this embedding. */
  readonly rootBlockId: string;
}
