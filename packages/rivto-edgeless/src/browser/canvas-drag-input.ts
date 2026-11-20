import { canvasViewportForElement } from "./canvas-viewport-attachment";
import type { RefObject } from "react";
import type Moveable from "react-moveable";
import type { CanvasModifierObserver } from "./types";

/** Restricts native drag starts to their synchronous browser delivery. */
export class CanvasDragInput {
  private readonly events: Array<MouseEvent | TouchEvent> = [];
  private readonly pendingReleases = new Set<number>();
  private readonly document: Document;

  /**
   * Captures input before the owning surface's event handlers run.
   *
   * @param root - Mounted canvas occurrence; nested canvases have separate input.
   * @throws If native listener installation fails; a rollback failure is retained.
   */
  constructor(private readonly root: HTMLElement) {
    this.document = root.ownerDocument;
    this.document.addEventListener("mousedown", this.captureMouse, true);
    try {
      this.document.addEventListener("touchstart", this.captureTouch, true);
    } catch (error) {
      try {
        this.document.removeEventListener("mousedown", this.captureMouse, true);
      } catch (rollbackError) {
        throw new AggregateError([error, rollbackError], "Drag input setup rollback failed");
      }
      throw error;
    }
  }

  /**
   * Forwards the current synchronous input to the mounted Moveable controller.
   *
   * Modifier changes are published first; the controller ref is read afterwards
   * because that synchronous update can replace or unmount the controller.
   *
   * @param moveable - Current library controller, borrowed without lifecycle ownership.
   * @param onModifiers - Receives Alt and Shift state before the library starts tracking.
   * @returns Modifiers are updated and the current controller starts when present;
   * no work occurs outside the input's delivery.
   * @throws Propagates modifier update and library drag-start failures.
   */
  start(
    moveable: RefObject<Pick<Moveable, "dragStart"> | null>,
    onModifiers: CanvasModifierObserver,
  ): void {
    const event = this.current();
    if (!event) {
      return;
    }
    onModifiers(event.altKey, event.shiftKey);
    moveable.current?.dragStart(event);
  }

  /**
   * Removes native listeners and releases retained input references.
   *
   * @returns This occurrence no longer captures drag input.
   * @throws AggregateError if native listener removal fails.
   */
  destroy(): void {
    const errors: unknown[] = [];
    for (const remove of [
      () => this.document.removeEventListener("mousedown", this.captureMouse, true),
      () => this.document.removeEventListener("touchstart", this.captureTouch, true),
    ]) {
      try {
        remove();
      } catch (error) {
        errors.push(error);
      }
    }
    this.events.length = 0;
    for (const timer of this.pendingReleases) {
      this.document.defaultView?.clearTimeout(timer);
    }
    this.pendingReleases.clear();
    if (errors.length) {
      throw new AggregateError(errors, "Drag input cleanup failed");
    }
  }

  /**
   * Reads the most recent input that is still being delivered for this occurrence.
   *
   * @returns The active native input, or undefined after delivery or outside this canvas.
   */
  private current(): MouseEvent | TouchEvent | undefined {
    for (let index = this.events.length - 1; index >= 0; index -= 1) {
      const event = this.events[index]!;
      if (event.eventPhase !== 0) {
        return event;
      }
    }
    return undefined;
  }

  /**
   * Captures a mouse start before surface handlers can admit it.
   *
   * @param event - Mouse input currently traversing the document.
   * @returns Matching input is available until delivery completes.
   */
  private readonly captureMouse = (event: MouseEvent): void => {
    this.capture(event);
  };

  /**
   * Captures a touch start before surface handlers can admit it.
   *
   * @param event - Touch input currently traversing the document.
   * @returns Matching input is available until delivery completes.
   */
  private readonly captureTouch = (event: TouchEvent): void => {
    this.capture(event);
  };

  /**
   * Retains input for this occurrence until the next browser task.
   *
   * Browsers can run microtasks between native listeners in the same dispatch.
   * The event phase prevents use after dispatch while the task releases references.
   *
   * @param event - Mouse or touch start currently traversing the document.
   * @returns Matching input is available during dispatch and released afterward.
   */
  private capture(event: MouseEvent | TouchEvent): void {
    const view = this.document.defaultView;
    const path = event.composedPath();
    if (!view || !path.includes(this.root)) {
      return;
    }
    const target = path.find((item) => item instanceof view.Element);
    if (
      !(target instanceof view.Element) ||
      canvasViewportForElement(target) !== canvasViewportForElement(this.root)
    ) {
      return;
    }
    this.events.push(event);
    const timer = view.setTimeout(() => {
      this.pendingReleases.delete(timer);
      const index = this.events.indexOf(event);
      if (index !== -1) {
        this.events.splice(index, 1);
      }
    });
    this.pendingReleases.add(timer);
  }
}
