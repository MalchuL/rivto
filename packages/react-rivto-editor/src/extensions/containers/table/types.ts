import type { InputInlineStyleSession, InputRegion, InputRoot } from "@chulane/rivto-root";
import type { ReactPanelApi } from "../../../panels/types";
import type { TableResizeController } from "./table-resize-controller";

/** Addressed model reads and grouped column-width writes. */
export interface TableResizeHost {
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "getParentId" | "updateBlocks">;
  /** Current occurrence registration, absent before attachment or while disabled. */
  readonly inputRoot?: TableResizeRoot;
  /**
   * Observes occurrence availability while a gesture is active.
   *
   * @param listener - Called when the panel's current Root may have changed.
   * @returns Cleanup removing this observation.
   */
  subscribeAvailability(listener: () => void): () => void;
}

/** Root operations borrowed by a table resize gesture. */
export type TableResizeRoot = Pick<
  InputRoot,
  | "captureRegionByIdentity"
  | "findRegionsByAttribute"
  | "getElementIdentity"
  | "isConnected"
  | "observeWindowInput"
>;

/** Current source identity within its real table column. */
export interface TableColumnLocation {
  readonly tableId: string;
  readonly column: number;
  readonly width: number;
}

/** One mounted placement whose inline width belongs temporarily to this gesture. */
export interface TableWidthPreview {
  readonly id: string;
  readonly styles: InputInlineStyleSession;
  readonly modelWidth: number;
}

/** Captured column membership and resources for one pointer resize. */
export interface TableResizeGesture {
  readonly root: TableResizeRoot;
  readonly pointerId: number;
  readonly location: TableColumnLocation;
  readonly ids: readonly string[];
  readonly targets: readonly TableWidthPreview[];
  readonly startX: number;
  width: number;
  releasePointer?: () => void;
  releaseMarker?: () => void;
  releaseBlur?: () => void;
  releaseEscape?: () => void;
  releaseAvailability?: () => void;
}

/** Cleanup slots acquired while activating one pointer gesture. */
export type TableResizeResource =
  "releasePointer" | "releaseMarker" | "releaseBlur" | "releaseEscape" | "releaseAvailability";

/** Occurrence-bound visual feedback for the active separator. */
export interface TableResizeStart {
  readonly feedback: Pick<InputRegion, "setTemporaryAttribute">;
}

/** Current width and input operations for one mounted table separator. */
export interface TableResizeHandleProps {
  readonly width: number;
  readonly controller: Pick<
    TableResizeController,
    "start" | "move" | "finish" | "resizeWithKeyboard"
  >;
}
