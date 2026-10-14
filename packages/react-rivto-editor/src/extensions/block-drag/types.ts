import type { EditorBlock as Block } from "@chulane/rivto";
import type { ReactNode } from "react";
import type { ReactPanelApi } from "../../panels/types";
import type { CrossDocumentBlockTransferPlacement } from "../built-ins/clipboard/cross-document-block-transfer";
import type { CanonicalDropPlacement } from "./placement/types";
import type { DragStartEvent } from "@dnd-kit/react";

/** Viewport pointer coordinates for a drag gesture. */
export interface PointerCoordinates {
  readonly x: number;
  readonly y: number;
}

/** Live viewport pointer position for one drag gesture. */
export interface PointerTracker {
  /**
   * Reads the latest tracked client coordinates.
   *
   * @returns Current pointer position and modifier state.
   */
  get(): PointerCoordinates;
  /**
   * Removes the pointer tracker's event listeners.
   */
  dispose(): void;
}

/** Live destination surface operations used by a source drag provider. */
export interface CrossDocumentPageRootController {
  /** Executes placement reads and commits within the destination occurrence; its fixed model is available through getDocument without an explicit transfer model. */
  reactPanel: ReactPanelApi;
  root: HTMLElement;
  setPlacement: (placement: DropPlacement | null, empty?: boolean) => void;
  resolvePlacement: (
    x: number,
    y: number,
    sources: readonly Block[],
    sourceDocumentId: string,
  ) =>
    | (CrossDocumentBlockTransferPlacement & {
        readonly indicator: DropPlacement | null;
      })
    | null;
}

/** One visible row in the height-limited subtree preview. */
export interface PreviewEntry {
  readonly block: Block;
  readonly depth: number;
}

/** Canonical placement enriched with indicator rendering data. */
export type DropPlacement = CanonicalDropPlacement & {
  readonly indicatorId: string;
  /** Viewport line selected by the same region that owns the destination. */
  readonly line?: {
    readonly axis: "horizontal" | "vertical";
    readonly x: number;
    readonly y: number;
    readonly length: number;
  };
};

/**
 * Activator registration for one armed block handle.
 *
 * The handle button is the only sensor activator; the block row remains the
 * source geometry, so the ref must never be attached to the row itself.
 */
export interface PageDragHandle {
  readonly handleRef: (element: Element | null) => void;
}

/** Per-row external store for drag placement feedback. */
export interface DropPlacementStore {
  /**
   * Reads a block's current drop indicator.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Placement for the block, or null when none applies.
   */
  get(id: string): DropPlacement | null;
  /**
   * Observes changes affecting a block's drop state.
   *
   * @param id - Stable ID of the record or registration to access.
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(id: string, listener: () => void): () => void;
  /**
   * Checks whether a block belongs to the active drag.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns True for a dragged block.
   */
  isDragged(id: string): boolean;
  /**
   * Checks whether a block's drag handle is armed.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Whether the handle is armed.
   */
  isArmed(id: string): boolean;
  /**
   * Arms a block's drag handle.
   *
   * @param id - Stable ID of the record or registration to access.
   */
  arm(id: string): void;
  /**
   * Looks up a block's registered drag handle.
   *
   * @param id - Stable ID of the record or registration to access.
   * @returns Handle, or null when none is registered.
   */
  getDraggable(id: string): PageDragHandle | null;
  /**
   * Registers a block drag handle, or removes it when the value is null.
   *
   * @param id - Stable ID of the record or registration to access.
   * @param value - Registered drag handle, or null to unregister it.
   */
  setDraggable(id: string, value: PageDragHandle | null): void;
  /**
   * Reads whether the current drag is driven by keyboard input.
   *
   * @returns Whether keyboard dragging is active.
   */
  isKeyboardDragging(): boolean;
  /**
   * Updates whether the current drag is driven by keyboard input.
   *
   * @param active - Whether keyboard dragging is active.
   */
  setKeyboardDragging(active: boolean): void;
  /**
   * Replaces the IDs participating in the active drag.
   *
   * @param ids - Stable IDs of the elements or blocks to include.
   */
  setDragged(ids: readonly string[]): void;
  /**
   * Publishes the current drop placement, or clears it when null.
   *
   * @param placement - Current drop placement, or null to clear the indicator.
   */
  set(placement: DropPlacement | null): void;
}

/** Drag state shared with recursively rendered page blocks. */
export interface PageDragState {
  readonly placements: DropPlacementStore;
}

/** Drag state scoped to one rendered block. */
export interface PageDragItemState {
  readonly blockId: string;
  readonly placements: DropPlacementStore;
}

/** Properties for the page drag-and-drop boundary. */
export interface PageDragExtensionOptions {
  readonly children: ReactNode;
  readonly activationDistance?: number;
  readonly childDropIndent?: number;
  readonly gapDropZone?: number;
  /** Width in viewport pixels of each container's outer sibling-drop zone. Defaults to 8. */
  readonly outerEdgeDropZone?: number;
  readonly allowChildPlacement?: boolean;
}

/** Live or snapshotted dnd-kit operation state consumed by placement. */
export type PageDragOperation = DragStartEvent["operation"];
