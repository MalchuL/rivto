import type { Canvas } from "../core/canvas";

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

/** Native viewport policies independent of React props or document schemas. */
export interface CanvasInputOptions {
  /** Enables ordinary element selection and marquee; false delegates admission to the host. */
  readonly interactions?: boolean;
  /**
   * Decides whether a native input can start a camera gesture.
   *
   * @param event - Pointer or wheel input originating inside this viewport.
   * @returns False preserves the host's native/editor interaction.
   */
  readonly allowCamera?: (event: PointerEvent | WheelEvent) => boolean;
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
