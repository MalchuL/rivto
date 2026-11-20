import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import {
  captureBentoResizePlacement,
  observeBentoResizeCancellation,
} from "../browser/bento-resize-input";
import { BENTO_TILE_ITEM_CLASS } from "../bento-constants";
import type { ResizeTestInput } from "./types";
import type { PointerInput } from "@chulane/rivto-root";

/**
 * Creates a separator attachment for direct resize-controller tests.
 *
 * @param handle - Fixture separator receiving pointer capture and feedback.
 * @returns Gesture capabilities and cleanup for the exact test attachment.
 */
export function createResizeTestInput(handle: HTMLElement): ResizeTestInput {
  let active = true;
  const input = new BrowserInputRoot(handle, () => active);
  const feedback = input.captureRegionByIdentity(getBrowserElementIdentity(handle));
  if (!feedback) {
    throw new Error("Resize fixture cannot capture its separator");
  }
  const pointer = attachTestPointer(handle, input);
  let root: BrowserInputRoot | undefined;
  return {
    start: {
      feedback,
      /**
       * Captures the fixture's current tile and lane through its test Root.
       *
       * @returns Placement regions, or undefined before attachment or after cleanup.
       */
      get placement() {
        const lane = handle.closest(`.${BENTO_TILE_ITEM_CLASS}`)?.parentElement;
        if (!active || !lane) {
          return undefined;
        }
        root ??= new BrowserInputRoot(lane);
        const separator = root.captureRegionByIdentity(
          getBrowserElementIdentity(handle),
          () => active,
        );
        return separator ? captureBentoResizePlacement(separator) : undefined;
      },
      subscribeCancellation: (cancel) => {
        if (!root) {
          throw new Error("Resize fixture has no Root");
        }
        return observeBentoResizeCancellation(root, cancel);
      },
    },
    capturePointer: pointer.capturePointer,
    /**
     * Releases the fixture's listener attachment and invalidates its region.
     *
     * @returns Later gesture operations cannot address this fixture attachment.
     */
    detach: () => {
      active = false;
      pointer.detach();
      input.detach();
      root?.detach();
    },
  };
}

/**
 * Captures pointer input through observers retained for the fixture lifetime.
 *
 * Retaining the observers lets a captured input acquire pointer capture after
 * its synchronous dispatch completes.
 *
 * @param handle - Separator receiving fixture pointer events.
 * @param root - Root supplying normalized input for the separator.
 * @returns Pointer capture helper and cleanup for its observers.
 * @throws If observer installation fails.
 */
function attachTestPointer(
  handle: HTMLElement,
  root: BrowserInputRoot,
): Pick<ResizeTestInput, "capturePointer" | "detach"> {
  let captured: PointerInput | undefined;
  const record = (value: PointerInput) => {
    captured = value;
  };
  const down = root.observeInput("pointerdown", record);
  let move: (() => void) | undefined;
  try {
    move = root.observeInput("pointermove", record);
  } catch (error) {
    try {
      down?.();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Resize fixture setup failed");
    }
    throw error;
  }
  return {
    /**
     * Captures normalized input from one pointer-down or pointer-move dispatch.
     *
     * @param event - Pointer event dispatched to the separator.
     * @returns Input produced for this exact dispatch.
     * @throws If the type is unsupported or the listener does not receive input.
     */
    capturePointer(event) {
      if (event.type !== "pointerdown" && event.type !== "pointermove") {
        throw new Error("Expected a pointer-down or pointer-move event");
      }
      captured = undefined;
      handle.dispatchEvent(event);
      if (!captured) {
        throw new Error("Pointer input was not delivered");
      }
      return captured;
    },
    /**
     * Removes the pointer observers retained by this fixture.
     *
     * @returns Both normalized input registrations are released.
     */
    detach() {
      down?.();
      move?.();
    },
  };
}
