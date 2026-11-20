import { useCallback, useLayoutEffect, useRef } from "react";
import type { PointerInput, RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { ConnectorEndpointKey, ConnectorEndpointRefs, ConnectorInteraction } from "./types";

/**
 * Connects mounted endpoint buttons to the current panel's normalized input.
 *
 * Listener and pointer cleanup belong to the exact Root attachment; a replaced
 * or disabled panel cancels the current gesture before another Root is attached.
 *
 * @param inputRoot - Borrowed Root for the currently available panel occurrence.
 * @param selected - Whether the endpoint buttons are mounted.
 * @param onInput - Receives pointer input for the corresponding endpoint.
 * @param onDetach - Cancels any gesture when the attachment is released.
 * @returns Refs assigned to the source and target buttons at the mounting boundary.
 * @throws Propagates listener setup, cleanup, and ownership failures.
 */
export function useConnectorEndpointInput(
  inputRoot: ConnectorInteraction["inputRoot"],
  selected: boolean,
  onInput: (key: ConnectorEndpointKey, input: PointerInput) => void,
  onDetach: () => void,
): ConnectorEndpointRefs {
  const source = useRef<RegionIdentity | undefined>(undefined);
  const target = useRef<RegionIdentity | undefined>(undefined);
  /**
   * Captures the source button's identity while React mounts it.
   *
   * @param button - Mounted source button, or null after removal.
   * @returns The source identity reflects the current mount.
   */
  const sourceRef = useCallback((button: HTMLButtonElement | null) => {
    source.current = button ? getBrowserElementIdentity(button) : undefined;
  }, []);
  /**
   * Captures the target button's identity while React mounts it.
   *
   * @param button - Mounted target button, or null after removal.
   * @returns The target identity reflects the current mount.
   */
  const targetRef = useCallback((button: HTMLButtonElement | null) => {
    target.current = button ? getBrowserElementIdentity(button) : undefined;
  }, []);
  const callbacks = useRef({ onInput, onDetach });
  callbacks.current = { onInput, onDetach };
  useLayoutEffect(() => {
    if (!selected || !inputRoot?.isAttached()) {
      return;
    }
    const releases: Array<() => void> = [];
    let active = true;
    /**
     * Cancels the gesture and releases every listener for this attachment.
     *
     * @returns Each retained resource has been offered cleanup once.
     * @throws AggregateError when one or more resources fail to release.
     */
    const cleanup = () => {
      if (!active) {
        return;
      }
      active = false;
      const errors: unknown[] = [];
      for (const release of [() => callbacks.current.onDetach(), ...releases]) {
        try {
          release();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length) {
        throw new AggregateError(errors, "Connector input cleanup failed");
      }
    };
    try {
      for (const [key, ref] of [
        ["source", source],
        ["target", target],
      ] as const) {
        if (!ref.current) {
          continue;
        }
        const region = inputRoot.captureRegionByIdentity(ref.current);
        if (!region) {
          continue;
        }
        for (const type of [
          "pointerdown",
          "pointermove",
          "pointerup",
          "pointercancel",
          "lostpointercapture",
        ] as const) {
          const release = region.observeInput(type, "bubble", (input) => {
            if (active && inputRoot.isAttached()) {
              callbacks.current.onInput(key, input);
            }
          });
          if (release) {
            releases.push(release);
          }
        }
      }
    } catch (error) {
      try {
        cleanup();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Connector input setup failed");
      }
      throw error;
    }
    return cleanup;
  }, [inputRoot, selected]);
  return { source: sourceRef, target: targetRef };
}
