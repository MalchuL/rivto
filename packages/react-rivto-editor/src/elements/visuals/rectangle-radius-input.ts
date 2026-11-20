import type { InputRegion, KeyInput, PointerInput } from "@chulane/rivto-root";
import type { RectangleRadiusInputHandlers, RectangleRadiusState } from "./types";

/** CSS class used by the visible radius handle and its pointer capture. */
export const RADIUS_HANDLE_CLASS = "edgeless-rectangle-radius";

/** Applies one render's rectangle policy to normalized radius-handle input. */
export class RectangleRadiusInput implements RectangleRadiusInputHandlers {
  /**
   * Borrows the current render state and the gesture retained across renders.
   *
   * @param state - Current radius values, draft setter, capture, and document operation.
   */
  constructor(private readonly state: RectangleRadiusState) {}

  /**
   * Applies pointer input to the captured handle's local radius draft.
   *
   * @param input - Normalized pointer delivery.
   * @param region - Handle geometry bounded by the originating Root.
   * @returns A primary gesture updates or commits its local radius.
   * @throws Propagates focus, capture, geometry, and document update failures.
   */
  onPointer(input: PointerInput, region: Pick<InputRegion, "clientToSvgPoint">): void {
    if (input.type === "pointerdown") {
      this.start(input);
      return;
    }
    if (input.type === "pointerup") {
      input.stopPropagation();
    }
    if (input.type === "pointercancel" || input.type === "lostpointercapture") {
      this.cancel();
      return;
    }
    const active = this.state.gesture.current;
    if (!active || active.pointerId !== input.pointerId) {
      return;
    }
    if (input.type === "pointermove" && this.state.draft !== null) {
      this.move(input, region);
    } else if (input.type === "pointerup") {
      this.finish();
    }
  }

  /**
   * Adjusts the radius through the focused slider's keyboard controls.
   *
   * @param input - Normalized key delivery for the radius handle.
   * @returns A recognized key cancels the gesture or commits a bounded radius.
   * @throws Propagates pointer cleanup or document update failures.
   */
  onKey(input: KeyInput): void {
    let next = Math.min(this.state.radius, this.state.maximum);
    switch (input.key) {
      case "Escape":
        this.cancel();
        break;
      case "ArrowLeft":
      case "ArrowDown":
        next -= 1;
        break;
      case "ArrowRight":
      case "ArrowUp":
        next += 1;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = this.state.maximum;
        break;
      default:
        return;
    }
    input.preventDefault();
    input.stopPropagation();
    if (input.key !== "Escape" && this.state.draft === null) {
      this.commit(next);
    }
  }

  /**
   * Cancels the radius draft and releases its original pointer capture.
   *
   * @returns No radius gesture remains active and no document update is made.
   * @throws Propagates pointer capture cleanup failures.
   */
  cancel(): void {
    const active = this.state.gesture.current;
    this.state.gesture.current = null;
    try {
      active?.releasePointer();
    } finally {
      this.state.setDraft(null);
    }
  }

  /**
   * Starts a primary pointer gesture on the owned radius handle.
   *
   * @param input - Pointer-down delivery to the handle.
   * @returns Capture and an initial radius draft are retained when available.
   * @throws Propagates focus or pointer capture failures.
   */
  private start(input: PointerInput): void {
    input.stopPropagation();
    if (input.button !== 0) {
      return;
    }
    input.focusTargetAncestor(`.${RADIUS_HANDLE_CLASS}`);
    const releasePointer = input.captureTargetPointer(`.${RADIUS_HANDLE_CLASS}`);
    if (!releasePointer) {
      return;
    }
    this.cancel();
    this.state.gesture.current = { pointerId: input.pointerId, releasePointer };
    this.state.setDraft(Math.min(this.state.saved, this.state.maximum));
  }

  /**
   * Converts pointer movement into a bounded local radius preview.
   *
   * @param input - Current pointer position in viewport pixels.
   * @param region - SVG handle region borrowed from the originating Root.
   * @returns The draft changes when the region's transform is available.
   * @throws Propagates geometry conversion failures.
   */
  private move(input: PointerInput, region: Pick<InputRegion, "clientToSvgPoint">): void {
    input.stopPropagation();
    const point = region.clientToSvgPoint({ x: input.clientX, y: input.clientY });
    if (point) {
      this.state.setDraft(
        Math.max(0, Math.min(this.state.maximum, Math.round(point.x - this.state.offset))),
      );
    }
  }

  /**
   * Ends the current pointer capture and commits a changed draft.
   *
   * @returns The draft is cleared and a changed radius is persisted.
   * @throws Propagates capture release, validation, or storage failures.
   */
  private finish(): void {
    const active = this.state.gesture.current;
    this.state.gesture.current = null;
    active?.releasePointer();
    const { draft, saved, maximum } = this.state;
    if (draft !== null && draft !== Math.min(saved, maximum)) {
      this.commit(draft);
    } else {
      this.state.setDraft(null);
    }
  }

  /**
   * Writes a changed radius through the owning panel's transactional property operation.
   *
   * @param value - Requested radius in canvas units, clamped to the visible limits.
   * @returns Clears the local draft and persists a changed radius as one undoable edit.
   * @throws If the element was deleted or property validation or storage fails.
   */
  private commit(value: number): void {
    this.state.setDraft(null);
    const cornerRadius = Math.max(0, Math.min(this.state.maximum, value));
    if (cornerRadius !== this.state.saved) {
      this.state.operations.updateProperties(this.state.elementId, { cornerRadius });
    }
  }
}
