import type { CanvasTransformControlsProps } from "../../types/controls";

/** Attached world layer used privately by the transform implementation. */
export interface MountedCanvasTransformControlsProps extends CanvasTransformControlsProps {
  readonly root: HTMLElement;
  readonly plane: HTMLElement;
}
