import type { TransformChange, TransformKind } from "./canvas";

/** Temporary geometry with the library's transform relative to the original DOM layout. */
export interface ControlPreview extends TransformChange {
  readonly transform?: string;
}
/** Imperative operations exposed to a host that admits drags through its own event system. */
export interface CanvasControlHandle {
  /**
   * Mounts the concrete targets before a gesture begins.
   *
   * @param targets - Live geometry hosts.
   * @returns Targets and handles have been measured synchronously.
   */
  prepareDrag(targets: HTMLElement[]): void;
  /**
   * Forwards an admitted native gesture to the transform library.
   *
   * @param event - Originating mouse or touch input.
   * @returns Pointer tracking has started.
   */
  dragStart(event: MouseEvent | TouchEvent): void;
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
   * Resolves concrete DOM participants for the current selection.
   *
   * @returns Mounted unique geometry hosts.
   */
  getTargets(): HTMLElement[];
  /**
   * Reads stable identity from a consumer's geometry host.
   *
   * @param target - HTML or SVG transform target.
   * @returns Consumer element ID.
   */
  targetId(target: HTMLElement | SVGElement): string;
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
   * Adds host-specific accessibility or interaction markers to the controls.
   *
   * Canvas has already marked resize handles with `data-canvas-resize-handle`
   * containing their direction, and rotation handles with `data-canvas-rotation-handle`.
   * Consumers can decorate these markers without depending on library CSS classes.
   *
   * @param box - Library-owned control box.
   * @param id - Single selected ID, absent for multiple selection.
   * @returns Host markers have been applied.
   */
  decorateControls?(box: HTMLElement, id?: string): void;
}
