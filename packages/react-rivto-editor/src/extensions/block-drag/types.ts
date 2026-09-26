/**
 * React and DOM contracts shared across the page drag extension.
 *
 * These contracts describe Rivto's own gesture state. The only dnd-kit-shaped
 * value is the handle ref callback exposed through {@link PageDragHandle}, so
 * block slots can activate a draggable without importing the library.
 *
 * @module
 */
import type { EditorBlock as Block } from "@chulane/rivto";
import type { ReactNode } from "react";
import type { CrossDocumentBlockTransferPlacement } from "../built-ins/clipboard/cross-document-block-transfer";
import type { ReactEditor } from "../../types";
import type { DropAxis } from "../../views/types";
import type { CanonicalDropPlacement } from "./placement/types";

export type { PageDragData, PageDropTargetData } from "./placement/types";

/** Viewport pointer coordinates for a drag gesture. */
export interface PointerCoordinates {
  readonly x: number;
  readonly y: number;
}

/** Live viewport pointer position for one drag gesture. */
export interface PointerTracker {
  get(): PointerCoordinates;
  dispose(): void;
}

/** Live destination surface operations used by a source drag provider. */
export interface CrossDocumentPageRootController {
  reactEditor: ReactEditor;
  root: HTMLElement;
  setPlacement: (placement: DropPlacement | null, empty?: boolean) => void;
  resolvePlacement: (x: number, y: number) => CrossDocumentBlockTransferPlacement & {
    readonly indicator: DropPlacement | null;
  } | null;
}

/** One measured row used by geometry-based placement. */
export interface RowGeometry {
  readonly id: string;
  readonly rect: Pick<DOMRect, "top" | "bottom" | "left" | "height">;
}

/** One visible row in the height-limited subtree preview. */
export interface PreviewEntry {
  readonly block: Block;
  readonly depth: number;
}

/** Canonical placement enriched with indicator rendering data. */
export type DropPlacement = CanonicalDropPlacement & {
  readonly indicatorId: string;
  readonly layoutAxis?: DropAxis;
  readonly childDropIndent: number;
  readonly gapEdge?: "before" | "after";
  readonly gapPointer?: PointerCoordinates;
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
  get(id: string): DropPlacement | null;
  subscribe(id: string, listener: () => void): () => void;
  isDragged(id: string): boolean;
  isArmed(id: string): boolean;
  arm(id: string): void;
  getDraggable(id: string): PageDragHandle | null;
  setDraggable(id: string, value: PageDragHandle | null): void;
  isKeyboardDragging(): boolean;
  setKeyboardDragging(active: boolean): void;
  setDragged(ids: readonly string[]): void;
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
  /** Width in viewport pixels of the sibling-drop zone at a block's outer edge. Defaults to 8. */
  readonly outerEdgeDropZone?: number;
  readonly allowChildPlacement?: boolean;
}
