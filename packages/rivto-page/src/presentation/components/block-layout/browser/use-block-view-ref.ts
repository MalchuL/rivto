import { useMemo, type ForwardedRef } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { RegionIdentity } from "@chulane/rivto-root";
import type { BlockRegionEventsApi } from "../../../../editor/events/types";
import type { BlockLayoutInputBinding } from "../types";
import { createBlockLayoutInputRef } from "./use-block-layout-input-ref";

/**
 * Forwards an opaque shell identity and optionally binds normalized input.
 *
 * Native elements remain within this commit callback. Forwarded callback cleanup
 * is retained and runs on replacement or unmount before a new identity is sent.
 *
 * @param forwarded - Caller ref receiving the mounted shell identity.
 * @param events - Region registration available inside an editor, if any.
 * @param bindInput - Optional normalized input binding for this mounted shell.
 * @returns Browser ref for the shell element, or undefined when no binding is needed.
 * @throws If input is bound outside an editor, or registration or cleanup fails.
 */
export function useBlockViewRef(
  forwarded: ForwardedRef<RegionIdentity>,
  events: Pick<BlockRegionEventsApi, "observeRegion"> | undefined,
  bindInput: BlockLayoutInputBinding | undefined,
): ((element: HTMLDivElement | null) => void) | undefined {
  return useMemo(() => {
    if (bindInput && !events) {
      throw new Error("BlockView input requires a BlockEditor");
    }
    if (!forwarded && !bindInput) {
      return undefined;
    }
    let cleanup: unknown;
    let generation = 0;
    const mount = (element: HTMLDivElement | null) => {
      const current = ++generation;
      const previous = cleanup;
      cleanup = undefined;
      if (typeof previous === "function") {
        previous();
      }
      if (generation !== current) {
        return;
      }
      if (typeof forwarded === "function") {
        if (element || typeof previous !== "function") {
          const next: unknown = forwarded(element ? getBrowserElementIdentity(element) : null);
          if (generation === current) {
            cleanup = next;
          } else if (typeof next === "function") {
            next();
          }
        }
      } else if (forwarded) {
        forwarded.current = element ? getBrowserElementIdentity(element) : null;
      }
    };
    return bindInput && events ? createBlockLayoutInputRef(mount, events, bindInput) : mount;
  }, [forwarded, events, bindInput]);
}
