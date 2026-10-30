import type { EdgelessOperations } from "../../../../managers/elements/edgeless-operations";
import type {
  ConnectorEndpoint,
  ConnectorRoute,
  VisualFrame,
} from "../../../../elements/visuals/types";
import type { CanvasPoint } from "../../../../elements/visuals/utils/canvas-point";
import {
  pointInRotatedFrame,
  inflateFrame,
  nearestAnchor,
  endpointPoint,
  edgeAnchors,
} from "../../../../elements/visuals/utils/geometry";
import { VISUAL_ELEMENT_TYPES } from "../../../../elements/visuals/constants";

/** Candidate attachment point in canvas units, with active hover highlighting. */
export interface ConnectorAnchorMarker {
  x: number;
  y: number;
  active: boolean;
}

/** Receiving element and canvas-space outlines/anchors for connector hover feedback. */
export interface ConnectorHover {
  elementId: string;
  frame: VisualFrame;
  outline: VisualFrame;
  anchors: readonly ConnectorAnchorMarker[];
}

/** Detached connector route preview; endpoints and frames use canvas units, anchors use normalized coordinates. */
export interface ConnectorPreview {
  source: CanvasPoint;
  target: CanvasPoint;
  route: ConnectorRoute;
  sourceAnchor?: { x: number; y: number };
  targetAnchor?: { x: number; y: number };
  sourceFrame?: VisualFrame;
  targetFrame?: VisualFrame;
}

/** Shared target resolution for connector creation and existing endpoint reconnection. */
export class ConnectorTargets {
  /**
   * Binds hit testing to current panel operations and viewport scale.
   *
   * @param operations - Receiving panel's scoped geometry readers.
   * @param zoom - Canvas scale used for the screen-constant attachment halo.
   */
  constructor(
    private readonly operations: EdgelessOperations,
    readonly zoom: number,
  ) {}
  /**
   * Resolves the topmost hit object and its outermost group as an attachment target.
   *
   * @param point - Pointer position in canvas units, including the outside attachment allowance.
   * @returns Topmost hit's outermost eligible group, or the hit itself; undefined when no object is hit.
   */
  objectAt(point: CanvasPoint): string | undefined {
    const candidates = this.operations.elements
      .getElementNodes()
      .filter(
        (element) =>
          element.type !== VISUAL_ELEMENT_TYPES.connector &&
          element.type !== VISUAL_ELEMENT_TYPES.group &&
          pointInRotatedFrame(
            point,
            inflateFrame(element.frame, 22 / Math.max(this.zoom, 0.01)),
            this.operations.getRotation(element.id),
          ),
      )
      .sort((a, b) => b.zIndex - a.zIndex);
    let id = candidates[0]?.id;
    while (id) {
      const parent = this.operations.getParentId(id);
      if (!parent) {
        break;
      }
      id = parent;
    }
    return id;
  }

  /**
   * Resolves the closest normalized anchor and its canvas position.
   *
   * @param id - Existing attachment target.
   * @param point - Canvas pointer location.
   * @returns Endpoint tied to that element.
   */
  endpoint(id: string, point: CanvasPoint): ConnectorEndpoint {
    const frame = this.operations.getFrame(id)!;
    const rotation = this.operations.getRotation(id);
    const anchor = nearestAnchor(frame, point, rotation);
    return {
      elementId: id,
      anchor,
      position: endpointPoint({ anchor, position: point }, frame, rotation),
    };
  }

  /**
   * Builds attachment feedback using the same target resolution as endpoint commitment.
   * Source attachments remain eligible so a gesture can return to its starting anchor and form a loop.
   *
   * @param point - Pointer position in canvas units.
   * @returns Target bounds and anchors, or null when no eligible target is hit.
   */
  hoverFor(point: CanvasPoint): ConnectorHover | null {
    const id = this.objectAt(point);
    if (!id) {
      return null;
    }
    const frame = this.operations.getFrame(id);
    if (!frame) {
      return null;
    }
    const rotation = this.operations.getRotation(id);
    const nearest = nearestAnchor(frame, point, rotation);
    return {
      elementId: id,
      frame,
      outline: this.operations.getBounds(id) ?? frame,
      anchors: edgeAnchors(frame, rotation).map((anchor) => ({
        x: anchor.x,
        y: anchor.y,
        active: anchor.ax === nearest.x && anchor.ay === nearest.y,
      })),
    };
  }
}
