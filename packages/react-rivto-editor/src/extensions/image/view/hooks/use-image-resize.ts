import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ImageResizeMode, ImageViewProps } from "../image-view";
import { MIN_IMAGE_SIZE } from "../../image-constants";

/** Width and height of a local image resize preview, in pixels. */
interface ImageSize {
  /** Preview width in pixels. */
  readonly width: number;
  /** Preview height in pixels. */
  readonly height: number;
}

/** Frame dimensions and pointer position captured at the start of a gesture. */
interface ResizeStart {
  /** Available parent width in pixels. */
  readonly maxWidth: number;
  /** Pointer whose movement controls this gesture. */
  readonly pointerId: number;
  /** Initial frame width in pixels. */
  readonly width: number;
  /** Initial frame height in pixels. */
  readonly height: number;
  /** Initial horizontal viewport coordinate in pixels. */
  readonly x: number;
  /** Initial vertical viewport coordinate in pixels. */
  readonly y: number;
}

/** Pointer coordinates and modifier used while computing an image resize. */
interface ImageResizePointer {
  /** Current horizontal viewport coordinate in pixels. */
  readonly clientX: number;
  /** Current vertical viewport coordinate in pixels. */
  readonly clientY: number;
  /** Whether Shift requests free resizing. */
  readonly shiftKey: boolean;
}

/**
 * Calculates an image resize preview from its initial bounds and pointer position.
 *
 * Proportional resizing respects both the minimum image size and the available
 * parent width; Shift or stretch mode permits independent width and height.
 *
 * @param start - Initial frame bounds, pointer position, and maximum width.
 * @param event - Current pointer coordinates and Shift modifier.
 * @param resizeMode - Default proportional or free-resize behavior.
 * @returns The constrained preview dimensions in pixels.
 */
export function calculateImageResize(
  start: ResizeStart,
  event: ImageResizePointer,
  resizeMode: ImageResizeMode,
): ImageSize {
  const dx = event.clientX - start.x;
  const dy = event.clientY - start.y;
  const freeResize = resizeMode === "stretch" || event.shiftKey;
  // Keep the frame proportional after it reaches the available content width.
  const proportionalDelta =
    Math.abs(dx / start.width) >= Math.abs(dy / start.height)
      ? dx
      : (dy * start.width) / start.height;
  const desiredWidth = start.width + (freeResize ? dx : proportionalDelta);
  const minWidth = freeResize
    ? MIN_IMAGE_SIZE
    : Math.max(MIN_IMAGE_SIZE, (MIN_IMAGE_SIZE * start.width) / start.height);
  const nextWidth = Math.round(
    Math.min(Math.max(minWidth, desiredWidth), Math.max(minWidth, start.maxWidth)),
  );
  const nextHeight = freeResize
    ? Math.max(MIN_IMAGE_SIZE, Math.round(start.height + dy))
    : Math.max(MIN_IMAGE_SIZE, Math.round((nextWidth * start.height) / start.width));
  return { width: nextWidth, height: nextHeight };
}

/** Current preview and pointer operations for one image resize gesture. */
interface ImageResize {
  /** Ref to the frame whose bounds are captured on pointer-down. */
  readonly frameRef: RefObject<HTMLSpanElement | null>;
  /** Local dimensions during a gesture, or undefined when idle. */
  readonly preview: ImageSize | undefined;
  /**
   * Captures the pointer and initial image bounds.
   *
   * @param event - Pointer-down event on the resize handle.
   * @returns Starts a resize when the image frame exists.
   */
  readonly startResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /**
   * Updates the local resize preview for the captured pointer.
   *
   * @param event - Pointer movement on the resize handle.
   * @returns Publishes the current preview when a matching gesture is active.
   */
  readonly moveResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /**
   * Completes or cancels the current resize gesture.
   *
   * @param event - Pointer-up or pointer-cancel event on the resize handle.
   * @returns Commits a completed preview unless cancelled, then clears gesture state.
   */
  readonly finishResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * Maintains local image resize previews and commits completed pointer gestures.
 *
 * The preview remains local until pointer-up. Pointer cancellation discards it;
 * normal proportional resizing is constrained by the available parent width.
 *
 * @param resizeMode - Default image fit and resize behavior.
 * @param onChange - Callback that persists a completed size, when supplied.
 * @returns The frame ref, current preview, and pointer gesture callbacks.
 */
export function useImageResize(
  resizeMode: ImageResizeMode,
  onChange: ImageViewProps["onChange"],
): ImageResize {
  const frameRef = useRef<HTMLSpanElement>(null);
  const gesture = useImageResizeGesture(resizeMode, onChange);

  // Capture the pointer and current frame geometry when a resize starts.
  const startResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const bounds = frameRef.current?.getBoundingClientRect();
    if (!bounds) {
      return;
    }
    gesture.beginResize({
      maxWidth: frameRef.current?.parentElement?.getBoundingClientRect().width ?? Infinity,
      pointerId: event.pointerId,
      width: bounds.width,
      height: bounds.height,
      x: event.clientX,
      y: event.clientY,
    });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  return {
    frameRef,
    preview: gesture.preview,
    startResize,
    moveResize: gesture.moveResize,
    finishResize: gesture.finishResize,
  };
}

/** Preview state and pointer operations for an active resize gesture. */
interface ImageResizeGesture {
  /** Current gesture preview, or undefined when no resize is active. */
  readonly preview: ImageSize | undefined;
  /**
   * Captures the initial geometry for a pointer gesture.
   *
   * @param start - Initial image bounds, pointer, and available width.
   * @returns Stores the gesture until it is completed or cancelled.
   */
  readonly beginResize: (start: ResizeStart) => void;
  /**
   * Updates the preview for the pointer that started the gesture.
   *
   * @param event - Current pointer movement and modifier state.
   * @returns Publishes the constrained preview when the pointer matches.
   */
  readonly moveResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
  /**
   * Completes or cancels the active pointer gesture.
   *
   * @param event - Pointer-up or pointer-cancel event.
   * @returns Commits the preview on pointer-up and clears the local state.
   */
  readonly finishResize: (event: ReactPointerEvent<HTMLButtonElement>) => void;
}

/**
 * Tracks the preview for a single pointer and commits only completed gestures.
 *
 * @param resizeMode - Default proportional or free-resize behavior.
 * @param onChange - Callback that persists a completed size, when supplied.
 * @returns Local preview and operations for the active gesture.
 */
function useImageResizeGesture(
  resizeMode: ImageResizeMode,
  onChange: ImageViewProps["onChange"],
): ImageResizeGesture {
  const resize = useRef<ResizeStart | undefined>(undefined);
  const previewRef = useRef<ImageSize | undefined>(undefined);
  const [preview, setPreview] = useState<ImageSize>();

  // Update only the active pointer's preview using the resize mode and Shift modifier.
  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const start = resize.current;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }
    previewRef.current = calculateImageResize(start, event, resizeMode);
    setPreview(previewRef.current);
  };

  // Commit a completed preview; cancellation clears it without a document change.
  const finishResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    if (resize.current?.pointerId !== event.pointerId) {
      return;
    }
    resize.current = undefined;
    if (event.type !== "pointercancel" && previewRef.current) {
      onChange?.(previewRef.current);
    }
    previewRef.current = undefined;
    setPreview(undefined);
  };

  return {
    preview,
    // Store the captured geometry until the gesture finishes or is cancelled.
    beginResize: (start) => {
      resize.current = start;
    },
    moveResize,
    finishResize,
  };
}
