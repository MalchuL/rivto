/** React and DOM contracts shared across the page drag extension. */
import type { useDraggable } from "@dnd-kit/core";
import type { EditorBlock as Block } from "@chulane/rivto";
import type { ReactNode } from "react";
import type { CrossDocumentBlockTransferPlacement } from "../built-ins/clipboard/cross-document-block-transfer";
import type { ReactEditor } from "../../types";
import type { BlockDropPlacementOptions, DropAxis } from "../../views/types";
import type { CanonicalDropPlacement } from "./placement/types";

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
  editor: ReactEditor["editor"];
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

/** dnd-kit data shared by pointer and keyboard target paths. */
export interface PageDragData {
  readonly sortChildren: DropAxis | undefined;
  readonly targetDropPlacement?: BlockDropPlacementOptions;
  readonly parentDropPlacement?: BlockDropPlacementOptions;
}

/** Per-row external store for drag placement feedback. */
export interface DropPlacementStore {
  get(id: string): DropPlacement | null;
  subscribe(id: string, listener: () => void): () => void;
  isDragged(id: string): boolean;
  isArmed(id: string): boolean;
  arm(id: string): void;
  getDraggable(id: string): ReturnType<typeof useDraggable> | null;
  setDraggable(id: string, value: ReturnType<typeof useDraggable> | null): void;
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
  readonly allowChildPlacement?: boolean;
}
