import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import type { InputRegion, InputRoot, LineOverlay } from "@chulane/rivto-root";
import type { BlockDropIndicator, ResolvedBlockDropTarget } from "./types";

/** Owns one occurrence's inert insertion line and current target outline. */
export class BlockDropFeedback {
  private target: InputRegion | undefined;
  private targetValue: string | undefined;
  private releaseTarget: (() => void) | undefined;
  private readonly line: LineOverlay;

  /**
   * Borrows an occurrence capability used to display viewport-positioned feedback.
   *
   * @param root - Feedback attachment; the caller clears feedback before releasing it.
   */
  constructor(root: Pick<InputRoot, "createLineOverlay">) {
    this.line = root.createLineOverlay({
      className: BLOCK_EDITOR_CLASSES.dropLine,
      thickness: "var(--rivto-drop-indicator-thickness, 4px)",
    });
  }

  /**
   * Displays geometry already validated and measured by the gesture owner.
   *
   * Geometry was already read before these feedback writes. The line never receives
   * input, participates in model selection, or measures mounted blocks independently.
   * Boundary geometry keeps its insertion line, including an inside destination
   * proposed by an indented edge or gap. Body/background inside regions have no
   * line and outline their receiving hierarchy. No model or geometry reads occur here.
   * Undefined targets hide the retained line and release the old outline.
   * The resolver supplies the complete receiving hierarchy as an outline region,
   * so header and child-list backgrounds share their declared hierarchy frame.
   * Without an explicit outline region the target's own anchor is painted.
   * Feedback never searches ancestors, compares IDs or infers editor ownership.
   *
   * @param target - Permitted current target, or undefined when none is available.
   * @returns Feedback reflects the supplied target until the next update or clear.
   * @throws Root ownership or browser write failures; the owner must still attempt clear.
   */
  update(target?: ResolvedBlockDropTarget): void {
    const outline = target?.destination.kind === "inside" && !target.indicator;
    const region = outline ? (target.outline ?? target.anchor) : target?.anchor;
    const value = outline ? "true" : "between";
    if (this.target && (!region || !this.target.isSame(region) || value !== this.targetValue)) {
      this.releaseTarget?.();
      this.target = undefined;
      this.targetValue = undefined;
      this.releaseTarget = undefined;
    }
    if (!this.updateLine(target?.indicator)) {
      this.clear();
      return;
    }
    if (region && !this.target) {
      this.releaseTarget = region.setTemporaryAttribute("data-block-drop-active", value);
      this.target = region;
      this.targetValue = value;
    }
    if (this.target && !this.line.isCurrent()) {
      this.clear();
    }
  }

  /**
   * Releases every owned feedback node and attribute, even if one DOM cleanup fails.
   *
   * @returns Feedback references are cleared; repeated cleanup is harmless.
   * @throws A cleanup failure, or AggregateError when several cleanup operations fail.
   */
  clear(): void {
    const releaseTarget = this.releaseTarget;
    const line = this.line;
    this.target = undefined;
    this.targetValue = undefined;
    this.releaseTarget = undefined;
    const errors: unknown[] = [];
    for (const release of [() => releaseTarget?.(), () => line.remove()]) {
      try {
        release();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Block drop feedback cleanup failed");
    }
  }

  /**
   * Updates one retained line without remeasuring its target.
   *
   * Resolvers supply a two-pixel geometry axis. CSS paints the configurable legacy
   * thickness around that same center, keeping layout-independent hit geometry.
   *
   * @param rect - Viewport rectangle, or undefined to hide the line.
   * @returns True when the occurrence accepted the line update; false after ownership loss or cancellation.
   * @throws Propagates occurrence ownership and browser update failures.
   */
  private updateLine(rect?: BlockDropIndicator): boolean {
    return this.line.update(
      rect && {
        x: rect.left,
        y: rect.top,
        length: rect.height === 2 ? rect.width : rect.height,
        orientation: rect.height === 2 ? "horizontal" : "vertical",
      },
    );
  }
}
