import { useContext } from "react";
import { ReactPanelContext } from "../../components/editor-panel/react-panel-context";
import type { AnimationDurations } from "../../editor/types";

/**
 * Reads one configured duration from the nearest editor occurrence.
 *
 * @param name - Animation whose duration is requested.
 * @returns Duration in seconds, or zero when no editor or value is configured.
 */
export function useAnimationDuration(name: keyof AnimationDurations): number {
  return useContext(ReactPanelContext)?.reactPanel.editor.animations?.[name] ?? 0;
}
