import type { InputRoot } from "@chulane/rivto-root";
import type { EdgelessTool } from "../../../managers/edgeless-tools/edgeless-tool";

/**
 * Publishes tool state on one occurrence and restores prior marker values on release.
 *
 * Each marker is owned independently by Root, so a later occurrence or owner is
 * not overwritten when this registration is released. Partial setup is rolled
 * back if a marker update fails or the occurrence detaches.
 *
 * @param root - Borrowed occurrence that owns these temporary attributes.
 * @param tool - Current tool, or undefined when no tool is active.
 * @returns Idempotent release of the markers installed by this call.
 * @throws Propagates marker update and cleanup failures.
 */
export function markVisualTool(
  root: Pick<InputRoot, "isAttached" | "setTemporaryAttribute">,
  tool: Pick<EdgelessTool, "id" | "pansViewport" | "capturesPointer"> | undefined,
): () => void {
  const releases: (() => void)[] = [];
  /**
   * Restores all installed attributes, even if one restoration fails.
   *
   * @returns All installed markers have been released.
   * @throws AggregateError when any restoration fails.
   */
  const release = (): void => {
    const errors: unknown[] = [];
    for (const restore of releases.splice(0).reverse()) {
      try {
        restore();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Tool marker cleanup failed");
    }
  };
  try {
    for (const [name, value] of [
      ["data-edgeless-tool", tool?.id ?? ""],
      ["data-edgeless-pan-tool", String(tool?.pansViewport ?? false)],
      ["data-edgeless-capture-tool", String(tool?.capturesPointer ?? false)],
    ] as const) {
      if (!root.isAttached()) {
        release();
        return release;
      }
      releases.push(root.setTemporaryAttribute(name, value));
    }
    if (!root.isAttached()) {
      release();
    }
    return release;
  } catch (error) {
    try {
      release();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], "Tool marker setup failed");
    }
    throw error;
  }
}
