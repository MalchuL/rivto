import { useContext, useEffect, useRef } from "react";
import type { PointerEvent, RefObject } from "react";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { DragHandleClick, DragHandleTracking } from "./types";
import { trackHandlePointer } from "./track-handle-pointer";
import {
  BlockEditorContext,
  BlockEditorInputRootContext,
} from "../../components/block-editor/block-editor-context";

/**
 * Remembers whether a handle press reached the configured distance from its origin.
 *
 * Returning to the origin does not restore click eligibility. A new primary press
 * resets the decision. Observers exist only during that press and are released on
 * threshold crossing, release, cancellation, window blur or component unmount.
 *
 * @param threshold - Finite positive maximum click excursion in viewport CSS pixels.
 * @returns Local pointer tracking and a navigation eligibility check; no click is cancelled.
 * @throws RangeError when the threshold is not finite and positive.
 */
export function useDragHandleClick(threshold: number): DragHandleClick {
  const editor = useContext(BlockEditorContext);
  const occurrence = useContext(BlockEditorInputRootContext);
  const exceeded = useRef(false);
  const tracking = useRef<DragHandleTracking | undefined>(undefined);
  useEffect(
    () => () => {
      if (tracking.current && tracking.current.occurrence === occurrence) {
        const previous = tracking.current;
        tracking.current = undefined;
        previous.release();
      }
    },
    [occurrence],
  );
  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new RangeError("Handle click movement threshold must be finite and positive");
  }
  return {
    /**
     * Captures one primary press without preventing drag activation or native defaults.
     *
     * @param event - Press on the handle; secondary and unrelated pointers are ignored.
     * @returns Previous observation is released and this press starts with click eligibility.
     */
    onPointerDown(event) {
      startHandlePointer(event, threshold, Boolean(editor), occurrence, tracking, exceeded);
    },
    /**
     * Reads this handle's pointer decision without affecting any other control.
     *
     * @param detail - Native click count; keyboard and programmatic clicks use zero.
     * @returns True for keyboard activation or a press that stayed below the threshold.
     */
    allowsClick(detail) {
      return detail === 0 || !exceeded.current;
    },
  };
}

/**
 * Starts tracking a primary handle press against its current occurrence.
 *
 * A standalone handle owns a temporary Root; an editor-mounted handle borrows
 * its occurrence and declines a press while that occurrence is unavailable.
 *
 * @param event - Pointer press delivered to the mounted handle.
 * @param threshold - Positive maximum click excursion in CSS pixels.
 * @param hasEditor - Whether an editor is responsible for supplying an occurrence.
 * @param occurrence - Current borrowed occurrence, when available.
 * @param tracking - Retains the current press and its disposer.
 * @param exceeded - Retains the click decision for this press.
 * @returns A primary press is tracked until release or cancellation.
 * @throws Propagates observation setup or cleanup failures.
 */
function startHandlePointer(
  event: PointerEvent<HTMLButtonElement>,
  threshold: number,
  hasEditor: boolean,
  occurrence: DragHandleTracking["occurrence"],
  tracking: RefObject<DragHandleTracking | undefined>,
  exceeded: RefObject<boolean>,
): void {
  if (event.button !== 0 || !event.isPrimary) {
    return;
  }
  const previous = tracking.current;
  tracking.current = undefined;
  previous?.release();
  if (tracking.current) {
    return;
  }
  exceeded.current = false;
  const ownedRoot = hasEditor || occurrence ? undefined : new BrowserInputRoot(event.currentTarget);
  const root = occurrence ?? ownedRoot;
  if (!root?.isAttached()) {
    ownedRoot?.detach();
    exceeded.current = true;
    return;
  }
  const release = trackHandlePointer(
    root,
    { pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY },
    threshold,
    () => {
      exceeded.current = true;
    },
    ownedRoot ? () => ownedRoot.detach() : undefined,
  );
  if (tracking.current) {
    release();
  } else {
    tracking.current = { occurrence, release };
  }
}
