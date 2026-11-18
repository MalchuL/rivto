import type { ReactPanelProps } from "../types";

/** Properties accepted by the React editor boundary. */
export interface EditorPanelProps extends ReactPanelProps {
  /** Block whose children are displayed; omitted displays document roots. */
  readonly rootBlockId?: string;
}
