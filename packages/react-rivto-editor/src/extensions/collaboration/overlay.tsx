import { useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPointerMotion } from "./pointer-motion";
import { createPortal } from "react-dom";
import { useEditorRoot, useReactPanel } from "../../hooks";
import { SurfaceContext } from "../../surfaces/surface";
import type { CollaborationUser } from "./state";
import type { PresenceRect } from "./geometry";
import { observePresence, type PresenceGeometry, type PeerGeometry } from "./observe";
import { publishPresence, type PresenceOwner } from "./publish";

/**
 * Paints one pointer, caret, text range, or structural outline without intercepting input.
 *
 * @param props - Measured peer decoration relative to its containing panel.
 * @param props.peer - Validated connection identity and display colors.
 * @param props.rect - Screen-space rectangle and decoration kind.
 * @param props.bounds - Screen-space panel bounds used for translation.
 * @param props.pointerSmoothingMs - Validated incoming pointer smoothing time constant in milliseconds.
 * @returns A decorative element; text is rendered safely through React.
 */
function PresenceDecoration({
  peer,
  rect,
  bounds,
  pointerSmoothingMs,
}: {
  peer: PeerGeometry;
  rect: PresenceRect;
  bounds: DOMRect;
  pointerSmoothingMs: number;
}) {
  const element = useRef<HTMLDivElement>(null);
  const motion = useRef<ReturnType<typeof createPointerMotion> | undefined>(undefined);
  useLayoutEffect(() => {
    if (rect.kind !== "pointer") {
      return;
    }
    const controller = createPointerMotion(element.current!, pointerSmoothingMs);
    motion.current = controller;
    return () => {
      controller.dispose();
      motion.current = undefined;
    };
  }, [rect.kind, pointerSmoothingMs]);
  useLayoutEffect(() => {
    motion.current?.update(rect.x - bounds.left, rect.y - bounds.top);
  }, [rect.x, rect.y, bounds.left, bounds.top]);
  return (
    <div
      ref={element}
      data-collaboration-peer={peer.id}
      data-collaboration-kind={rect.kind}
      style={{
        left: rect.kind === "pointer" ? 0 : rect.x - bounds.left,
        top: rect.kind === "pointer" ? 0 : rect.y - bounds.top,
        width: Math.max(rect.width, 2),
        height: Math.max(rect.height, 1),
        color: peer.user.color,
      }}
    >
      {rect.kind === "pointer" && (
        <svg width="14" height="20" viewBox="0 0 14 20">
          <path d="M1 1 L12 12 L7 12 L5 18 Z" fill="currentColor" stroke="white" />
        </svg>
      )}
      {(rect.kind === "caret" || rect.kind === "pointer") && (
        <span style={{ background: peer.user.color }}>{peer.user.name}</span>
      )}
    </div>
  );
}

/**
 * Mounts a clipped, non-interactive overlay for one panel's remote collaborators.
 *
 * @param props - Host identity and publisher ownership shared across this extension's panels.
 * @param props.user - Validated collaborator display identity.
 * @param props.owner - Active publisher ownership protecting inactive-panel cleanup.
 * @param props.pointerThrottleMs - Validated outgoing pointer interval in milliseconds.
 * @param props.pointerSmoothingMs - Validated incoming pointer smoothing time constant in milliseconds.
 * @returns A portal containing remote pointers, carets, and selection highlights.
 */
export function CollaborationOverlay({
  user,
  owner,
  pointerThrottleMs,
  pointerSmoothingMs,
}: {
  user: CollaborationUser;
  owner: PresenceOwner;
  pointerThrottleMs: number;
  pointerSmoothingMs: number;
}) {
  const panel = useReactPanel();
  const { element: root } = useEditorRoot();
  const mode = useContext(SurfaceContext);
  const [geometry, setGeometry] = useState<PresenceGeometry>();
  useEffect(() => {
    if (!root) {
      return;
    }
    const stopObserving = observePresence(root, panel.document.getDocument(), setGeometry);
    const stopPublishing = publishPresence(panel, root, user, owner, mode, pointerThrottleMs);
    return () => {
      stopPublishing();
      stopObserving();
    };
  }, [root, panel, mode, owner, user, pointerThrottleMs]);
  if (!root || !geometry) {
    return null;
  }
  const { bounds, peers } = geometry;
  return createPortal(
    <div
      aria-hidden="true"
      data-collaboration-overlay={panel.documentId}
      style={{ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }}
    >
      {peers.flatMap((peer) =>
        peer.rects.map((rect, index) => (
          <PresenceDecoration
            key={
              rect.kind === "pointer" ? `${peer.id}:pointer` : `${peer.id}:${rect.kind}:${index}`
            }
            peer={peer}
            rect={rect}
            bounds={bounds}
            pointerSmoothingMs={pointerSmoothingMs}
          />
        )),
      )}
    </div>,
    root.ownerDocument.body,
  );
}
