import type Moveable from "react-moveable";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { InputRegion, InputRoot, KeyInput } from "@chulane/rivto-root";
import type { CanvasControlMarkers } from "../types/controls";
import { applyCanvasControlMarkers } from "./canvas-control-markers";

/**
 * Marks library controls and installs accessible keyboard transforms.
 *
 * @param box - Mounted library control box and its current handles.
 * @param id - Single selection identity, absent for a multiple selection.
 * @param disabled - Whether a single selection has no available transform.
 * @param getMarkers - Reads optional host interaction markers after canvas markers are installed.
 * @param getMoveable - Reads the live library controller at keyboard delivery.
 * @param root - Borrowed occurrence that owns input delivery.
 * @param isCurrent - Checks that this viewport attachment still owns the controls.
 * @returns Cleanup removing the keyboard listener and host-owned markers.
 * @throws Propagates region capture, listener setup, and cleanup failures.
 */
export function attachCanvasControlAccessibility(
  box: HTMLElement,
  id: string | undefined,
  disabled: boolean,
  getMarkers: () => CanvasControlMarkers | undefined,
  getMoveable: () => Pick<Moveable, "request"> | null,
  root: Pick<InputRoot, "captureRegionByIdentity" | "focusRegionByIdentity">,
  isCurrent: () => boolean,
): () => void {
  markCanvasControls(box, id, disabled);
  const markers = getMarkers();
  const removeMarkers = markers ? applyCanvasControlMarkers(box, markers) : undefined;
  let stop: (() => void) | undefined;
  try {
    const region = root.captureRegionByIdentity(getBrowserElementIdentity(box), isCurrent);
    stop = region?.observeInput(
      "keydown",
      "bubble",
      createControlKeyboardHandler(getMoveable, root, region),
    );
  } catch (error) {
    try {
      removeMarkers?.();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Canvas control setup failed");
    }
    throw error;
  }
  return () => releaseCanvasControlAccessibility(stop, removeMarkers);
}

/**
 * Marks Moveable's current controls as keyboard-accessible canvas handles.
 *
 * @param box - Library-owned control box containing current handles.
 * @param id - Selected element identity, or undefined for multiple elements.
 * @param disabled - Whether pointer interaction on the box is disabled.
 * @returns The box and its current handles have their accessibility markers.
 */
function markCanvasControls(box: HTMLElement, id: string | undefined, disabled: boolean): void {
  box.setAttribute("data-canvas-control", "");
  box.style.pointerEvents = disabled ? "none" : "";
  if (id) {
    box.setAttribute("data-canvas-controls-for", id);
  } else {
    box.removeAttribute("data-canvas-controls-for");
  }
  box.querySelectorAll<HTMLElement>(".moveable-control[data-direction]").forEach((handle) => {
    const direction = handle.dataset.direction!;
    handle.setAttribute("data-canvas-resize-handle", direction);
    handle.setAttribute("aria-label", `Resize ${direction}`);
    handle.setAttribute("role", "button");
    handle.tabIndex = 0;
  });
  const rotate = box.querySelector<HTMLElement>(".moveable-rotation-control");
  rotate?.setAttribute("data-canvas-rotation-handle", "true");
  rotate?.setAttribute("aria-label", "Rotate element");
  rotate?.setAttribute("role", "button");
  if (rotate) {
    rotate.tabIndex = 0;
  }
}

/**
 * Releases both listener and host markers even when either cleanup fails.
 *
 * @param stop - Optional Root listener disposer.
 * @param removeMarkers - Optional host-marker disposer.
 * @returns Both cleanup operations have been attempted.
 * @throws The cleanup failure, or AggregateError when both operations fail.
 */
function releaseCanvasControlAccessibility(
  stop: (() => void) | undefined,
  removeMarkers: (() => void) | undefined,
): void {
  let listenerError: unknown;
  let listenerFailed = false;
  try {
    stop?.();
  } catch (error) {
    listenerError = error;
    listenerFailed = true;
  }
  try {
    removeMarkers?.();
  } catch (error) {
    if (listenerFailed) {
      throw new AggregateError([listenerError, error], "Canvas control cleanup failed");
    }
    throw error;
  }
  if (listenerFailed) {
    throw listenerError;
  }
}

/**
 * Creates the arrow-key dispatcher for focused resize and rotation handles.
 *
 * @param getMoveable - Reads the live library controller for each key press.
 * @param root - Captures the focused handle within the current occurrence.
 * @param region - Control box bounded by the current viewport attachment.
 * @returns A listener applying one world unit or degree, or ten while Shift is held.
 */
function createControlKeyboardHandler(
  getMoveable: () => Pick<Moveable, "request"> | null,
  root: Pick<InputRoot, "focusRegionByIdentity">,
  region: InputRegion,
) {
  /**
   * Resizes or rotates the focused handle using arrow-key increments.
   *
   * @param event - Normalized keyboard input for the control box.
   * @returns The requested transform completes while keyboard focus stays on the handle.
   */
  const resizeWithKeyboard = (event: KeyInput<"keydown">) => {
    if (!event.key.startsWith("Arrow") || !event.target?.isElement?.()) {
      return;
    }
    const target = event.target;
    const direction = target.ancestorAttribute("*", "data-direction");
    const rotate = target.ancestorAttribute("*", "data-canvas-rotation-handle") !== undefined;
    if (!rotate && !direction) {
      return;
    }
    const hit = target.captureTargetHit();
    let identity;
    try {
      identity = hit?.getNearestAncestorIdentity("*");
    } finally {
      hit?.release();
    }
    requestKeyboardTransform(event, direction, rotate, getMoveable);
    event.preventDefault();
    event.stopPropagation();
    if (identity && region.getIdentity()) {
      root.focusRegionByIdentity(identity);
    }
  };
  return resizeWithKeyboard;
}

/**
 * Requests a one-unit or Shift-modified transform from the current Moveable.
 *
 * @param event - Arrow key and modifier values for the request.
 * @param direction - Resize handle direction, when this is a resize.
 * @param rotate - Whether the target is the rotation handle.
 * @param getMoveable - Reads the controller at the time of the request.
 * @returns The current controller receives the transform when available.
 * @throws Propagates controller lookup and transform failures.
 */
function requestKeyboardTransform(
  event: KeyInput<"keydown">,
  direction: string | undefined,
  rotate: boolean,
  getMoveable: () => Pick<Moveable, "request"> | null,
): void {
  const amount = event.shiftKey ? 10 : 1;
  const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
  const delta = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -amount : amount;
  if (rotate) {
    getMoveable()?.request("rotatable", { deltaRotate: delta }, true);
  } else if (direction) {
    const x = Number(direction.includes("e")) - Number(direction.includes("w"));
    const y = Number(direction.includes("s")) - Number(direction.includes("n"));
    getMoveable()?.request(
      "resizable",
      {
        direction: [x, y],
        deltaWidth: horizontal ? delta * x : 0,
        deltaHeight: horizontal ? 0 : delta * y,
      },
      true,
    );
  }
}
