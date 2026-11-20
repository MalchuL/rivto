import type { BentoResizeStart } from "../types";
import type { PointerInput } from "@chulane/rivto-root";

/** Borrowed test gesture capabilities and their attachment cleanup. */
export interface ResizeTestInput {
  readonly start: BentoResizeStart;
  /**
   * Dispatches a fixture pointer event through the attached Root listener.
   *
   * @param event - Pointer-down or pointer-move event for the separator.
   * @returns The normalized input captured during dispatch.
   * @throws If the event type is unsupported or the listener receives no input.
   */
  capturePointer(event: MouseEvent): PointerInput;
  /**
   * Detaches the test separator and invalidates its capabilities.
   *
   * @returns Fixture listener resources are released.
   */
  detach(): void;
}
