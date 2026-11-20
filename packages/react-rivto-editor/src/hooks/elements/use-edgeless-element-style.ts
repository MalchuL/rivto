import type { EditorElementNode } from "@chulane/rivto";
import type { RegionIdentity } from "@chulane/rivto-root";
import { useCallback, useContext, useRef, type CSSProperties } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { ReactPanelContext } from "../../components/editor-panel/react-panel-context";
import { normalizeRotation } from "../../elements/visuals/utils/geometry";
import type { EdgelessElementStyle } from "./types";

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
 * A mounted panel Root supplies locked preview styles; without a matching Root,
 * the hook uses the supplied geometry.
 *
 * @param element - Current flat element record, or undefined after removal.
 * @param absoluteGeometry - Uses world-space left/top without host rotation; false by default; connector registrations enable this explicitly.
 * @returns Mounting ref, opaque host identity ref, and style for the same positioned
 * host. Style is undefined when the element is missing. The renderer still owns
 * its class and DOM markers.
 */
export function useEdgelessElementStyle<Host extends HTMLElement = HTMLElement>(
  element: EditorElementNode | undefined,
  absoluteGeometry = false,
): EdgelessElementStyle<Host> {
  const identity = useRef<RegionIdentity | undefined>(undefined);
  const ref = useCallback((host: Host | null) => {
    identity.current = host ? getBrowserElementIdentity(host) : undefined;
  }, []);
  const root = useContext(ReactPanelContext)?.reactPanel.mountedRoot;
  const region = identity.current ? root?.captureRegionByIdentity(identity.current) : undefined;
  let style: CSSProperties | undefined;
  if (element) {
    const locked = region?.readAttribute("data-edgeless-geometry-lock") === "true";
    const rotation =
      typeof element.props.rotation === "number" ? normalizeRotation(element.props.rotation) : 0;
    let transform = absoluteGeometry
      ? undefined
      : `translate(${element.frame.x}px, ${element.frame.y}px) rotate(${rotation}deg)`;
    const previewTransform = locked ? region.readInlineStyle("transform") : undefined;
    if (previewTransform) {
      transform = previewTransform;
    }
    const left = absoluteGeometry ? element.frame.x : 0;
    const top = absoluteGeometry ? element.frame.y : 0;
    style = {
      left: (locked && region.readInlineStyle("left")) || left,
      top: (locked && region.readInlineStyle("top")) || top,
      width: (locked && region.readInlineStyle("width")) || element.frame.width,
      height: (locked && region.readInlineStyle("height")) || element.frame.height,
      zIndex: element.zIndex,
      transform,
    };
  }
  return { ref, identity, style };
}
