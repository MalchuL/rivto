import type { EditorMode } from "@chulane/rivto";

/** Presentation state shared by embedded content in blocks and canvas elements. */
export interface EmbeddedContentContext {
  /** Actual surface containing this occurrence, including nested surfaces. */
  readonly mode: EditorMode;
  /** Whether the complete owning block or canvas element is selected. */
  readonly selected: boolean;
  /** Whether this is a detached creation preview without document writes. */
  readonly preview: boolean;
}

/** One rectangular hit region relative to the embedded content's viewport. */
export interface EmbeddedDragHandleRegion {
  /** Horizontal fraction of the content viewport. */
  readonly x: number;
  /** Vertical fraction of the content viewport. */
  readonly y: number;
  /** Width as a fraction of the content viewport. */
  readonly width: number;
  /** Height as a fraction of the content viewport. */
  readonly height: number;
}
