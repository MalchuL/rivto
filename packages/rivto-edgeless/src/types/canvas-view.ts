import type { CanvasInputOptions } from "../browser/types";
import type { HTMLAttributes, ReactNode, Ref } from "react";
import type { CanvasApi } from "../core/canvas";
import type { CanvasElement } from "./canvas";

/**
 * Renders consumer content for one projected element.
 *
 * @param element - Current source or preview geometry; treat it as immutable.
 * @returns Positioned geometry host and application content.
 */
export type CanvasItemRenderer = (element: CanvasElement) => ReactNode;
/** Independent view configuration, with browser input policy supplied by its host. */
export interface CanvasViewProps
  extends Omit<HTMLAttributes<HTMLElement>, "children">, CanvasInputOptions {
  readonly canvas: CanvasApi;
  readonly viewportRef?: Ref<HTMLElement>;
  readonly renderElement?: CanvasItemRenderer;
  readonly planeProps?: HTMLAttributes<HTMLDivElement>;
  readonly children?: ReactNode;
  readonly overlay?: ReactNode;
}
