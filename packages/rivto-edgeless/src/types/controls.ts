import type { TransformChange, TransformKind } from "./canvas";
import type { CanvasApi } from "../core/canvas";

/** Scene and consumer behavior for canvas-owned transform controls. */
export interface CanvasTransformControlsProps {
  /** Canvas supplying current selection and geometry. */
  readonly canvas: CanvasApi;
  /** Host transform policies and callbacks. */
  readonly adapter: CanvasControlsAdapter;
}

/** Temporary geometry with the library's transform relative to the original DOM layout. */
export interface ControlPreview extends TransformChange {
  readonly transform?: string;
}

/**
 * Host interaction markers applied to the canvas-owned control box and handles.
 *
 * Attribute names must not use the reserved `data-canvas-` prefix; canvas owns
 * those markers and retains them when host markers are removed.
 */
export interface CanvasControlMarkers {
  /** Data attributes applied to the control box. */
  readonly box: Readonly<Record<`data-${string}`, string>>;
  /** Data attribute whose value is the resize direction. */
  readonly resizeHandle: `data-${string}`;
  /** Data attribute applied to the rotation handle with value `true`. */
  readonly rotationHandle: `data-${string}`;
}
/** Imperative operations exposed to a host that admits drags through its own event system. */
export interface CanvasControlHandle {
  /**
   * Mounts the concrete targets before a gesture begins.
   *
   * @param ids - Stable identities of participants, including unmounted ones.
   * @returns Targets and handles have been measured synchronously.
   */
  prepareDrag(ids: readonly string[]): void;
  /**
   * Starts an admitted gesture using the canvas-owned current browser input.
   *
   * This capability is synchronous: outside the current mouse or touch start
   * delivery, it does nothing and retains no usable input.
   *
   * @returns Pointer tracking has started when matching input is being delivered.
   */
  dragStart(): void;
  /**
   * Cancels library tracking and refreshes handles.
   *
   * @returns The library no longer tracks the gesture.
   */
  stop(): void;
}
/** Consumer policies for generic DOM transform controls. */
export interface CanvasControlsAdapter {
  /**
   * Resolves all concrete participants without depending on DOM visibility.
   *
   * @returns Selected leaf IDs, including offscreen participants.
   */
  getTargetIds(): readonly string[];
  readonly groupRotation?: number;
  /**
   * Connects imperative controls to the host event dispatcher.
   *
   * @param controls - Live transform library handle.
   * @returns Cleanup releasing that connection and pending gestures.
   */
  registerControls(controls: CanvasControlHandle): () => void;
  /**
   * Reports whether a host-admitted drag is already active.
   *
   * @returns True for an accepted move gesture.
   */
  isMoving(): boolean;
  /**
   * Captures consumer-specific transform participants.
   *
   * @param kind - Requested transformation.
   * @param stop - Stops library tracking on cancellation.
   * @returns Whether the transform may proceed.
   */
  begin(kind: TransformKind, stop: () => void): boolean;
  /**
   * Applies a temporary translation to captured participants.
   *
   * Paint target geometry before returning so the control box is measured from
   * this pointer sample rather than from the preceding preview.
   *
   * @param dx - World horizontal displacement from gesture start.
   * @param dy - World vertical displacement from gesture start.
   * @returns Preview geometry has been painted without persistence.
   */
  previewMove(dx: number, dy: number): void;
  /**
   * Applies resize or rotation preview to concrete targets.
   *
   * Paint target geometry before returning: the transform library measures the
   * updated DOM dimensions during the same event. Keep source commits separate.
   *
   * @param previews - Geometry and relative CSS transforms for participants.
   * @param rotationDelta - Group rotation delta in degrees.
   * @returns Consumer decorations and geometry reflect this sample.
   */
  previewControls(previews: readonly ControlPreview[], rotationDelta?: number): void;
  /**
   * Commits or discards the captured gesture.
   *
   * @param commit - False for cancellation.
   * @param detail - Native click count for consumer editing policies.
   * @returns Consumer state reflects the completed gesture.
   */
  finish(commit: boolean, detail?: number): void;
  /**
   * Describes host-specific interaction markers for the controls.
   *
   * Canvas applies these attributes to its own control box and handles. Canvas
   * also retains its own resize and rotation markers and accessibility labels.
   *
   * @param id - Single selected ID, absent for multiple selection.
   * @returns Data attributes to apply while this selection is active.
   */
  getControlMarkers?(id?: string): CanvasControlMarkers;
}
