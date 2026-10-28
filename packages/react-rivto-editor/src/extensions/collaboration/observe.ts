import type { DocumentModel } from "@chulane/document-model";
import { PanelDOM } from "../../panels/panel-dom";
import type {
  CollaborationManagerApi,
  CollaborationParticipantState as Presence,
  CollaborationUser,
} from "@chulane/rivto";
import { COLLABORATION_TEXT_ATTRIBUTE, measurePresence, type PresenceRect } from "./geometry";

/** Screen-space geometry for one participant, identified by its session and participant IDs. */
export interface PeerGeometry {
  id: string;
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
 * @param peers - Validated local and remote states.
 * @param marked - Hosts marked during the preceding measurement.
 * @returns Reconciles only changed markers; no document data is modified.
 */
function markText(root: HTMLElement, peers: readonly Presence[], marked: Set<HTMLElement>): void {
  const next = new Set<HTMLElement>();
  const dom = new PanelDOM(root);
  for (const peer of peers) {
    for (const block of peer.selection?.blocks ?? []) {
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
 * @param collaboration - Core manager resolving participants from every session.
 * @param localParticipantId - Human participant excluded from overlays in its own session.
 * @returns Current bounds and decorations for other participants, including local agents.
 */
function measure(
  root: HTMLElement,
  document: DocumentModel,
  marked: Set<HTMLElement>,
  collaboration: CollaborationManagerApi,
  localParticipantId: string,
): PresenceGeometry {
  const participants = collaboration.getParticipants();
  // Retained local selections need the same source layout as their remote highlights.
  // Otherwise blur restores preview only locally and shared card heights oscillate.
  markText(root, participants, marked);
  return {
    bounds: root.getBoundingClientRect(),
    peers: participants
      .filter(
        (peer) =>
          peer.clientId !== document.collaboration.clientId || peer.id !== localParticipantId,
      )
      .map((peer) => ({
        id: `${peer.clientId}:${peer.id}`,
        user: peer.user,
        rects: measurePresence(root, document, peer),
      })),
  };
}

/**
 * Re-measures remote overlays once per frame after presence, layout, or viewport changes.
 *
 * @param root - Mounted panel, excluding nested panel selection lookup.
 * @param document - Current shared document and transient channel.
 * @param collaboration - Core manager resolving participants from every session.
 * @param localParticipantId - Human registration to exclude from its own overlays.
 * @param listener - Receives measured screen geometry after relevant changes.
 * @returns Cleanup releasing observers, scheduled frames, and raw-text presentation markers.
 */
export function observePresence(
  root: HTMLElement,
  document: DocumentModel,
  collaboration: CollaborationManagerApi,
  localParticipantId: string,
  listener: (geometry: PresenceGeometry) => void,
): () => void {
  const window = root.ownerDocument.defaultView!;
  const marked = new Set<HTMLElement>();
  let frame: number | undefined;
  const schedule = () => {
    frame ??= window.requestAnimationFrame(() => {
      frame = undefined;
      listener(measure(root, document, marked, collaboration, localParticipantId));
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
