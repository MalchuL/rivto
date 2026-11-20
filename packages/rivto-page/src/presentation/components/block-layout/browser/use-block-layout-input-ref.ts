import { useMemo } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { BlockRegionEventsApi } from "../../../../editor/events/types";
import type { BlockLayoutInputBinding } from "../types";

/**
 * Composes a mounted layout registration with optional normalized input binding.
 *
 * Input is installed only when requested. Replacement and unmount release the
 * previous binding before forwarding the ref change to layout ownership.
 *
 * @param mount - Existing layout-region ref, including its forwarded ref cleanup.
 * @param events - Region input registration borrowed from the editor.
 * @param bindInput - Optional callback installing subscriptions for one layout region.
 * @returns A commit ref that retains no native element after the callback returns.
 * @throws Propagates binding, registration, forwarded-ref, and cleanup failures.
 */
export function useBlockLayoutInputRef(
  mount: (element: HTMLDivElement | null) => void,
  events: Pick<BlockRegionEventsApi, "observeRegion">,
  bindInput?: BlockLayoutInputBinding,
): (element: HTMLDivElement | null) => void {
  return useMemo(
    () => (bindInput ? createBlockLayoutInputRef(mount, events, bindInput) : mount),
    [bindInput, events, mount],
  );
}

/**
 * Composes a mounted region ref with one normalized input binding.
 *
 * Registration runs only after mount succeeds. Cleanup is attempted before
 * withdrawing the mounted region, and both failures are retained when needed.
 * A reentrant replacement keeps its own binding; cleanup returned by an older
 * setup is released instead of overwriting the replacement.
 *
 * @param mount - Existing layout-region ref, including forwarded ref cleanup.
 * @param events - Region input registration borrowed from the editor.
 * @param bindInput - Callback installing subscriptions for one layout region.
 * @returns A commit ref that retains no native element after delivery.
 * @throws Propagates binding, registration, forwarded-ref, and cleanup failures.
 */
export function createBlockLayoutInputRef(
  mount: (element: HTMLDivElement | null) => void,
  events: Pick<BlockRegionEventsApi, "observeRegion">,
  bindInput: BlockLayoutInputBinding,
): (element: HTMLDivElement | null) => void {
  let release: (() => void) | undefined;
  let generation = 0;
  return (element) => {
    const current = ++generation;
    const errors: unknown[] = [];
    const previous = release;
    release = undefined;
    try {
      previous?.();
    } catch (error) {
      errors.push(error);
    }
    if (generation !== current) {
      throwBlockLayoutInputErrors(errors);
      return;
    }
    const attach = Boolean(element && !errors.length);
    try {
      mount(attach ? element : null);
      if (generation === current && element && attach) {
        const cleanup = bindInput(getBrowserElementIdentity(element), events);
        if (generation === current) {
          release = cleanup;
        } else {
          cleanup();
        }
      }
    } catch (error) {
      errors.push(error);
      if (attach && generation === current) {
        try {
          mount(null);
        } catch (cleanupError) {
          errors.push(cleanupError);
        }
      }
    }
    throwBlockLayoutInputErrors(errors);
  };
}

/**
 * Reports input binding failures without discarding cleanup errors.
 *
 * @param errors - Failures collected while updating one mounted binding.
 * @returns All applicable binding work completed when no failures were collected.
 * @throws The original failure or an AggregateError when multiple operations fail.
 */
function throwBlockLayoutInputErrors(errors: readonly unknown[]): void {
  if (errors.length === 1) {
    throw errors[0];
  }
  if (errors.length > 1) {
    throw new AggregateError(errors, "Block layout input binding failed");
  }
}
