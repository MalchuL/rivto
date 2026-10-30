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
  /**
   * Dismisses the menu containing this custom control without executing an action.
   *
   * @returns No value after the owning handle has been asked to clear its menu.
   */
  readonly close: () => void;
}

/** One explicitly registered action, submenu, separator, or custom control. */
export interface BlockContextMenuEntry {
  /** Nonempty registry-wide identity used by parent references and execution. */
  readonly id: string;
  /** Nonempty label; required for every kind, even when a custom renderer supplies its own content. */
  readonly title: string;
  /** Parent submenu ID; omitted places the contribution at the top level. */
  readonly parentId?: string;
  /** Lower values appear first; equal values retain registration order. */
  readonly order?: number;
  /** Presentation and callback requirements; omitted means action. */
  readonly kind?: "action" | "submenu" | "separator" | "custom";
  /**
   * Determines whether the entry is available for the captured menu targets.
   *
   * Evaluated while resolving or rendering entries and again before action
   * execution. Omission makes the entry available. This callback does not add a
   * subscription to application state; keep it free of mutations.
   *
   * @param context - Invoking panel and captured document-local target IDs.
   * @returns False to hide the entry and reject its execution; true to allow it.
   */
  readonly isAvailable?: (context: BlockContextMenuContext) => boolean;
  /**
   * Reads the checked presentation of an action without changing document state.
   *
   * Providing this callback renders a checkbox menu item. Undefined denotes mixed
   * or unselected state; the current renderer does not show an indeterminate mark.
   *
   * @param context - Invoking panel and captured targets used to derive the state.
   * @returns True for a checked entry, false or undefined for an unchecked entry.
   */
  readonly isChecked?: (context: BlockContextMenuContext) => boolean | undefined;
  /**
   * Performs an action against the captured targets after execution guards pass.
   *
   * The action owns its batching and asynchronous work. Rejections propagate to
   * callers and the host's asynchronous error handling; the registry does not catch
   * them or supply a transaction. Required when kind is action or omitted.
   *
   * @param context - Invoking panel and captured explicit targets and subtree roots.
   * @returns Nothing for synchronous work, or a promise representing completion.
   * @throws Any failure that should abort the action is propagated to its caller.
   */
  readonly execute?: (context: BlockContextMenuContext) => void | Promise<void>;
  /**
   * Renders extension-owned content only while its menu level is mounted.
   *
   * Required for custom entries. Controls own keyboard accessibility, validation,
   * mutation, and dismissal; they do not pass through the action execute guards.
   *
   * @param context - Captured targets, invoking panel, and owning-menu close callback.
   * @returns React content to mount in place of a standard menu item.
   */
  readonly render?: (context: BlockContextMenuRenderContext) => ReactNode;
}
