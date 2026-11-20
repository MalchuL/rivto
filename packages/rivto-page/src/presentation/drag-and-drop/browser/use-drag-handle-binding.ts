import { useMemo } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { DragHandleBinding } from "../types";

/**
 * Binds an opaque handle identity for exactly one committed button lifetime.
 *
 * A replaced binding releases its old resources before receiving the new mount.
 * The returned ref retains no native button after the callback returns.
 *
 * @param bindHandle - Optional registration owned by the handle's consumer.
 * @returns A commit ref, or undefined when no binding is requested.
 * @throws Propagates binding and cleanup failures.
 */
export function useDragHandleBinding(
  bindHandle: DragHandleBinding | undefined,
): ((element: HTMLButtonElement | null) => void) | undefined {
  return useMemo(() => {
    if (!bindHandle) {
      return undefined;
    }
    let release: (() => void) | undefined;
    return (element) => {
      const previous = release;
      release = undefined;
      previous?.();
      if (element) {
        release = bindHandle(getBrowserElementIdentity(element));
      }
    };
  }, [bindHandle]);
}
