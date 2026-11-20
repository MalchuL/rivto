import type { CanvasViewportApi, CanvasViewportCoordinates } from "@chulane/rivto-edgeless/react";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import type { EdgelessTool } from "../../../../managers/edgeless-tools/edgeless-tool";
import type { ReactPanelApi } from "../../../../panels/types";
import type { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import type { VisualFrame } from "../../../../elements/visuals/types";
import type { CreateElementInput } from "../../../../managers/elements/types";
import type { CanvasPointerInput } from "@chulane/rivto-edgeless/browser";
import type { Point } from "@chulane/rivto-edgeless";
import type { ReactNode } from "react";
import type { SnapGuide } from "../../../../elements/visuals/utils/geometry";
import type { FrameClock, InputRoot } from "@chulane/rivto-root";

/** Live snapping policy borrowed by visual tools. */
export interface ToolViewport {
  /** Scene state needed to read current snapping settings. */
  readonly canvas: Pick<CanvasViewportApi["canvas"], "snapping">;
}

/** Snapping and input registrations used by a visual tool gesture. */
export interface ToolGestureViewport extends ToolViewport {
  /** Normalized pointer registrations borrowed from the mounted viewport. */
  readonly events: Pick<CanvasViewportApi["events"], "register">;
}

/** Panel operations borrowed by the tool gesture's cancellation policy. */
export interface ToolGesturePanel {
  /** Registers the Escape cancellation binding. */
  readonly keyboard: Pick<ReactPanelApi["keyboard"], "register">;
  /**
   * Cancels the gesture when this occurrence becomes inactive.
   *
   * @param listener - Callback invoked on panel deactivation.
   * @returns Disposer removing this subscription.
   */
  readonly subscribeDeactivation: ReactPanelApi["subscribeDeactivation"];
}

/** Cancellation capabilities borrowed from the surface tool context. */
export interface ToolGestureTools {
  /** Panel owning the current surface gesture. */
  readonly reactPanel: ToolGesturePanel;
}

/** Subscription operations borrowed by the toolbar placement gesture. */
export interface PresetDragSubscriptions {
  readonly reactPanel: ToolGesturePanel;
  readonly subscribe: EdgelessToolContext["subscribe"];
}

/** Surface-owned tool and viewport inputs for pointer normalization. */
export interface ToolGestureOptions {
  /** Surface cancellation capabilities. */
  readonly tools: ToolGestureTools;
  /** Active tool, absent when no tool is selected. */
  readonly tool?: EdgelessTool;
  /** Canvas snapping policy, or null before the viewport provider is available. */
  readonly viewport: ToolGestureViewport | null;
  /** Conversion bound to the current mounted attachment. */
  readonly coordinates: Pick<CanvasViewportCoordinates, "clientToWorld"> | null;
  /** Current world-to-screen scale. */
  readonly zoom: number;
}

/** Dependencies for the toolbar's detached placement preview. */
export interface PresetDragOptions {
  readonly tools: EdgelessToolContext;
  readonly viewport: PresetViewport | null;
  readonly coordinates: CanvasViewportCoordinates | null;
  /** Current panel input attachment supplying its window's frame clock. */
  readonly inputRoot:
    Pick<InputRoot, "isAttached" | "getElementIdentity" | "captureFrameClock"> | undefined;
  /** Identity of the rendered surface that owns the gesture. */
  readonly rootIdentity: object | undefined;
  readonly zoom: number;
}

/** Live geometry and input dependencies for a preset gesture. */
export type PresetDragEnvironment = Pick<
  PresetDragOptions,
  "viewport" | "coordinates" | "inputRoot" | "rootIdentity" | "zoom"
>;

/** Tool-session operations used by the preset gesture controller. */
export type PresetDragToolSession = Pick<EdgelessToolContext, "active" | "activate">;

/** Detached placement prepared by the active creation tool. */
export type PresetPlacement = ReturnType<EdgelessCreationTool["preparePlacement"]>;

/**
 * Replaces the detached preview shown by the receiving surface.
 *
 * @param preview - Current preview, or null to clear it.
 * @returns The surface has been notified of the new preview.
 */
export type SetPresetDragPreview = (preview: PresetDragPreview | null) => void;

/**
 * Replaces the snapping guides shown by the receiving surface.
 *
 * @param guides - Detached guide snapshot; an empty list clears feedback.
 * @returns The surface has been notified of the new guides.
 */
export type SetPresetDragGuides = (guides: readonly SnapGuide[]) => void;

/** Root input observation borrowed by toolbar preset gestures. */
export interface PresetInputViewport {
  readonly events: Pick<CanvasViewportApi["events"], "observe">;
}

/** Snapping and normalized input observation used by toolbar placement. */
export interface PresetViewport extends ToolViewport, PresetInputViewport {}

/** Pointer updates delivered to the currently active preset gesture. */
export interface PresetPointerHandlers {
  /**
   * Updates the captured gesture from a normalized pointer movement.
   *
   * @param input - Detached pointer sample in browser client coordinates.
   * @returns An eligible gesture updates its preview.
   * @throws Propagates placement or cleanup failures.
   */
  move(input: CanvasPointerInput): void;
  /**
   * Releases or cancels the captured gesture.
   *
   * @param input - Detached release or cancellation sample.
   * @param commit - Whether an eligible release may commit placement.
   * @returns Gesture resources are released and an eligible drop is committed.
   * @throws Propagates placement or cleanup failures.
   */
  end(input: CanvasPointerInput, commit: boolean): void;
}

/** Detached pointer-down sample and browser operations for a toolbar preset. */
export interface PresetPointerStart extends CanvasPointerInput {
  /**
   * Captures this pointer on its originating toolbar control.
   *
   * @returns Idempotent release, or undefined when the originating target is unavailable.
   * @throws If browser capture fails.
   */
  capture(): (() => void) | undefined;
  /**
   * Mounts the inert preview host in the originating browser document.
   *
   * @returns Preview operations owned by this gesture, or undefined when its occurrence has ended.
   * @throws If the browser cannot create or mount the preview host.
   */
  createPreview(): PresetPreview | undefined;
}

/**
 * Starts placement for an eligible toolbar pointer.
 *
 * @param input - Detached pointer values and originating browser capabilities.
 * @param tool - Surface-owned creation tool receiving placement input.
 * @returns An eligible pointer is captured for the gesture.
 * @throws Browser capture or input registration failures, including failed rollback.
 */
export type StartPresetDrag = (input: PresetPointerStart, tool: EdgelessCreationTool) => void;

/**
 * Captures preview creation for the currently mounted editor occurrence.
 *
 * @param toolId - Tool identity used by the preview marker.
 * @returns A gesture-bound preview factory, or undefined when the occurrence is unavailable.
 * @throws Propagates occurrence ownership checks.
 */
export type CapturePresetPreview = (
  toolId: string,
) => PresetPointerStart["createPreview"] | undefined;

/** Browser operations for one mounted, non-interactive preset preview. */
export interface PresetPreview {
  /**
   * Renders the supplied creation preview into the mounted host.
   *
   * @param content - React content representing the detached draft.
   * @returns Portal targeting this preview's host.
   */
  render(content: ReactNode): ReactNode;
  /**
   * Positions the preview in browser client coordinates.
   *
   * @param frame - Detached world-space placement frame.
   * @param origin - World origin in browser client CSS pixels.
   * @param zoom - Current canvas scale.
   * @returns The mounted preview reflects the supplied geometry.
   * @throws If browser style mutation fails.
   */
  position(frame: VisualFrame, origin: Point, zoom: number): void;
  /**
   * Removes this preview's mounted host.
   *
   * @returns The host has been offered removal.
   * @throws If browser removal fails.
   */
  remove(): void;
}

/** Capture and normalized input resources owned by one preset gesture. */
export interface PresetPointerResources {
  /**
   * Releases this gesture's pointer capture when the original target still owns it.
   *
   * @returns Capture has been released when still owned; repeated calls are harmless.
   * @throws Propagates browser pointer-capture failures.
   */
  releaseCapture(): void;
  /**
   * Removes the normalized movement and release observations.
   *
   * @returns Gesture input observations have been released.
   * @throws If observation cleanup fails.
   */
  releaseInput(): void;
}

/** Browser resources and attachment captured by one toolbar placement gesture. */
export interface PresetDrag extends PresetPointerResources {
  pointerId: number;
  tool: EdgelessCreationTool;
  coordinates: CanvasViewportCoordinates;
  startX: number;
  startY: number;
  moved: boolean;
  preview: PresetPreview | null;
  /**
   * Mounts the preview in the document that received pointer-down.
   *
   * @returns Preview operations owned by this gesture, or undefined when its occurrence has ended.
   * @throws If browser preview creation fails.
   */
  createPreview(): PresetPreview | undefined;
  /** Frame scheduling tied to the gesture's captured occurrence. */
  clock: FrameClock;
  /** Cancels the pending preview frame, when one is scheduled. */
  cancelFrame?: () => void;
  frame?: VisualFrame;
}

/** Browser portal and detached draft for one toolbar placement preview. */
export interface PresetDragPreview {
  preview: PresetPreview;
  input: CreateElementInput;
  frame: VisualFrame;
}
