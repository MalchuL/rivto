import type { ReactNode } from "react";
import type { ReactPanelApi } from "../../panels/types";

/** Stable targets captured when a block context menu opens. IDs belong to the invoking panel. */
export interface BlockContextMenuContext {
  /** Guarded operations of the occurrence that opened the menu. */
  readonly reactPanel: ReactPanelApi;
  /** Clicked block, whose presence in selection determines group targeting. */
  readonly blockId: string;
  /** Explicit structural targets in document order, retained across menu focus changes. */
  readonly blockIds: readonly string[];
  /** Targets excluding descendants of another target, for subtree operations and clipboard output. */
  readonly rootIds: readonly string[];
}

/** Context for interactive extension content; close dismisses the current menu. */
export interface BlockContextMenuRenderContext extends BlockContextMenuContext {
  readonly close: () => void;
}

/** One explicitly registered action, submenu, separator, or custom control. */
export interface BlockContextMenuEntry {
  readonly id: string;
  readonly title: string;
  /** Parent submenu ID; omitted places the contribution at the top level. */
  readonly parentId?: string;
  /** Lower values appear first; equal values retain registration order. */
  readonly order?: number;
  readonly kind?: "action" | "submenu" | "separator" | "custom";
  readonly isAvailable?: (context: BlockContextMenuContext) => boolean;
  /** Undefined denotes mixed or unselected state. */
  readonly isChecked?: (context: BlockContextMenuContext) => boolean | undefined;
  /** Performs the action against captured targets; rejection propagates to host error handling. */
  readonly execute?: (context: BlockContextMenuContext) => void | Promise<void>;
  /** Mounts custom content only in the active menu; controls own their keyboard accessibility. */
  readonly render?: (context: BlockContextMenuRenderContext) => ReactNode;
}
