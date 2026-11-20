import type { CanvasInputOptions, CanvasInputRoot } from "../browser/types";
import type { AriaAttributes, CSSProperties, ReactNode, Ref } from "react";
import type { CanvasApi } from "../core/canvas";
import type { CanvasElement } from "./canvas";

/**
 * Renders consumer content for one projected element.
 *
 * @param element - Current source or preview geometry; treat it as immutable.
 * @returns Positioned geometry host and application content.
 */
export type CanvasItemRenderer = (element: CanvasElement) => ReactNode;
/** Presentation attributes for the canvas world layer. */
export interface CanvasWorldLayerProps {
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly [attribute: `data-${string}`]: string | number | undefined;
}

/** Independent view configuration, with browser input policy supplied by its host. */
export interface CanvasViewProps extends CanvasInputOptions, AriaAttributes {
  readonly canvas: CanvasApi;
  /** Mounting ref for the host that owns its browser attachment. */
  readonly viewportRef?: Ref<HTMLElement>;
  /** Host-owned browser Root; null waits for it, while omission creates a standalone Root. */
  readonly inputRoot?: CanvasInputRoot | null;
  readonly renderElement?: CanvasItemRenderer;
  readonly planeProps?: CanvasWorldLayerProps;
  readonly className?: string;
  readonly style?: CSSProperties;
  readonly tabIndex?: number;
  readonly [attribute: `data-${string}`]: string | number | undefined;
  readonly children?: ReactNode;
  readonly overlay?: ReactNode;
}
