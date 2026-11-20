import type {
  CanvasInputOptions,
  CanvasInputScene,
  CanvasPointerNormalizer,
} from "../browser/types";
import type { CanvasTool } from "../core/tools/canvas-tool";
import type { CanvasEvents } from "../browser/canvas-events";
import type { CanvasViewport } from "../browser/canvas-viewport";
import type { RegionIdentity } from "@chulane/rivto-root";

/** Gesture dependencies borrowed by the React pointer adapter. */
export interface CanvasToolGestureProps {
  readonly tool?: Pick<
    CanvasTool,
    "pointerDown" | "pointerMove" | "pointerUp" | "pointerLeave" | "cancel"
  >;
  readonly normalize: CanvasPointerNormalizer;
  /** Input registration borrowed from the receiving viewport. */
  readonly events: Pick<CanvasEvents, "register"> | null;
  /** Selector identifying this tool's mounted capture layer. */
  readonly captureSelector: string;
  /**
   * Runs after the tool accepts and captures a pointer.
   *
   * @returns Host focus or other admission side effects are complete.
   */
  readonly onCapture?: () => void;
  /**
   * Connects host keyboard and deactivation policies to the captured gesture.
   *
   * @param cancel - Cancels local preview and releases capture.
   * @param isCaptured - Reads whether a pointer currently belongs to this hook.
   * @returns Cleanup releasing host listeners.
   */
  readonly subscribeCancellation: (cancel: () => boolean, isCaptured: () => boolean) => () => void;
}

/** Mounted scene and its viewport's borrowed input registrations. */
export interface CanvasInputBinding extends CanvasInputOptions {
  readonly canvas: CanvasInputScene;
  /** Identity of the currently mounted viewport, absent before mounting. */
  readonly rootIdentity: RegionIdentity | undefined;
  readonly viewport: Pick<CanvasViewport, "events">;
}
