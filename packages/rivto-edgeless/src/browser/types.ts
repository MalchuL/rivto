import type {
  InputRegion,
  InputRoot,
  PointerInput,
  RegionIdentity,
  WheelInput,
} from "@chulane/rivto-root";
import type { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { Canvas } from "../core/canvas";
import type { Point, Rect } from "../types/canvas";
import type { CanvasToolPointer } from "../core/tools/canvas-tool";

/** Occurrence capabilities borrowed by the mounted canvas and its input controller. */
export type CanvasInputRoot = Pick<
  InputRoot,
  | "isAttached"
  | "getElementIdentity"
  | "captureFrameClock"
  | "captureFocusedRegion"
  | "focus"
  | "focusRegionByIdentity"
  | "observeDocumentInput"
  | "captureRegionByIdentity"
  | "captureDocument"
  | "createRectangleOverlay"
>;

/** Root borrowed or created for one canvas viewport attachment. */
export interface CanvasInputRootAttachment {
  readonly occurrence: CanvasInputRoot;
  readonly ownedRoot: BrowserInputRoot | undefined;
}

/** World geometry retained at the beginning of one control gesture. */
export interface CanvasControlGeometryOrigin {
  /** Frame in world coordinates at the start of the gesture. */
  readonly frame: Rect;
  /** Rotation in degrees at the start of the gesture. */
  readonly rotation: number;
}

/** Receives the current modifier state for canvas controls. */
export interface CanvasModifierObserver {
  /**
   * Updates modifier-dependent canvas controls.
   *
   * @param alt - Whether Alt is pressed in the current input.
   * @param shift - Whether Shift is pressed in the current input.
   * @returns Modifier-dependent control state is updated.
   * @throws Propagates failures from the receiving update.
   */
  (alt: boolean, shift: boolean): void;
}

/** Detached pointer sample in browser client coordinates. */
export interface CanvasPointerInput {
  /** Horizontal client coordinate in CSS pixels. */
  readonly clientX: number;
  /** Vertical client coordinate in CSS pixels. */
  readonly clientY: number;
  /** Identity of the pointer contact. */
  readonly pointerId: number;
  /** Browser button number associated with the input. */
  readonly button: number;
  /** Whether Shift is held. */
  readonly shiftKey: boolean;
  /** Whether Alt is held. */
  readonly altKey: boolean;
}

/** Pointer-down data and synchronous capabilities supplied by the browser adapter. */
export interface CanvasPointerDownInput extends CanvasPointerInput {
  /**
   * Captures this pointer for the current gesture.
   *
   * @returns Disposer releasing this pointer if it is still captured, or undefined
   * when its originating listener is no longer attached.
   * @throws Propagates browser capture failures.
   */
  capture(): (() => void) | undefined;
  /**
   * Requests cancellation of the browser default for this delivery.
   *
   * @returns The default is prevented when the browser event is cancelable.
   */
  preventDefault(): void;
}

/**
 * Converts detached browser input to the receiving canvas coordinates.
 *
 * @param input - Pointer coordinates and modifiers copied for this delivery.
 * @returns World coordinates, modifiers and current snapping policy, or undefined
 * when the originating viewport is no longer attached.
 */
export type CanvasPointerNormalizer = (input: CanvasPointerInput) => CanvasToolPointer | undefined;

/** Capture release retained for the pointer currently owned by a tool gesture. */
export interface CanvasPointerCapture {
  readonly id: number;
  /**
   * Releases this exact pointer capture if it is still owned.
   *
   * @returns The browser capture release has been attempted.
   * @throws Propagates browser release failures.
   */
  release(): void;
}

/** Scene operations borrowed by native input without scene disposal or source replacement. */
export type CanvasInputScene = Pick<
  Canvas,
  | "camera"
  | "selection"
  | "setCamera"
  | "zoomAt"
  | "toWorld"
  | "query"
  | "select"
  | "pin"
  | "cancelTransform"
>;

/** Mounted occurrence operations used for pointer, camera, selection, and focus input. */
export type CanvasControllerInputRoot = Pick<
  InputRoot,
  | "captureFrameClock"
  | "getElementIdentity"
  | "isAttached"
  | "captureFocusedRegion"
  | "focus"
  | "captureRegionByIdentity"
  | "createRectangleOverlay"
>;

/** Native viewport policies independent of React props or document schemas. */
export interface CanvasInputOptions {
  /** Enables ordinary element selection and marquee; false delegates admission to the host. */
  readonly interactions?: boolean;
  /**
   * Decides whether a native input can start a camera gesture.
   *
   * @param event - Normalized pointer or wheel input originating inside this viewport.
   * @returns False preserves the host's native/editor interaction.
   */
  readonly allowCamera?: (event: PointerInput | WheelInput) => boolean;
  /**
   * Reports whether primary-button panning is enabled by the host's active tool.
   *
   * @returns True makes primary drag pan even without Space.
   */
  readonly panEnabled?: () => boolean;
  /**
   * Reports camera interaction state for host styling and gesture arbitration.
   *
   * @param ready - Space or the host pan tool permits primary drag.
   * @param active - A pointer pan is in progress.
   * @returns Host state has been updated.
   */
  readonly onPanState?: (ready: boolean, active: boolean) => void;
}

/** Attachment-bound conversion without exposing browser layers. */
export interface CanvasViewportCoordinates {
  /**
   * Checks whether this exact viewport attachment remains published.
   *
   * @returns False after detachment or replacement, even on the same element.
   */
  isAttached(): boolean;
  /**
   * Checks whether the topmost target at a client point belongs to this viewport.
   *
   * @param point - Browser client coordinates in CSS pixels.
   * @param excludedSelector - Optional selector excluding a hit or its ancestors.
   * @returns False when detached, obscured, outside the viewport, or excluded.
   * @throws If the browser rejects the selector or hit testing fails.
   */
  containsClientPoint(point: Point, excludedSelector?: string): boolean;
  /**
   * Measures this attachment's world origin in client CSS pixels.
   *
   * @returns The live origin, or undefined after this attachment is withdrawn.
   * @throws Propagates browser geometry measurement failures.
   */
  getWorldOriginInClient(): Point | undefined;
  /**
   * Converts a client position using this exact attachment and the live camera.
   *
   * @param point - Client coordinates in CSS pixels.
   * @returns World coordinates, or undefined after this attachment is withdrawn.
   * @throws Propagates browser geometry measurement failures.
   */
  clientToWorld(point: Point): Point | undefined;
}

/** Browser-owned mounted layers; absent before mount and after detach. */
export interface CanvasViewportLayers {
  /** Stable opaque identity of the mounted surface element. */
  readonly rootIdentity: RegionIdentity;
  readonly root: HTMLElement;
  /** Root borrowed for this attachment; its owner controls teardown. */
  readonly inputRoot: CanvasInputRoot;
  readonly plane: HTMLElement;
  readonly coordinates: CanvasViewportCoordinates;
  /** Region containing the exact mounted viewport. */
  readonly rootRegion: Pick<InputRegion, "readBounds" | "readClientSize" | "observeSize">;
  /** Region containing this occurrence's world elements. */
  readonly worldRegion: InputRegion;
  /**
   * Requests focus on this occurrence while its attachment remains current.
   *
   * @returns Focus has been requested without scrolling when still attached.
   * @throws Propagates browser focus failures.
   */
  focus(): void;
}

/** Pending camera displacement and the scheduled continuation, when present. */
export interface CanvasWheelPan {
  target: Point;
  cancelFrame?: () => void;
}

/** Camera and pointer state captured at the start of a pan. */
export interface CanvasPanGesture {
  readonly point: Point;
  readonly x: number;
  readonly y: number;
  readonly pointer: number;
  moved: boolean;
}

/** Selection and pointer state captured at the start of a marquee. */
export interface CanvasMarqueeGesture {
  readonly point: Point;
  readonly base: readonly string[];
  readonly pointer: number;
}
