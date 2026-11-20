import type { ReactPanelProps } from "../types";

/** Properties for displaying a protected source block together with its descendants. */
export type EditorEmbedProps = ReactPanelProps & {
  /** Required source block; it can be edited but cannot be removed or moved through this embedding. */
  readonly rootBlockId: string;
};
