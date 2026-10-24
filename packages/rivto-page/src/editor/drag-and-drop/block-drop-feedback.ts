import { BLOCK_EDITOR_CLASSES } from "../../presentation/block-editor-classes";
import type { BlockDropIndicator, ResolvedBlockDropTarget } from "./types";

/** Owns one occurrence's inert insertion line and current target outline. */
export class BlockDropFeedback {
  private target: ResolvedBlockDropTarget | undefined;
  private line: HTMLElement | undefined;

  /**
   * Borrows the mounted root used to display viewport-positioned feedback.
   *
   * @param root - Feedback attachment; the caller clears feedback before releasing it.
   */
  constructor(private readonly root: HTMLElement) {}

  /**
   * Displays geometry already validated and measured by the gesture owner.
   *
   * Geometry was already read before these feedback writes. The line never receives
   * input, participates in model selection, or measures mounted blocks independently.
   * No model or geometry reads occur here. Undefined targets hide the retained
   * line and release the old outline; inside targets display only their outline.
   *
   * @param target - Permitted current target, or undefined when none is available.
   * @returns Feedback reflects the supplied target until the next update or clear.
   * @throws DOM write failures; the owner must still attempt clear.
   */
  update(target?: ResolvedBlockDropTarget): void {
    if (this.target?.element !== target?.element) {
      this.target?.element.removeAttribute("data-block-drop-active");
    }
    this.target = target;
    this.updateLine(target?.indicator);
    if (target) {
      const value = target.indicator ? "between" : "true";
      if (target.element.getAttribute("data-block-drop-active") !== value) {
        target.element.setAttribute("data-block-drop-active", value);
      }
    }
  }

  /**
   * Releases every owned feedback node and attribute, even if one DOM cleanup fails.
   *
   * @returns Feedback references are cleared; repeated cleanup is harmless.
   * @throws A cleanup failure, or AggregateError when several cleanup operations fail.
   */
  clear(): void {
    const target = this.target;
    const line = this.line;
    this.target = undefined;
    this.line = undefined;
    const errors: unknown[] = [];
    for (const release of [
      () => target?.element.removeAttribute("data-block-drop-active"),
      () => line?.remove(),
    ]) {
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
   * @returns A pointer-transparent line is positioned or hidden.
   */
  private updateLine(rect?: BlockDropIndicator): void {
    if (rect && !this.line) {
      this.line = this.root.ownerDocument.createElement("div");
      this.line.className = BLOCK_EDITOR_CLASSES.dropLine;
      this.line.setAttribute("aria-hidden", "true");
      this.root.append(this.line);
    }
    if (!this.line) {
      return;
    }
    this.line.hidden = !rect;
    if (rect) {
      this.line.dataset.axis = rect.height === 2 ? "horizontal" : "vertical";
      this.line.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
      this.line.style.width =
        rect.height === 2 ? `${rect.width}px` : "var(--rivto-drop-indicator-thickness, 4px)";
      this.line.style.height =
        rect.height === 2 ? "var(--rivto-drop-indicator-thickness, 4px)" : `${rect.height}px`;
    }
  }
}
