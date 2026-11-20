import { useCallback, useLayoutEffect, useRef } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { PANEL_SELECTOR } from "../../panels/panel-dom";
import { captureLabelText } from "./browser/capture-label-text";
import type { EditableLabelFocusPoint } from "../types";
import type {
  EditableLabelReconciliation,
  EditableLabelSession,
  EditableLabelSessionOptions,
  EditableLabelSessionState,
} from "./types";

/**
 * Binds label text and pending focus to the current panel occurrence.
 *
 * The host keeps its uncommitted draft across Root replacement. A pending seed
 * or focus request waits for panel availability; its subscription is released
 * when fulfilled, when dependencies change, or when the component unmounts.
 *
 * @param options - Label state, pending focus point, and borrowed panel capabilities.
 * @param options.reactPanel - Panel that owns the current occurrence and availability subscription.
 * @param options.editing - Whether the label currently accepts edits.
 * @param options.text - Persisted content used while idle and when editing starts.
 * @param options.focusPointRef - Optional point to consume after placing the caret.
 * @returns Mounting ref, pending caret, and last owned draft for the label renderer.
 * @throws Propagates Root attachment, text, focus, and subscription failures.
 */
export function useEditableLabelSession({
  reactPanel,
  editing,
  text,
  focusPointRef,
}: EditableLabelSessionOptions): EditableLabelSession {
  const identityRef = useRef<RegionIdentity | undefined>(undefined);
  const labelRef = useCallback((element: HTMLDivElement | null) => {
    identityRef.current = element ? getBrowserElementIdentity(element) : undefined;
  }, []);
  const pendingCaret = useRef<EditableLabelFocusPoint | null>(null);
  const editingSession = useRef(false);
  const needsSeed = useRef(false);
  const needsFocus = useRef(false);
  const draft = useRef(text);
  useLayoutEffect(() => {
    const identity = identityRef.current;
    if (!identity) {
      return;
    }
    return attachLabelSession(
      { reactPanel, editing, text, focusPointRef },
      { pendingCaret, editingSession, needsSeed, needsFocus, draft },
      identity,
    );
  }, [editing, focusPointRef, text, reactPanel]);
  return { labelRef, pendingCaret, draft };
}

/**
 * Starts reconciliation for one mounted label and observes delayed Root availability.
 *
 * @param options - Current label text, editing state, and panel.
 * @param state - Mutable state retained across editing effects.
 * @param identity - Opaque identity captured at mount.
 * @returns Cleanup for a pending availability observation, when one is needed.
 * @throws Propagates reconciliation and subscription failures.
 */
function attachLabelSession(
  options: EditableLabelSessionOptions,
  state: EditableLabelSessionState,
  identity: RegionIdentity,
): (() => void) | undefined {
  const entering = options.editing && !state.editingSession.current;
  state.editingSession.current = options.editing;
  if (entering) {
    state.needsSeed.current = true;
    state.needsFocus.current = true;
    state.draft.current = options.text;
  }
  const context: EditableLabelReconciliation = {
    options,
    state,
    identity,
    point: state.pendingCaret.current ?? options.focusPointRef?.current ?? null,
    placed: false,
    placing: false,
  };
  if (reconcileLabel(context)) {
    return;
  }
  return observeLabelAvailability(context);
}

/**
 * Reconciles label text and focus once the matching occurrence is available.
 *
 * Reentrant availability notifications cannot start a second focus request.
 *
 * @param context - Captured identity, label state, and current effect state.
 * @returns Whether the text and pending focus have been applied.
 * @throws Propagates Root, focus, and browser selection failures.
 */
function reconcileLabel(context: EditableLabelReconciliation): boolean {
  if (context.placed || context.placing) {
    return context.placed;
  }
  context.placing = true;
  try {
    return applyLabelSession(context);
  } finally {
    context.placing = false;
  }
}

/**
 * Seeds owned text and applies the pending focus request when possible.
 *
 * @param context - Current label identity, text, and pending focus state.
 * @returns True once the current work is complete; false while its Root is unavailable.
 * @throws Propagates Root text, focus, and selection failures.
 */
function applyLabelSession(context: EditableLabelReconciliation): boolean {
  const { options, state, identity, point } = context;
  const target = captureLabelText(options.reactPanel, identity);
  if (!target) {
    return false;
  }
  if (!options.editing || state.needsSeed.current) {
    // Seed once per session. Rewriting on later renders would drop typed `\n`.
    if (!target.synchronize(options.text, false)) {
      return false;
    }
    state.needsSeed.current = false;
    if (!options.editing) {
      state.draft.current = options.text;
      return true;
    }
  }
  if (!point && !state.needsFocus.current) {
    return true;
  }
  if (!focusLabel(options.reactPanel, identity, point)) {
    return false;
  }
  context.placed = true;
  state.needsFocus.current = false;
  state.pendingCaret.current = null;
  if (options.focusPointRef) {
    options.focusPointRef.current = null;
  }
  return true;
}

/**
 * Releases the availability observation once pending label work succeeds.
 *
 * @param context - Current label reconciliation and panel subscription owner.
 * @returns Cleanup for a pending observation, or undefined when work completed during setup.
 * @throws Propagates reconciliation and subscription cleanup failures.
 */
function observeLabelAvailability(context: EditableLabelReconciliation): (() => void) | undefined {
  let release: (() => void) | undefined;
  let complete = false;
  /**
   * Retries label reconciliation and releases an installed observation on success.
   *
   * @returns Text and focus are reconciled when the owning Root is available.
   * @throws Propagates reconciliation and subscription cleanup failures.
   */
  const reconcileAndRelease = () => {
    if (reconcileLabel(context)) {
      complete = true;
      release?.();
      release = undefined;
    }
  };
  release = context.options.reactPanel.subscribeAvailability(reconcileAndRelease);
  reconcileAndRelease();
  if (complete) {
    release?.();
    return;
  }
  return () => release?.();
}

/**
 * Focuses the owned label and optionally places its caret at a viewport point.
 *
 * Each replacement Root can be tried once during the same synchronous request.
 *
 * @param panel - Panel exposing its current mounted and input Roots.
 * @param identity - Opaque identity captured at the React mounting boundary.
 * @param point - Viewport caret point, or null to focus without positioning.
 * @returns True when the current occurrence accepted the request.
 * @throws Propagates Root, focus, and selection failures.
 */
function focusLabel(
  panel: EditableLabelSessionOptions["reactPanel"],
  identity: RegionIdentity,
  point: EditableLabelFocusPoint | null,
): boolean {
  const attempted = new Set<object>();
  while (true) {
    const root = panel.inputRoot;
    if (!root || attempted.has(root)) {
      return false;
    }
    attempted.add(root);
    if (!point) {
      const focused = root.focusRegionByIdentity(identity, PANEL_SELECTOR);
      if (!root.isAttached() || panel.inputRoot !== root) {
        continue;
      }
      return focused;
    }
    const target = captureLabelText(panel, identity);
    const region = target?.isCurrent() ? root.captureRegionByIdentity(identity) : undefined;
    if (!target || !region) {
      if (panel.inputRoot !== root) {
        continue;
      }
      return false;
    }
    region.placeCaretAtPoint(point.x, point.y);
    if (target.isCurrent() && root.isAttached() && panel.inputRoot === root) {
      return true;
    }
  }
}
