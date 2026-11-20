import { useId, useLayoutEffect } from "react";
import type { EdgelessToolContext } from "../../../../managers/edgeless-tools/edgeless-tool-context";
import { presetPointerStart } from "../components/preset-pointer-input";
import { usePresetPreviewFactory } from "./browser/use-preset-preview-factory";
import { presetToolForTarget } from "./preset-tool-target";
import type { PresetInputViewport, StartPresetDrag } from "./types";

/**
 * Observes preset pointer starts on the mounted toolbar through Root input.
 *
 * Disabled buttons and unavailable or non-placement tools are ignored. The
 * preview remains bound to the toolbar document captured by the start delivery.
 *
 * @param viewport - Borrowed viewport input observation, or null before mounting.
 * @param tools - Surface session resolving registered tool identities.
 * @param start - Begins the selected tool's normalized placement gesture.
 * @returns The observation remains installed until its dependencies change or unmount.
 * @throws If Root registration fails.
 */
export function usePresetStart(
  viewport: PresetInputViewport | null,
  tools: Pick<EdgelessToolContext, "getTool">,
  start: StartPresetDrag,
): void {
  const id = useId();
  const capturePreview = usePresetPreviewFactory();
  useLayoutEffect(() => {
    if (!viewport) {
      return;
    }
    return viewport.events.observe(
      { id: `edgeless.toolbar.${id}`, type: "pointerdown" },
      (input) => {
        const tool = presetToolForTarget(input.target, tools);
        const createPreview = tool && capturePreview(tool.id);
        if (!tool || !createPreview) {
          return;
        }
        start(presetPointerStart(input, createPreview), tool);
      },
    );
  }, [viewport, tools, capturePreview, start, id]);
}
