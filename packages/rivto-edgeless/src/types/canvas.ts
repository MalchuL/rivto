/** Position in world coordinates unless explicitly described as viewport pixels. */
export interface Point {
  readonly x: number;
  readonly y: number;
}
/** Axis-aligned rectangle in world units. */
export interface Rect extends Point {
  readonly width: number;
  readonly height: number;
}
/** Translation in viewport pixels and positive world-to-screen scale. */
export interface Camera extends Point {
  readonly zoom: number;
}
/** Consumer-owned geometry projected into the canvas; no document content is retained. */
export interface CanvasElement {
  readonly id: string;
  readonly frame: Rect;
  /** Clockwise degrees around the frame centre. */
  readonly rotation: number;
  /** Paint order; ties preserve insertion order. */
  readonly zIndex: number;
  /** Painted outer bounds, including paths and labels; defaults to the rotated frame. */
  readonly bounds?: Rect;
  /** False retains geometry for queries without mounting a renderer. */
  readonly render?: boolean;
  /** False excludes the element from marquee queries; omitted means selectable. */
  readonly selectable?: boolean;
  /** False rejects movement; independent of resize and rotation, enabled by default. */
  readonly movable?: boolean;
  /** False rejects resizing; enabled by default. */
  readonly resizable?: boolean;
  /** False rejects rotation; enabled by default. */
  readonly rotatable?: boolean;
  /** Minimum width and height in world units used by default resize controls; defaults to [1, 1]. */
  readonly minSize?: readonly [number, number];
}
/** Geometry produced by a live gesture, never written to the consumer automatically. */
export interface TransformChange {
  readonly id: string;
  readonly frame: Rect;
  readonly rotation: number;
}
/** Supported whole-object transformations. */
export type TransformKind = "move" | "resize" | "rotate";
/** Stable gesture snapshot delivered to the consumer. */
export interface CanvasTransform {
  readonly kind: TransformKind;
  readonly changes: readonly TransformChange[];
}
/** Consumer policies and synchronous notifications for a canvas instance. */
export interface CanvasOptions {
  /** Minimum positive camera scale; defaults to 0.1. */
  readonly minZoom?: number;
  /** Maximum finite camera scale; defaults to 4 and must not be below minZoom. */
  readonly maxZoom?: number;
  /** Extra mounted area on each viewport edge, in screen pixels; defaults to 200. */
  readonly overscan?: number;
  /**
   * Receives selection requested by canvas interaction.
   *
   * @param ids - Unique selected element IDs.
   * @returns The consumer has been notified; use setSelection to project external selection.
   */
  readonly onSelectionChange?: (ids: readonly string[]) => void;
  /**
   * Receives the captured starting geometry before previews begin.
   *
   * @param gesture - Kind and initial participant geometry.
   * @returns Notification is complete.
   */
  readonly onTransformStart?: (gesture: CanvasTransform) => void;
  /**
   * Receives transient geometry for dependent decorations or custom rendering.
   *
   * @param gesture - Current uncommitted geometry.
   * @returns Notification is complete; document state should remain unchanged.
   */
  readonly onTransformPreview?: (gesture: CanvasTransform) => void;
  /**
   * Applies final geometry to the consumer's source and updates the canvas projection synchronously.
   *
   * @param gesture - Final geometry, suitable for one undo transaction.
   * @returns False rejects the change; absent updates restore the previous projection.
   * @throws Consumer failures propagate after preview cleanup.
   */
  readonly onTransformCommit?: (gesture: CanvasTransform) => void | boolean;
  /**
   * Reports cancellation without changing the source data.
   *
   * @param gesture - Discarded preview geometry.
   * @returns Consumer-specific previews have been released.
   */
  readonly onTransformCancel?: (gesture: CanvasTransform) => void;
}
