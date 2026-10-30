import { flushSync } from "react-dom";
import type { Canvas } from "../core/canvas";
import type { CanvasControlsAdapter, CanvasControlHandle, ControlPreview } from "../types/controls";
import type { TransformChange, TransformKind } from "../types/canvas";

/** Binds independent canvas geometry to synchronous DOM transform previews. */
export class CanvasTransformAdapter implements CanvasControlsAdapter {
  private initial: readonly TransformChange[] = [];
  private controls: CanvasControlHandle | null = null;

  /**
   * Binds a scene and its geometry hosts without installing listeners.
   *
   * @param canvas - Scene owning selection and temporary transformations.
   * @param plane - World layer containing this scene's mounted targets.
   */
  constructor(
    private readonly canvas: Pick<
      Canvas,
      | "beginTransform"
      | "canTransform"
      | "cancelTransform"
      | "commitTransform"
      | "previewTransform"
      | "select"
      | "selection"
      | "transform"
    >,
    private readonly plane: HTMLElement,
  ) {}

  /**
   * Reads the full selection independently of mounted content.
   *
   * @returns All selected concrete IDs.
   */
  getTargetIds() {
    return this.canvas.selection.get();
  }
  /**
   * Resolves selected mounted geometry hosts.
   *
   * @returns Unique targets inside this world layer.
   */
  getTargets(): HTMLElement[] {
    return [...this.plane.querySelectorAll<HTMLElement>("[data-canvas-element]")].filter((host) =>
      this.canvas.selection.get().includes(this.targetId(host)),
    );
  }
  /**
   * Reads the independent canvas identity marker.
   *
   * @param target - A registered geometry host.
   * @returns Its consumer ID.
   */
  targetId(target: HTMLElement | SVGElement) {
    return target.dataset.canvasElement!;
  }
  /**
   * Retains the live library controller until unmount.
   *
   * @param handle - Imperative library operations.
   * @returns Cleanup cancelling previews and releasing the handle.
   */
  registerControls(handle: CanvasControlHandle) {
    this.controls = handle;
    return () => {
      this.controls = null;
      this.canvas.cancelTransform();
    };
  }
  /**
   * Reads whether a move was admitted by this view.
   *
   * @returns True during a move preview.
   */
  isMoving() {
    return this.canvas.transform.get()?.kind === "move";
  }
  /**
   * Captures source geometry before a resize, rotation or move.
   *
   * The default view transforms the whole selection or rejects the gesture;
   * it never moves only the unlocked subset behind a shared selection frame.
   *
   * @param kind - Requested transform kind.
   * @returns Whether the canvas accepted any participants.
   */
  begin(kind: TransformKind) {
    if (!this.canvas.canTransform(kind)) {
      return false;
    }
    const accepted = this.canvas.beginTransform(kind);
    this.initial = this.canvas.transform.get()?.changes ?? [];
    return accepted;
  }
  /**
   * Publishes translation relative to the gesture's initial geometry.
   *
   * Paints the translated targets before Moveable measures its control box,
   * keeping content and handles on the same pointer sample. Source geometry
   * is still committed only when the gesture finishes.
   *
   * @param dx - Horizontal world displacement.
   * @param dy - Vertical world displacement.
   * @returns The temporary projection reflects this pointer sample.
   */
  previewMove(dx: number, dy: number) {
    flushSync(() =>
      this.canvas.previewTransform(
        this.initial.map((item) => ({
          ...item,
          frame: { ...item.frame, x: item.frame.x + dx, y: item.frame.y + dy },
        })),
      ),
    );
  }
  /**
   * Publishes geometry computed by the transform library.
   *
   * React paints the preview synchronously so Moveable can measure the new
   * dimensions before returning from its resize event. Source state remains
   * unchanged until the gesture finishes.
   *
   * @param previews - Participant frames and angles.
   * @returns The temporary projection has been updated.
   */
  previewControls(previews: readonly ControlPreview[]) {
    // Moveable measures the painted dimensions again before this event returns.
    flushSync(() => this.canvas.previewTransform(previews));
  }
  /**
   * Completes or cancels the source update requested by the user.
   *
   * @param commit - Whether to invoke the consumer's commit callback.
   * @returns Preview geometry is released.
   */
  finish(commit: boolean) {
    if (commit) {
      this.canvas.commitTransform();
    } else {
      this.canvas.cancelTransform();
    }
  }
  /**
   * Stops library tracking after React restores cancelled target geometry.
   *
   * @returns The control box is measured against the restored DOM.
   */
  stop(): void {
    this.controls?.stop();
  }

  /**
   * Starts a move from a selected or newly selected non-interactive target.
   *
   * @param event - Native mouse input used by the transform library.
   * @param root - Focusable viewport that owns this adapter.
   * @returns An admitted move starts tracking after selection is painted.
   */
  startDrag(event: MouseEvent, root: HTMLElement): void {
    if (
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      !(event.target instanceof Element) ||
      event.target.closest(
        "input,textarea,button,[contenteditable]:not([contenteditable=false]),[data-canvas-control]",
      )
    ) {
      return;
    }
    const host = event.target.closest<HTMLElement>("[data-canvas-element]");
    if (!host || !root.contains(host)) {
      return;
    }
    const id = host.dataset.canvasElement!;
    flushSync(() => {
      if (!this.canvas.selection.get().includes(id)) {
        this.canvas.select([id]);
      }
    });
    if (!this.begin("move")) {
      return;
    }
    root.focus({ preventScroll: true });
    this.controls?.prepareDrag(this.getTargets());
    this.controls?.dragStart(event);
  }
}
