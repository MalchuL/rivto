import { useRef, useState, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import type { ImageResizeMode, ImageViewProps } from "../image-view";
import { MIN_IMAGE_SIZE } from "../../image-constants";

/** Width and height of a local image resize preview, in pixels. */
interface ImageSize {
  readonly width: number;
  readonly height: number;
}

interface ResizeStart {
  readonly maxWidth: number;
  readonly pointerId: number;
  readonly width: number;
  readonly height: number;
  readonly x: number;
  readonly y: number;
}

/** Pointer coordinates and modifier used while computing an image resize. */
interface ImageResizePointer {
  readonly clientX: number;
  readonly clientY: number;
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
  readonly frameRef: RefObject<HTMLSpanElement | null>;
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

  /**
   * Starts a pointer-captured resize from current rendered geometry.
   *
   * @param event - Pointer-down event from the shared resize handle.
   * @returns Captures the pointer and stores the initial frame bounds when available.
   */
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

  /**
   * Updates the local resize preview while preserving ratio unless Shift is held.
   *
   * @param event - Pointer movement captured by the resize handle.
   * @returns Updates the local preview for the active pointer.
   */
  const moveResize = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const start = resize.current;
    if (!start || start.pointerId !== event.pointerId) {
      return;
    }
    previewRef.current = calculateImageResize(start, event, resizeMode);
    setPreview(previewRef.current);
  };

  /**
   * Commits the completed pointer preview through the owning document record.
   *
   * @param event - Pointer completion or cancellation event.
   * @returns Commits a completed preview or clears a cancelled gesture.
   */
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
    beginResize: (start) => {
      resize.current = start;
    },
    moveResize,
    finishResize,
  };
}
