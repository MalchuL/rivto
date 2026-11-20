import type { RegionIdentity } from "@chulane/rivto-root";
import type { DragHandleProps } from "@chulane/rivto-page";
import type { ReactNode } from "react";
import type { EditorBlockNode } from "@chulane/rivto";
import type { BlockSlotProps } from "../../managers";
import type { PanelInputRoot } from "../../panels/types";
import type { BlockContextMenuContext } from "../../managers/block-context-menu/types";

/** Captured menu invocation and its exact borrowed focus owner. */
export interface BlockHandleMenuState {
  /** Panel and structural targets captured before menu focus moves. */
  readonly context: BlockContextMenuContext;
  /** Horizontal menu anchor in viewport CSS pixels. */
  readonly x: number;
  /** Vertical menu anchor in viewport CSS pixels. */
  readonly y: number;
  /** Opaque identity of the handle that opened the menu. */
  readonly identity: RegionIdentity;
  /** Root at invocation; focus is skipped when it is no longer current. */
  readonly inputRoot: Pick<PanelInputRoot, "focusRegionByIdentity"> | undefined;
}

/** Captured invocation coordinates and focus ownership for an active block menu. */
export interface BlockContextMenuProps {
  /** Invoking panel and captured target IDs, retained while menu focus moves. */
  readonly context: BlockContextMenuContext;
  /** Horizontal anchor coordinate in viewport CSS pixels. */
  readonly x: number;
  /** Vertical anchor coordinate in viewport CSS pixels. */
  readonly y: number;
  /**
   * Requests dismissal of this menu without changing its captured targets.
   *
   * @returns No value after the owning handle has been notified.
   */
  close(): void;
  /**
   * Requests focus on the original handle when the menu closes.
   *
   * @returns Focus restoration has been attempted when its owner remains current.
   * @throws Propagates browser focus and ownership-check failures.
   */
  restoreFocus(): void;
}

/** Application-owned navigation and optional handle artwork; no persisted icon state is introduced. */
export interface BlockHandleOptions extends Pick<DragHandleProps, "clickMovementThreshold"> {
  /**
   * Requests host navigation when the handle receives an eligible pointer or keyboard click.
   *
   * A component callback takes precedence over the context callback. When neither
   * is provided, clicking does not navigate; menus and optional dragging still work.
   *
   * @param blockId - Stable document-local ID of the clicked block.
   * @returns No value; the host decides how and where to open the block.
   */
  readonly onOpen?: (blockId: string) => void;
  /**
   * Provides host artwork for the handle without persisting icon state.
   *
   * A component renderer takes precedence over the context renderer. Omission or
   * a nullish result uses the default four-dot grip. Artwork is decorative and
   * rendered inside an aria-hidden wrapper; it must not contain interactive controls.
   *
   * @param block - Current detached block snapshot supplied by the rendered slot.
   * @param collapsed - Whether the block's collapsed list property is true.
   * @returns Decorative React content, or null/undefined to use the default grip.
   */
  readonly renderIcon?: (block: EditorBlockNode, collapsed: boolean) => ReactNode;
}

/** Slot snapshot and application overrides consumed by one shared handle. */
export interface BlockHandleProps extends BlockSlotProps, BlockHandleOptions {}
