import type { EditorElementNode } from "@chulane/rivto";
import { useRef, type CSSProperties } from "react";
import { normalizeRotation } from "../../elements/visuals/utils/geometry";

/**
 * Supplies the host ref and inline geometry for a positioned canvas element.
 *
 * Frame coordinates and sizes are canvas units. HTML positions use CSS translate
 * with left/top fixed at zero so DOM offset rounding cannot lose fractional
 * coordinates between Moveable gestures. Rotation comes from props.rotation
 * in clockwise degrees around the center; absent rotation means zero. Connectors
 * use their endpoint geometry instead of rotating the host.
 *
 * During resize or rotation, the controller writes preview size and transforms
 * while retaining the initial left/top, and sets data-edgeless-geometry-lock.
 * Re-renders must echo those values
 * through the style prop: omitting them lets React clear left/top/width/height
 * or transform and the element jumps. After the gesture, persisted values apply.
 * The hook does not subscribe or write to the document; pass its current snapshot.
 *
 * @param element - Current flat element record, or undefined after removal.
 * @returns Ref and style to attach to the same positioned host. Style is undefined
 * when the element is missing. The renderer still owns its class and DOM markers.
 */
export function useEdgelessElementStyle<Host extends HTMLElement = HTMLElement>(element: EditorElementNode | undefined) {
  const ref = useRef<Host | null>(null);
  const host = ref.current;
  let style: CSSProperties | undefined;
  if (element) {
    const locked = host?.dataset.edgelessGeometryLock === "true";
    const rotation = typeof element.props.rotation === "number" ? normalizeRotation(element.props.rotation) : 0;
    let transform = element.type === "connector" ? undefined : `translate(${element.frame.x}px, ${element.frame.y}px) rotate(${rotation}deg)`;
    if (locked && host.style.transform) transform = host.style.transform;
    const left = element.type === "connector" ? element.frame.x : 0;
    const top = element.type === "connector" ? element.frame.y : 0;
    style = {
      left: locked && host.style.left ? host.style.left : left,
      top: locked && host.style.top ? host.style.top : top,
      width: locked && host.style.width ? host.style.width : element.frame.width,
      height: locked && host.style.height ? host.style.height : element.frame.height,
      zIndex: element.zIndex,
      transform,
    };
  }
  return { ref, style };
}
