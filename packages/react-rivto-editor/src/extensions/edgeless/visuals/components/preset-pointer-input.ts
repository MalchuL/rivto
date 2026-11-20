import type { PointerInput } from "@chulane/rivto-root";
import type { PresetPointerStart } from "../hooks/types";
import { PRESET_BUTTON_SELECTOR } from "./markers";

/**
 * Adapts normalized Root input to one toolbar preset gesture.
 *
 * Pointer capture remains bound to the original input target; preview creation
 * is supplied separately by the mounted toolbar's browser owner.
 *
 * @param input - Root-normalized pointer-down delivery.
 * @param createPreview - Mounts preview operations in the toolbar's document.
 * @returns Detached pointer values and capture and preview capabilities.
 */
export function presetPointerStart(
  input: PointerInput,
  createPreview: PresetPointerStart["createPreview"],
): PresetPointerStart {
  return {
    clientX: input.clientX,
    clientY: input.clientY,
    pointerId: input.pointerId,
    button: input.button,
    shiftKey: input.shiftKey,
    altKey: input.altKey,
    /**
     * Captures the originating pointer on the owned toolbar button.
     *
     * @returns Capture release, or undefined if the originating target is unavailable.
     * @throws If selector evaluation or browser pointer capture fails.
     */
    capture() {
      return input.captureTargetPointer(PRESET_BUTTON_SELECTOR);
    },
    createPreview,
  };
}
