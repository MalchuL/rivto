import type { CanvasViewport } from "../browser/canvas-viewport";
import type { CanvasViewportCoordinates } from "../browser/types";
import type { CanvasSnapshot } from "../utils/store";
import type { InputRegion, InputRoot } from "@chulane/rivto-root";
import type { ReactNode } from "react";
import type { Canvas } from "../core/canvas";
import type { CanvasTool } from "../core/tools/canvas-tool";
import type { CanvasToolSession } from "../types/tool-session";

/** Tool state needed to dismiss the default toolbar's group menu. */
export interface CanvasToolbarDismissalTools {
  readonly active?: { readonly keepsMenuOpen: boolean };
  /**
   * Returns to the registry-defined default tool.
   *
   * @returns Active preview is cancelled and the fallback is activated.
   */
  reset(): void;
}

/** Borrowed canvas state and input registration; the view owns browser attachment. */
export interface CanvasViewportApi {
  /** Framework-neutral canvas state and operations. */
  readonly canvas: CanvasViewport["canvas"];
  /** Input registration and observation without attachment, teardown, or custom publishing. */
  readonly events: Pick<CanvasViewport["events"], "register" | "observe">;
  /**
   * Measures the attached world origin in client CSS pixels.
   *
   * @returns Current position, or undefined when no view is attached.
   */
  getWorldOriginInClient: CanvasViewport["getWorldOriginInClient"];
  /**
   * Converts client coordinates using the attached viewport and its live camera.
   *
   * @param point - Client coordinates in CSS pixels.
   * @returns World coordinates, or undefined while detached.
   */
  clientToWorld: CanvasViewport["clientToWorld"];
}

/** Content rendered in an attached canvas world layer. */
export interface CanvasWorldPortalProps {
  /** React content positioned in world coordinates. */
  readonly children: ReactNode;
}

/** Preview subscriptions and zoom supplied to a registered React tool. */
export interface CanvasToolPreviewProps {
  readonly tool: CanvasTool;
  readonly zoom: number;
}

/** World conversion and tool state borrowed by the transparent capture layer. */
export interface CanvasToolLayerProps {
  readonly canvas: Pick<Canvas, "camera" | "snapping">;
  readonly rootIdentity: object;
  readonly viewport: Pick<CanvasViewportApi, "events">;
  readonly attachment: CanvasSnapshot<CanvasToolAttachment | null>;
  readonly tool: CanvasTool;
  readonly tools: Pick<CanvasToolSession, "reset">;
}

/** Attachment identity and browser capabilities borrowed by a canvas tool layer. */
export interface CanvasToolAttachment {
  readonly rootIdentity: object;
  readonly coordinates: Pick<CanvasViewportCoordinates, "clientToWorld">;
  /**
   * Requests focus on the captured viewport when it remains attached.
   *
   * @returns Focus has been requested when the attachment is current.
   * @throws Propagates browser focus failures.
   */
  focus(): void;
}

/** Viewport capabilities borrowed while the default toolbar menu is open. */
export interface CanvasToolbarInputAttachment {
  readonly inputRoot: Pick<InputRoot, "captureRegionByIdentity" | "observeDocumentInput">;
  readonly coordinates: Pick<CanvasViewportCoordinates, "isAttached">;
}

/** Mounted-world operations borrowed by default transform admission. */
export interface CanvasTransformInput {
  readonly worldRegion: Pick<InputRegion, "ancestorAttribute">;
  /**
   * Requests focus for the originating viewport attachment.
   *
   * @returns Focus is requested when the attachment remains current.
   * @throws Propagates browser focus failures.
   */
  focus(): void;
}

/** Scene borrowed by the default transform controls. */
export interface DefaultControlsProps {
  readonly canvas: CanvasViewport["canvas"];
}
