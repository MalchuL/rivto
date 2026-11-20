import type { ReactPanelApi } from "../../../../panels/types";

/** Panel operations needed by the collapse keyboard shortcuts. */
export interface CollapseKeyboardPanel {
  /** Reads selected blocks and updates their collapse state. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "hasBlock" | "getBlockNode" | "updateBlocks">;
  /** Reads the model selection and the current browser caret. */
  readonly selection: Pick<ReactPanelApi["selection"], "get" | "readDOM">;
}
