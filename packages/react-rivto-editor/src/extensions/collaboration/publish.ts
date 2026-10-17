import type { ReactPanelApi } from "../../panels/types";
import { PanelDOM, isInPanel } from "../../managers/events/panel-dom";
import { canvasPoint } from "../../elements/visuals/utils/canvas-point";
import type { CollaborationParticipant, CollaborationPointer, EditorMode } from "@chulane/rivto";

/** Shared ownership between mounted panels of one extension instance. */
export interface PresenceOwner {
  panel?: ReactPanelApi;
  /** Local human registration; sibling agents have independent ownership. */
  participant: CollaborationParticipant;
}

/**
 * Captures pointer coordinates in the surface's stable coordinate system.
 *
 * @param root - Mounted panel surface.
 * @param event - Latest pointer movement in this panel.
 * @param mode - Panel presentation mode.
 * @returns Canvas point, block-relative fractions, or panel content coordinates in CSS pixels.
 */
function pointerAt(
  root: HTMLElement,
  event: PointerEvent,
  mode: EditorMode,
): CollaborationPointer | null {
  if (mode === "edgeless") {
    return { type: "canvas", ...canvasPoint(event, root) };
  }
  const target = root.ownerDocument.elementFromPoint(event.clientX, event.clientY);
  const block = new PanelDOM(root).getBlock(target);
  if (!block) {
    const rect = root.getBoundingClientRect();
    return {
      type: "panel",
      x: event.clientX - rect.left + root.scrollLeft,
      y: event.clientY - rect.top + root.scrollTop,
    };
  }
  const rect = block.getBoundingClientRect();
  return {
    type: "block",
    blockId: block.dataset.blockId!,
    x: (event.clientX - rect.left) / Math.max(1, rect.width),
    y: (event.clientY - rect.top) / Math.max(1, rect.height),
  };
}

/**
 * Coalesces pointer geometry reads and publication using the configured interval.
 *
 * Captured scroll events remeasure the last pointer against current content,
 * including scrollable ancestors. Leaving the surface discards that position.
 *
 * @param root - Mounted surface receiving real pointer events.
 * @param mode - Coordinate system of the surface.
 * @param active - Reports whether this panel may currently publish.
 * @param update - Receives the latest point or null on pointer exit.
 * @param pointerThrottleMs - Validated timer delay in milliseconds; zero flushes on the next timer task.
 * @returns Cleanup cancelling pending work and native listeners.
 */
function trackPointer(
  root: HTMLElement,
  mode: EditorMode,
  active: () => boolean,
  update: (pointer: CollaborationPointer | null) => void,
  pointerThrottleMs: number,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: PointerEvent | undefined;
  const move = (event: PointerEvent) => {
    if (!active() || !isInPanel(root, event.target as Element)) {
      return;
    }
    pending = event;
    timer ??= setTimeout(() => {
      timer = undefined;
      if (active() && pending) {
        update(pointerAt(root, pending, mode));
      }
    }, pointerThrottleMs);
  };
  const leave = () => {
    clearTimeout(timer);
    timer = undefined;
    pending = undefined;
    if (active()) {
      update(null);
    }
  };
  const scroll = () => {
    if (pending) {
      move(pending);
    }
  };
  root.ownerDocument.addEventListener("scroll", scroll, true);
  root.addEventListener("pointermove", move);
  root.addEventListener("pointerleave", leave);
  return () => {
    clearTimeout(timer);
    root.ownerDocument.removeEventListener("scroll", scroll, true);
    root.removeEventListener("pointermove", move);
    root.removeEventListener("pointerleave", leave);
  };
}

/**
 * Captures completed native caret gestures before deferred selectionchange delivery.
 *
 * @param panel - Existing selection owner receiving the live DOM range.
 * @param root - Surface boundary excluding embedded panels.
 * @param event - Completed text gesture; non-text controls retain structural selection.
 * @returns Updates local selection unless a command already owns pending restoration.
 */
function captureNative(panel: ReactPanelApi, root: HTMLElement, event: Event): void {
  if (
    panel.selection.hasPendingSelectionCallback ||
    !(event.target instanceof Element) ||
    !event.target.closest("[data-block-content]") ||
    !isInPanel(root, event.target)
  ) {
    return;
  }
  const selection = panel.selection.readDOM();
  if (selection) {
    panel.selection.set(selection);
  }
}

/**
 * Reconciles an unchanged local selection after a document update moves its text anchors.
 *
 * New local input supersedes this work. Browser restoration uses the existing panel
 * scheduler, preventing deferred selectionchange from publishing stale DOM offsets.
 * A native range already different from core owns the caret and is never replaced
 * using older anchors, including during typing, deletion, and text replacement.
 *
 * @param panel - Panel owning the captured selection and native caret.
 * @param participant - Owner of retained CRDT text anchors for the local human.
 * @param active - Reports whether panel focus and IME state still allow restoration.
 * @returns Queues restoration only when the captured selection remains current.
 */
function restoreAnchors(
  panel: ReactPanelApi,
  participant: CollaborationParticipant,
  active: () => boolean,
): void {
  const before = panel.selection.snapshot();
  const native = panel.selection.readDOM();
  // Native input can move the caret before deferred selectionchange updates core.
  if (native && JSON.stringify(native.blocks) !== JSON.stringify(before?.blocks)) {
    return;
  }
  queueMicrotask(() => {
    if (!active() || !before || panel.selection.snapshot() !== before) {
      return;
    }
    const resolved = participant.getState().selection;
    if (!resolved) {
      return;
    }
    if (JSON.stringify(resolved.blocks) !== JSON.stringify(before.blocks)) {
      panel.selection.set({ ...before, blocks: resolved.blocks });
      panel.selection.scheduleIfSelectionUnchanged(() =>
        panel.selection.restoreDOM(undefined, { scroll: false }),
      );
    }
  });
}

/**
 * Publishes text and structural selections while retaining stable anchors across edits.
 *
 * @param panel - Existing local selection owner.
 * @param root - Mounted surface receiving keyboard, focus and composition events.
 * @param active - Reports whether this panel owns publication.
 * @param participant - Human registration receiving selections, excluding plugin namespaces.
 * @returns Cleanup releasing model subscriptions and native gesture listeners.
 */
function trackSelection(
  panel: ReactPanelApi,
  root: HTMLElement,
  active: () => boolean,
  participant: CollaborationParticipant,
): () => void {
  let composing = false;
  const canRestore = () => active() && !composing;
  const changed = () => {
    if (canRestore()) {
      participant.setSelection(panel.selection.get() ?? null);
    }
  };
  const capture = (event: Event) => {
    if (canRestore()) {
      captureNative(panel, root, event);
    }
  };
  const compositionStart = () => {
    composing = true;
  };
  const compositionEnd = (event: Event) => {
    composing = false;
    queueMicrotask(() => capture(event));
  };
  const unsubscribeSelection = panel.selection.subscribe(changed);
  // Retained remote highlights must not restore native focus into an inactive editor.
  const unsubscribeDocument = panel.document
    .getDocument()
    .subscribe(() =>
      restoreAnchors(
        panel,
        participant,
        () => canRestore() && root.contains(root.ownerDocument.activeElement),
      ),
    );
  const listeners = {
    keyup: capture,
    pointerup: capture,
    focusin: capture,
    compositionstart: compositionStart,
    compositionend: compositionEnd,
  };
  for (const [type, listener] of Object.entries(listeners)) {
    root.addEventListener(type, listener);
  }
  return () => {
    unsubscribeSelection();
    unsubscribeDocument();
    for (const [type, listener] of Object.entries(listeners)) {
      root.removeEventListener(type, listener);
    }
  };
}

/**
 * Publishes one mounted panel while respecting active-panel and cleanup ownership.
 *
 * Switching surface modes or moving focus to another editor preserves the owner's
 * shared selection and drops only its pointer. The replacement publisher resumes the same registration and its CRDT anchors;
 * cleanup checks the committed root before treating replacement as panel removal.
 *
 * @param panel - Panel whose selection and pointer are observed.
 * @param root - Its mounted surface, excluding nested panel occurrences.
 * @param owner - Shared publisher ownership across panels of this extension.
 * @param mode - Rendered surface mode.
 * @param pointerThrottleMs - Validated interval for outgoing pointer updates, in milliseconds.
 * @returns Cleanup withdrawing only presence owned by this panel.
 */
export function publishPresence(
  panel: ReactPanelApi,
  root: HTMLElement,
  owner: PresenceOwner,
  mode: EditorMode,
  pointerThrottleMs: number,
): () => void {
  // Surface replacement destroys the old publisher, but the selection belongs
  // to the same human registration. Its CRDT anchors survive surface replacement
  // without borrowing selection from another participant or editor session.
  // Each agent owns a different registration, so human cleanup cannot erase it.
  // Panel ownership still prevents an inactive surface from clearing the human.
  const participant = owner.participant;
  let alive = true;
  const active = () =>
    alive &&
    root.ownerDocument.hasFocus() &&
    panel.editor.panels.getActive() === panel &&
    !root.ownerDocument.hidden;
  const clear = () => {
    if (owner.panel === panel) {
      owner.panel = undefined;
      participant.clear();
    }
  };
  const visibility = () => {
    if (root.ownerDocument.hidden) {
      clear();
    }
  };
  const stopPointer = trackPointer(
    root,
    mode,
    active,
    (pointer) => {
      owner.panel = panel;
      participant.setPointer(pointer);
    },
    pointerThrottleMs,
  );
  const stopSelection = trackSelection(
    panel,
    root,
    () => {
      if (active()) {
        owner.panel = panel;
        return true;
      }
      return false;
    },
    participant,
  );
  // The live mode changes before the old surface unregisters. Comparing it with
  // this publisher's captured mode identifies replacement even while its root is absent.
  // A mounted panel losing focus also retains its user's selection: another user's
  // interaction must not erase that highlight. Disabled panels still have no active root.
  // Selection anchors survive both transitions; pointer coordinates belong to the old surface.
  const stopDeactivation = panel.subscribeDeactivation(() => {
    if (owner.panel === panel && (panel.mode.get() !== mode || panel.events.getRoot())) {
      participant.setMode(panel.mode.get());
    } else {
      clear();
    }
  });
  const window = root.ownerDocument.defaultView!;
  root.ownerDocument.addEventListener("visibilitychange", visibility);
  window.addEventListener("blur", clear);
  return () => {
    alive = false;
    // Root refs settle before this check, including intermediate effects during a mode switch.
    // React can mount an intermediate publisher with the previous root before exposing
    // the new one. Immediate cleanup would erase the selection resumed by its successor.
    // Inspect the panel's current root, not this effect's captured root: a replacement
    // keeps presence alive, while closing the panel leaves no root and withdraws it.
    queueMicrotask(() => {
      if (!panel.events.getRoot()) {
        clear();
      }
    });
    stopPointer();
    stopSelection();
    stopDeactivation();
    root.ownerDocument.removeEventListener("visibilitychange", visibility);
    window.removeEventListener("blur", clear);
  };
}
