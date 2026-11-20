import type { PresetDragSubscriptions } from "./types";
import { collectPresetCleanupFailures } from "./preset-drag-cleanup";

/**
 * Connects toolbar placement to keyboard, panel and tool-session cancellation.
 *
 * @param tools - Borrowed subscriptions for the current surface.
 * @param cancel - Cancels placement and releases its browser resources.
 * @param isActive - Reports whether a toolbar gesture exists.
 * @param onToolChange - Cancels when the session switches away from the captured tool.
 * @returns Disposer attempting every subscription cleanup and gesture cancellation.
 * @throws If setup or cleanup fails; failed setup rollback retains every failure.
 */
export function subscribePresetDrag(
  tools: PresetDragSubscriptions,
  cancel: () => boolean,
  isActive: () => boolean,
  onToolChange: () => void,
): () => void {
  const releases: Array<() => void> = [];
  try {
    releases.push(
      tools.reactPanel.keyboard.register(
        {
          id: "edgeless.preset-drag-cancel",
          keys: ["Escape"],
          mode: "edgeless",
          priority: 50,
          when: isActive,
        },
        cancel,
      ),
    );
    releases.push(tools.reactPanel.subscribeDeactivation(cancel));
    releases.push(tools.subscribe(onToolChange));
  } catch (error) {
    const failures = collectPresetCleanupFailures(releases);
    if (failures.length) {
      throw new AggregateError([error, ...failures], "Preset drag setup failed");
    }
    throw error;
  }
  let active = true;
  return () => {
    if (!active) {
      return;
    }
    active = false;
    const failures = collectPresetCleanupFailures([...releases, cancel]);
    if (failures.length) {
      throw new AggregateError(failures, "Preset drag cleanup failed");
    }
  };
}
