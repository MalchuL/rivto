import type { DocumentModel } from "@chulane/document-model";
import { PanelDOM } from "../../managers/events/panel-dom";
import { presenceSchema, decodeSelection, type Presence, type CollaborationUser } from "./state";
import { COLLABORATION_TEXT_ATTRIBUTE, measurePresence, type PresenceRect } from "./geometry";

/** Screen-space geometry for one connected remote client. */
export interface PeerGeometry {
  id: number;
  user: CollaborationUser;
  rects: PresenceRect[];
}
/** Measured panel bounds and decorations; never persisted. */
export interface PresenceGeometry {
  bounds: DOMRect;
  peers: PeerGeometry[];
}

/**
 * Marks mounted raw text hosts while selected by any participant, restoring untouched hosts on cleanup.
 *
 * @param root - Receiving panel root.
 * @param document - Current model used to ignore unresolved text anchors.
 * @param peers - Validated local and remote states.
 * @param marked - Hosts marked during the preceding measurement.
 * @returns Reconciles only changed markers; no document data is modified.
 */
function markText(
  root: HTMLElement,
  document: DocumentModel,
  peers: Presence[],
  marked: Set<HTMLElement>,
): void {
  const next = new Set<HTMLElement>();
  const dom = new PanelDOM(root);
  for (const peer of peers) {
    for (const block of peer.selection ? decodeSelection(document, peer.selection).blocks : []) {
      if (block.end !== -1) {
        const content = dom.findContent(block.id);
        if (content) {
          next.add(content);
        }
      }
    }
  }
  for (const content of marked) {
    if (!next.has(content)) {
      content.removeAttribute(COLLABORATION_TEXT_ATTRIBUTE);
      marked.delete(content);
    }
  }
  for (const content of next) {
    if (!marked.has(content)) {
      content.setAttribute(COLLABORATION_TEXT_ATTRIBUTE, "");
      marked.add(content);
    }
  }
}

/**
 * Resolves remote state and measures referenced DOM nodes after rendering.
 *
 * @param root - Receiving panel surface.
 * @param document - Model owning presence and stable text anchors.
 * @param marked - Raw Markdown hosts currently revealed for precise cursor geometry.
 * @returns Current bounds and decorations for validated remote peers.
 */
function measure(
  root: HTMLElement,
  document: DocumentModel,
  marked: Set<HTMLElement>,
): PresenceGeometry {
  const collaboration = document.collaboration;
  const participants = Array.from(collaboration.getStates()).flatMap(([id, state]) => {
    const parsed = presenceSchema.safeParse(state);
    return parsed.success ? [{ id, state: parsed.data }] : [];
  });
  // Retained local selections need the same source layout as their remote highlights.
  // Otherwise blur restores preview only locally and shared card heights oscillate.
  markText(
    root,
    document,
    participants.map((peer) => peer.state),
    marked,
  );
  return {
    bounds: root.getBoundingClientRect(),
    peers: participants
      .filter((peer) => peer.id !== collaboration.clientId)
      .map((peer) => ({
        id: peer.id,
        user: peer.state.user,
        rects: measurePresence(root, document, peer.state),
      })),
  };
}

/**
 * Re-measures remote overlays once per frame after presence, layout, or viewport changes.
 *
 * @param root - Mounted panel, excluding nested panel selection lookup.
 * @param document - Current shared document and transient channel.
 * @param listener - Receives measured screen geometry after relevant changes.
 * @returns Cleanup releasing observers, scheduled frames, and raw-text presentation markers.
 */
export function observePresence(
  root: HTMLElement,
  document: DocumentModel,
  listener: (geometry: PresenceGeometry) => void,
): () => void {
  const window = root.ownerDocument.defaultView!;
  const marked = new Set<HTMLElement>();
  let frame: number | undefined;
  const schedule = () => {
    frame ??= window.requestAnimationFrame(() => {
      frame = undefined;
      listener(measure(root, document, marked));
    });
  };
  const unsubscribe = document.collaboration.subscribe(schedule);
  const unsubscribeDocument = document.subscribe(schedule);
  const resize = new ResizeObserver(schedule);
  resize.observe(root);
  const mutations = new MutationObserver(schedule);
  mutations.observe(root, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["data-edgeless-zoom", "data-edgeless-pan-x", "data-edgeless-pan-y"],
  });
  window.addEventListener("resize", schedule);
  root.ownerDocument.addEventListener("scroll", schedule, true);
  schedule();
  return () => {
    unsubscribe();
    unsubscribeDocument();
    resize.disconnect();
    mutations.disconnect();
    window.removeEventListener("resize", schedule);
    root.ownerDocument.removeEventListener("scroll", schedule, true);
    if (frame !== undefined) {
      window.cancelAnimationFrame(frame);
    }
    marked.forEach((host) => host.removeAttribute(COLLABORATION_TEXT_ATTRIBUTE));
  };
}
