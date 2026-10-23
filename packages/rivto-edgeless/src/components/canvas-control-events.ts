import type { RefObject } from "react";
import type Moveable from "react-moveable";
import type {
  OnDragStart,
  OnDrag,
  OnDragEnd,
  OnDragGroupStart,
  OnDragGroup,
  OnDragGroupEnd,
  OnResizeStart,
  OnResize,
  OnResizeEnd,
  OnResizeGroupStart,
  OnResizeGroup,
  OnResizeGroupEnd,
  OnRotateStart,
  OnRotate,
  OnRotateGroupStart,
  OnRotateGroup,
  OnRotateGroupEnd,
  OnRotateEnd,
} from "react-moveable";
import type { Canvas } from "../core/canvas";
import type { CanvasControlsAdapter } from "../types/controls";
import type { CanvasControlGeometry } from "./canvas-control-geometry";

/** Binds library events to one render's consumer policies and captured geometry. */
export class CanvasControlEvents {
  /**
   * Binds current participants without starting a gesture or mutating the document.
   *
   * @param canvas - Scene supplying current selection.
   * @param adapter - Consumer admission, preview and completion policies.
   * @param targets - Concrete hosts measured for the current selection.
   * @param moveable - Library controller stopped on consumer cancellation.
   * @param geometry - Converter retaining the gesture origin across renders.
   * @param groupAngle - Persisted group rotation in degrees.
   */
  constructor(
    private readonly canvas: Pick<Canvas, "selection">,
    private readonly adapter: Pick<
      CanvasControlsAdapter,
      "begin" | "finish" | "isMoving" | "previewControls" | "previewMove"
    >,
    private readonly targets: HTMLElement[],
    private readonly moveable: RefObject<Moveable | null>,
    private readonly geometry: Pick<
      CanvasControlGeometry,
      "capture" | "resizePreview" | "resizeStart" | "rotatePreview" | "rotateStart"
    >,
    private readonly groupAngle: number,
  ) {}

  /**
   * Selects the library callbacks without exposing consumer dependencies as view properties.
   *
   * @returns Single-target and group event handlers bound to this render.
   */
  getBindings() {
    return {
      onDragStart: this.onDragStart,
      onDrag: this.onDrag,
      onDragEnd: this.onDragEnd,
      onDragGroupStart: this.onDragGroupStart,
      onDragGroup: this.onDragGroup,
      onDragGroupEnd: this.onDragGroupEnd,
      onResizeStart: this.onResizeStart,
      onResize: this.onResize,
      onResizeEnd: this.onResizeEnd,
      onResizeGroupStart: this.onResizeGroupStart,
      onResizeGroup: this.onResizeGroup,
      onResizeGroupEnd: this.onResizeGroupEnd,
      onRotateStart: this.onRotateStart,
      onRotate: this.onRotate,
      onRotateGroupStart: this.onRotateGroupStart,
      onRotateGroup: this.onRotateGroup,
      onRotateGroupEnd: this.onRotateGroupEnd,
      onRotateEnd: this.onRotateEnd,
    };
  }

  /**
   * Admits an edge drag or continues a host-admitted move with zero initial displacement.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onDragStart = (event: OnDragStart) => {
    if (!this.adapter.isMoving() && !this.startEdgeDrag(event.inputEvent)) {
      event.stopDrag();
      return;
    }
    event.set([0, 0]);
  };

  /**
   * Publishes the displacement from the original pointer position in world units.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onDrag = ({ beforeTranslate }: OnDrag) =>
    this.adapter.previewMove(beforeTranslate[0]!, beforeTranslate[1]!);

  /**
   * Completes a single-target move, retaining click count for consumer editing policy.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onDragEnd = ({ inputEvent }: OnDragEnd) => this.end(inputEvent);

  /**
   * Admits a group move and resets every concrete participant to zero displacement.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onDragGroupStart = (event: OnDragGroupStart) => {
    if (!this.adapter.isMoving() && !this.startEdgeDrag(event.inputEvent)) {
      event.stopDrag();
      return;
    }
    event.events.forEach((child) => child.set([0, 0]));
  };

  /**
   * Uses the first participant displacement to translate the complete consumer selection.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onDragGroup = ({ events }: OnDragGroup) => {
    const delta = events[0]?.beforeTranslate;
    if (delta) {
      this.adapter.previewMove(delta[0]!, delta[1]!);
    }
  };

  /**
   * Completes the group move or discards its preview on native cancellation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onDragGroupEnd = ({ inputEvent }: OnDragGroupEnd) => this.end(inputEvent);

  /**
   * Captures source geometry and initializes minimum dimensions for an admitted resize.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onResizeStart = (event: OnResizeStart) => {
    if (!this.start("resize")) {
      event.stopDrag();
      return;
    }
    this.geometry.resizeStart(event);
  };

  /**
   * Converts one resize sample into world geometry without changing its layout origin.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onResize = (event: OnResize) =>
    this.adapter.previewControls([this.geometry.resizePreview(event)]);

  /**
   * Completes the resize or discards its preview on native cancellation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onResizeEnd = ({ inputEvent }: OnResizeEnd) => this.end(inputEvent);

  /**
   * Captures the selection and initializes each participant of an admitted group resize.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onResizeGroupStart = (event: OnResizeGroupStart) => {
    if (!this.start("resize")) {
      event.stopDrag();
      return;
    }
    event.events.forEach(this.geometry.resizeStart);
  };

  /**
   * Converts every group resize sample before publishing one consumer preview.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onResizeGroup = ({ events }: OnResizeGroup) =>
    this.adapter.previewControls(events.map(this.geometry.resizePreview));

  /**
   * Completes the group resize or discards its preview on native cancellation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onResizeGroupEnd = ({ inputEvent }: OnResizeGroupEnd) => this.end(inputEvent);

  /**
   * Captures source geometry and initializes the admitted target rotation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onRotateStart = (event: OnRotateStart) => {
    if (!this.start("rotate")) {
      event.stopDrag();
      return;
    }
    this.geometry.rotateStart(event);
  };

  /**
   * Publishes one rotation sample using the captured frame and current library translation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onRotate = (event: OnRotate) =>
    this.adapter.previewControls([this.geometry.rotatePreview(event)]);

  /**
   * Initializes the persisted group angle and each participant before group rotation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onRotateGroupStart = (event: OnRotateGroupStart) => {
    if (!this.start("rotate")) {
      event.stopDrag();
      return;
    }
    event.set(this.groupAngle);
    event.events.forEach(this.geometry.rotateStart);
  };

  /**
   * Publishes participant geometry together with the group angular displacement in degrees.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onRotateGroup = ({ events, beforeDist }: OnRotateGroup) => {
    // Keep left/top fixed: Moveable derives child translations from the gesture
    // start. Feeding preview positions back into layout would move that origin.
    this.adapter.previewControls(events.map(this.geometry.rotatePreview), beforeDist);
  };

  /**
   * Completes the group rotation or discards its preview on native cancellation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onRotateGroupEnd = ({ inputEvent }: OnRotateGroupEnd) => this.end(inputEvent);

  /**
   * Completes the target rotation or discards its preview on native cancellation.
   *
   * @param event - Library sample for this transform phase.
   * @returns The consumer lifecycle reflects this sample without intermediate source commits.
   */
  onRotateEnd = ({ inputEvent }: OnRotateEnd) => this.end(inputEvent);
  /**
   * Captures the selected participants before a control gesture.
   *
   * @param kind - Requested whole-object transformation.
   * @returns Whether consumer policy accepted the gesture.
   */
  private start(kind: "move" | "resize" | "rotate") {
    if (!this.canvas.selection.get().length) {
      return false;
    }
    this.geometry.capture(this.targets);
    return this.adapter.begin(kind, () => {
      this.moveable.current?.stopDrag();
      // Cancellation restores DOM geometry without a document update to refresh the handles.
      this.moveable.current?.updateRect();
    });
  }
  /**
   * Completes the consumer gesture, treating pointer cancellation as discard.
   *
   * @param inputEvent - Native completion event, absent for keyboard requests.
   * @returns The adapter has committed or cancelled its preview.
   */
  private end(inputEvent: MouseEvent | undefined): void {
    this.adapter.finish(
      inputEvent?.type !== "pointercancel" && inputEvent?.type !== "touchcancel",
      inputEvent?.detail,
    );
  }

  /**
   * Admits moving from a control-box edge through consumer policy.
   *
   * @param event - Native event that started the library drag.
   * @returns Whether this is an accepted edge drag.
   */
  private startEdgeDrag(event: MouseEvent | TouchEvent | undefined) {
    const origin = event?.target;
    return (
      origin instanceof Element &&
      Boolean(origin.closest(".moveable-edgeDraggable")) &&
      this.start("move")
    );
  }
}
