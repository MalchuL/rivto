import { useId, useLayoutEffect } from "react";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { presetToolForTarget } from "./preset-tool-target";
import type { PresetInputViewport } from "./types";

/**
 * Prevents pointer clicks from activating a preset again after its gesture ends.
 *
 * Keyboard-generated clicks retain shared toolbar activation. Disabled buttons
 * and non-placement tools are ignored. Root capture runs before React's click
 * handler so its shared activation observes the native default-prevented state.
 *
 * @param viewport - Borrowed viewport input observation, or null before mounting.
 * @param tools - Surface session resolving registered tool identities.
 * @returns The observation remains installed until dependencies change or unmount.
 * @throws If Root registration fails.
 */
export function usePresetClick(
  viewport: PresetInputViewport | null,
  tools: Pick<EdgelessToolContext, "getTool">,
): void {
  const id = useId();
  useLayoutEffect(() => {
    if (!viewport) {
      return;
    }
    return viewport.events.observe(
      { id: `edgeless.preset.click.${id}`, type: "click", capture: true },
      (input) => {
        if (input.detail > 0 && presetToolForTarget(input.target, tools)) {
          input.preventDefault();
        }
      },
    );
  }, [viewport, tools, id]);
}
