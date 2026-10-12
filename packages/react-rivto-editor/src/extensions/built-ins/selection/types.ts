import type { EditorPosition, Selection } from "@chulane/rivto";
import type { PanelAPI } from "../../../panels/types";
import type { DOMSelectionPoint } from "../../../managers";

/** Stable first-class element ID stored in local edgeless selection. */
export type EdgelessSelectionRef = string;

/** Detached local view of the generic editor selection. */
export interface EdgelessSelectionSnapshot {
  readonly active: boolean;
  readonly items: readonly EdgelessSelectionRef[];
}

/** Live state retained only for the duration of one pointer selection gesture. */
export interface PointerSelection {
  /** API and DOM root that own this gesture, independent of later focus changes. */
  readonly editor: PanelAPI;
  readonly root: HTMLElement;
  /** Pointer-down viewport position used to ignore accidental tiny movement. */
  readonly startX: number;
  readonly startY: number;
  /**
   * Native form of the fixed endpoint.
   *
   * Structural selection anchors have no DOM caret endpoint, so gestures that
   * start from them intentionally leave this undefined.
   */
  readonly anchor?: DOMSelectionPoint;
  /** Portable form of the fixed pointer-down endpoint. */
  readonly anchorPosition: EditorPosition;
  /** True after movement crosses into another editable block host. */
  crossBlock: boolean;
  /** Latest moving endpoint, used to restore direction after pointer-up. */
  head?: DOMSelectionPoint;
  /** Latest portable list published to SelectionManager. */
  selection?: Selection;
  /** True while the latest synthetic result selects complete blocks. */
  wholeBlocks: boolean;
}

/** Latest viewport pointer state used while selection auto-scrolls without new pointer events. */
export interface PointerSelectionCoordinates {
  /** Horizontal viewport coordinate. */
  readonly x: number;
  /** Vertical viewport coordinate. */
  readonly y: number;
  /** Whether Alt still requests partial cross-block text selection. */
  readonly altKey: boolean;
  /** Whether Shift still requests partial cross-block text selection. */
  readonly shiftKey: boolean;
}
