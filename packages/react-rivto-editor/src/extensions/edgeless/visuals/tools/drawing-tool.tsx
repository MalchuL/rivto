import type { ReactNode } from "react";
import { EdgelessCreationTool } from "../../../../managers/edgeless-tools/edgeless-creation-tool";
import type {
  EdgelessTool,
  EdgelessToolOptions,
  EdgelessToolPointer,
} from "../../../../managers/edgeless-tools/edgeless-tool";
import type { EdgelessBrush } from "../../../../elements/visuals/types";
import type { CanvasPoint } from "../../../../elements/visuals/utils/canvas-point";
import { drawingDefaults } from "../../../../elements/visuals/creation-defaults";
import { padDrawingFrame } from "../../../../elements/visuals/utils/drawing-frame";
import { DrawingCapture } from "../components/drawing-capture";
import { VISUAL_ELEMENT_TYPES } from "../../../../elements/visuals/constants";

/** Freehand creation tool; samples remain local until the accepted pointer is released. */
export class DrawingTool extends EdgelessCreationTool {
  override readonly supportsPlacement = false;
  private points: CanvasPoint[] = [];
  private pointerId?: number;

  /**
   * Binds a registered brush to the shared drawing type and group settings.
   *
   * @param options - Surface dependencies and resolved drawing group.
   * @param brush - Built-in brush whose preset applies when switching brushes.
   */
  constructor(
    options: EdgelessToolOptions,
    readonly brush: EdgelessBrush,
  ) {
    super({
      ...options,
      type: VISUAL_ELEMENT_TYPES.drawing,
      create: () => ({ type: VISUAL_ELEMENT_TYPES.drawing }),
    });
  }

  /**
   * Applies a brush preset only when the shared settings identify another brush.
   *
   * @param _previous - Previously active tool; selection itself does not insert a stroke.
   * @returns Preserves edited settings when reselecting the same brush.
   */
  override activate(_previous?: EdgelessTool): void {
    if (this.getSettings().props?.brush !== this.brush) {
      this.group?.setSettings({ props: { brush: this.brush, ...drawingDefaults[this.brush] } });
    }
  }

  /**
   * Starts collecting a primary pointer stroke.
   *
   * @param input - First canvas point.
   * @returns Whether the surface should capture the pointer.
   */
  override pointerDown(input: EdgelessToolPointer): boolean {
    if (input.button !== 0) {
      return false;
    }
    this.pointerId = input.pointerId;
    this.points = [input.point];
    this.changed();
    return true;
  }

  /**
   * Adds the accepted pointer's position to the local stroke.
   *
   * @param input - Current canvas point.
   * @returns Publishes the draft without document mutations.
   */
  override pointerMove(input: EdgelessToolPointer): void {
    if (input.pointerId === this.pointerId) {
      this.points.push(input.point);
      this.changed();
    }
  }

  /**
   * Creates a stroke with padded geometry and clears its local samples.
   *
   * @param input - Accepted pointer release and current canvas scale.
   * @returns Creates one drawing when at least two samples exist.
   * @throws If document creation rejects the stroke; local samples are still cleared.
   */
  override pointerUp(input: EdgelessToolPointer): void {
    if (input.pointerId !== this.pointerId) {
      return;
    }
    try {
      if (this.points.length > 1) {
        const padded = padDrawingFrame(
          this.points,
          Number(this.getSettings().props?.strokeWidth),
          input.zoom,
        );
        this.options.operations.createElement({
          type: this.creation.type,
          frame: padded.frame,
          props: { brush: this.brush, points: padded.points },
        });
      }
    } finally {
      this.cancel();
    }
  }

  /**
   * Discards uncommitted stroke samples.
   *
   * @returns Whether a stroke was active.
   */
  override cancel(): boolean {
    const active = this.pointerId !== undefined;
    this.pointerId = undefined;
    this.points = [];
    this.changed();
    return active;
  }

  /**
   * Renders the stroke with screen-sized width and current group appearance.
   *
   * @param zoom - Canvas scale.
   * @returns SVG draft content without persisted identity.
   */
  override renderPreview(zoom: number): ReactNode {
    const props = this.getSettings().props!;
    return (
      <DrawingCapture>
        {this.points.length > 1 && (
          <path
            d={this.points
              .map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`)
              .join(" ")}
            fill="none"
            stroke={String(props.stroke)}
            strokeWidth={Number(props.strokeWidth) / zoom}
            strokeLinecap="butt"
            strokeLinejoin="round"
            opacity={Number(props.opacity)}
          />
        )}
      </DrawingCapture>
    );
  }
}
