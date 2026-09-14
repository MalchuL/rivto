/** Shared contracts for page outline navigation, selection, and movement. */
import type { EditorBlock as Block, Selection } from "@chulane/rivto";

/** One block's location in the visible outline. */
export interface PageBlockEntry {
  readonly block: Block;
  readonly parentId: string | null;
  readonly siblings: Block[];
}

/** Extension-owned decision that hides one block's descendants. */
export type IsCollapsedBlock = (block: Block) => boolean;

/** Roots moved by a drag or keyboard command. */
export interface SelectedMoveRoots {
  readonly ids: string[];
  readonly grouped: boolean;
  readonly selection?: Selection;
}

/** Concrete placement used by Alt+Shift+Up/Down. */
export interface KeyboardMovePlacement {
  readonly targetId: string;
  readonly position: "before" | "after";
}

/** Vertical page-navigation direction. */
export type VerticalDirection = "up" | "down";
