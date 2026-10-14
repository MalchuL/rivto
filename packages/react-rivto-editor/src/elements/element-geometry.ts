import type { EditorElementNode, EditorElementFrame } from "@chulane/rivto";
import { normalizeRotation, rotatePoint, rotatedFrameBounds } from "./visuals/utils/geometry";

/** Reads canvas geometry without storing derived group bounds or changing children. */
export class ElementGeometry {
  /**
   * @param read - Reads a node in the current view; may substitute uncommitted
   * preview geometry. Missing or outside-view IDs must return undefined.
   * @param previewRotation - Optional resolved angle in clockwise degrees, including uncommitted previews.
   * A connector's DOM target rotates during a gesture even though its persisted
   * frame is axis-aligned. Callers can also return zero for registered world-space
   * geometry. Undefined uses the normal stored-angle rules.
   */
  constructor(
    private readonly read: (id: string) => EditorElementNode | undefined,
    private readonly previewRotation?: (id: string) => number | undefined,
  ) {}

  /**
   * Reads normalized rotation without mutating the element or preview.
   * @param id - Element identity.
   * @returns Preview or stored clockwise degrees;
   * missing nodes and nodes without an angle return zero.
   */
  rotation(id: string): number {
    const node = this.read(id);
    if (!node) {
      return 0;
    }
    const preview = this.previewRotation?.(id);
    if (preview !== undefined) {
      return normalizeRotation(preview);
    }
    return typeof node.props.rotation === "number" ? normalizeRotation(node.props.rotation) : 0;
  }

  /**
   * Computes the frame before rotation around its center, in canvas units.
   * Nonempty groups enclose their leaves in the group's own rotated axes;
   * changing a child never rotates or moves its siblings. Nested group frames
   * do not add empty space to an ancestor. Empty groups use their stored frame.
   * @param id - Element identity in this view.
   * @returns Derived group frame or stored leaf frame; undefined for a missing ID.
   */
  frame(id: string): EditorElementFrame | undefined {
    const node = this.read(id);
    if (!node) {
      return undefined;
    }
    if (node.type !== "group" || !node.childIds.length) {
      return node.frame;
    }
    const angle = this.rotation(id);
    const origin = { x: 0, y: 0 };
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    const visit = (childId: string) => {
      const child = this.read(childId);
      if (!child) {
        return;
      }
      if (child.type === "group" && child.childIds.length) {
        child.childIds.forEach(visit);
        return;
      }
      const f = child.frame;
      const center = { x: f.x + f.width / 2, y: f.y + f.height / 2 };
      for (const x of [f.x, f.x + f.width]) {
        for (const y of [f.y, f.y + f.height]) {
          const point = rotatePoint(
            rotatePoint({ x, y }, center, this.rotation(childId)),
            origin,
            -angle,
          );
          left = Math.min(left, point.x);
          top = Math.min(top, point.y);
          right = Math.max(right, point.x);
          bottom = Math.max(bottom, point.y);
        }
      }
    };
    node.childIds.forEach(visit);
    if (!Number.isFinite(left)) {
      return node.frame;
    }
    const center = rotatePoint({ x: (left + right) / 2, y: (top + bottom) / 2 }, origin, angle);
    const width = right - left,
      height = bottom - top;
    return { x: center.x - width / 2, y: center.y - height / 2, width, height };
  }

  /**
   * @param id - Element identity in this view.
   * @returns Axis-aligned canvas bounds of its oriented frame, or undefined when missing.
   */
  bounds(id: string): EditorElementFrame | undefined {
    const frame = this.frame(id);
    return frame ? rotatedFrameBounds(frame, this.rotation(id)) : undefined;
  }
}
