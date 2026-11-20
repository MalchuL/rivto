import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import type { RefObject } from "react";
import type { BrowserInputMap, InputRegion, InputRoot } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { ReactPanelSurfaceApi } from "../../panels/types";
import type { RectangleRadiusInputHandlers } from "./types";

/**
 * Binds the mounted radius handle to the current panel's normalized input.
 *
 * The captured region and its listeners belong to one Root attachment. Replacing
 * that Root or unmounting the handle cancels its current gesture and subscriptions.
 *
 * @param panel - Borrowed panel availability and current input Root.
 * @param mounted - Whether the radius handle is rendered.
 * @param handlers - Rectangle policy for input and cancellation.
 * @returns React ref assigned to the SVG handle at the mounting boundary.
 * @throws Propagates listener setup and cleanup failures.
 */
export function useRectangleRadiusInput(
  panel: Pick<ReactPanelSurfaceApi, "inputRoot" | "subscribeAvailability">,
  mounted: boolean,
  handlers: RectangleRadiusInputHandlers,
): RefObject<SVGCircleElement | null> {
  const handle = useRef<SVGCircleElement>(null);
  const current = useRef(handlers);
  current.current = handlers;
  const root = useSyncExternalStore(
    panel.subscribeAvailability,
    () => panel.inputRoot,
    () => undefined,
  );
  useLayoutEffect(() => {
    if (!mounted || !root?.isAttached() || !handle.current) {
      return;
    }
    const region = root.captureRegionByIdentity(getBrowserElementIdentity(handle.current));
    if (region) {
      return new RectangleRadiusInputBinding(panel, root, region, current).attach();
    }
  }, [panel, root, mounted]);
  return handle;
}

/** Owns the input subscriptions of one captured rectangle handle. */
class RectangleRadiusInputBinding {
  private readonly releases: Array<() => void> = [];
  private active = true;

  /**
   * Borrows the handle, its exact Root, and the latest renderer policy.
   *
   * @param panel - Panel whose current Root determines eligibility.
   * @param root - Exact occurrence that owns this attachment.
   * @param region - Captured radius handle within the occurrence.
   * @param handlers - Current render's radius input policy.
   */
  constructor(
    private readonly panel: Pick<ReactPanelSurfaceApi, "inputRoot">,
    private readonly root: Pick<InputRoot, "isAttached">,
    private readonly region: Pick<InputRegion, "observeInput" | "clientToSvgPoint">,
    private readonly handlers: RefObject<RectangleRadiusInputHandlers>,
  ) {}

  /**
   * Installs normalized handle input and rolls back partial setup on failure.
   *
   * @returns Idempotent cleanup for this attachment and its active gesture.
   * @throws Propagates listener setup and cleanup failures.
   */
  attach(): () => void {
    try {
      for (const type of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "lostpointercapture",
      ] as const) {
        this.observe(type, (input) => this.handlers.current.onPointer(input, this.region));
      }
      this.observe("keydown", (input) => this.handlers.current.onKey(input));
      this.observe("focusout", () => this.handlers.current.cancel());
      this.observe("dblclick", (input) => input.stopPropagation());
    } catch (error) {
      try {
        this.release();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Rectangle radius input setup failed");
      }
      throw error;
    }
    return () => this.release();
  }

  /**
   * Releases the gesture and every retained listener for this attachment.
   *
   * @returns Each resource has been offered cleanup once.
   * @throws AggregateError when cleanup fails.
   */
  release(): void {
    if (!this.active) {
      return;
    }
    this.active = false;
    const errors: unknown[] = [];
    for (const release of [() => this.handlers.current.cancel(), ...this.releases]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Rectangle radius input cleanup failed");
    }
  }

  /**
   * Subscribes one input while the captured panel Root remains current.
   *
   * @param type - Normalized input delivered to the handle.
   * @param deliver - Rectangle callback for that input.
   * @returns Its disposer is retained until attachment cleanup.
   * @throws Propagates listener setup failures.
   */
  private observe<K extends keyof BrowserInputMap>(
    type: K,
    deliver: (input: BrowserInputMap[K]) => void,
  ): void {
    const release = this.region.observeInput(type, "bubble", (input) => {
      if (this.active && this.panel.inputRoot === this.root && this.root.isAttached()) {
        deliver(input);
      }
    });
    if (release) {
      this.releases.push(release);
    }
  }
}
