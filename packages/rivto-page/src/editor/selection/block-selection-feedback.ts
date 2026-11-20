import type { InputRegion } from "@chulane/rivto-root";
import { EDITOR_BOUNDARY_SELECTOR } from "../events/markers";
import type { BlockInputEvent } from "../events/types";
import type { BlockEditorEventsApi } from "../events/types";
import type { BlockKeyboardApi } from "../keyboard/types";
import type { BlockPointerSelection } from "./block-pointer-selection";

/** Owns hovered-anchor feedback and its keyboard subscriptions. */
export class BlockSelectionFeedback {
  private feedbackAnchor: InputRegion | undefined;
  private releaseFeedback: (() => void) | undefined;

  /**
   * Borrows only input observation, held keys and live toggle availability.
   *
   * @param events - Observation and attachment-loss subscriptions.
   * @param keyboard - Live keymap and physical-key state.
   * @param pointer - Read-only availability of optional pointer behaviors.
   * @param toggleBinding - Host semantic action used for structural toggling.
   */
  constructor(
    private readonly events: Pick<BlockEditorEventsApi, "observe" | "onDetach">,
    private readonly keyboard: Pick<
      BlockKeyboardApi,
      "subscribeHeld" | "subscribe" | "capture" | "isHeld"
    >,
    private readonly pointer: Pick<BlockPointerSelection, "isToggleInstalled">,
    private readonly toggleBinding: string,
  ) {}

  /**
   * Installs feedback selection registrations into the current extension scope.
   *
   * @returns Disposer releasing held-state observations and feedback.
   */
  install(): () => void {
    const disposers: Array<() => void> = [];
    try {
      disposers.push(this.keyboard.subscribeHeld(this.updateFeedback));
      disposers.push(this.keyboard.subscribe(this.updateFeedback));
      this.events.observe(
        "selection.feedback.over",
        { type: "pointerover", scope: "root", priority: 0 },
        (event) =>
          this.setFeedbackAnchor(
            event.input.captureRegion(
              "[data-block-selection-anchor]",
              "[data-block-id]",
              EDITOR_BOUNDARY_SELECTOR,
            ),
          ),
      );
      this.events.observe(
        "selection.feedback.out",
        { type: "pointerout", scope: "root", priority: 0 },
        this.onPointerOut,
      );
      this.events.onDetach(() => this.setFeedbackAnchor(undefined));
    } catch (error) {
      this.release(disposers, [error]);
    }
    return () => this.release(disposers);
  }

  /**
   * Removes hover feedback when the pointer leaves its current anchor.
   *
   * @param event - Normalized pointer transition in this occurrence.
   * @returns Feedback remains only when the related target is within the same anchor.
   */
  private onPointerOut = (event: BlockInputEvent<"pointerout">): void => {
    if (!this.feedbackAnchor?.containsTarget(event.input.relatedTarget)) {
      this.setFeedbackAnchor(undefined);
    }
  };

  /**
   * Attempts every held-key subscription cleanup and removes anchor feedback.
   *
   * @param disposers - Subscriptions to consume, including a partially installed setup.
   * @param errors - Existing setup failures to preserve alongside cleanup errors.
   * @returns Every captured subscription and hover attribute has been released.
   * @throws AggregateError when setup or any cleanup fails.
   */
  private release(disposers: Array<() => void>, errors: unknown[] = []): void {
    for (const dispose of [...disposers.splice(0), () => this.setFeedbackAnchor(undefined)]) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Selection feedback cleanup failed");
    }
  }

  /**
   * Reflects the configured toggle binding without encoding platform defaults.
   *
   * @returns Only the hovered anchor reflects live held state; other blocks are untouched.
   */
  private updateFeedback = (): void => {
    const enabled =
      this.pointer.isToggleInstalled() &&
      this.keyboard.isHeld(this.keyboard.capture(this.toggleBinding));
    if (enabled && this.feedbackAnchor && !this.releaseFeedback) {
      this.releaseFeedback = this.feedbackAnchor.setTemporaryAttribute("data-block-selecting", "");
    } else if (!enabled) {
      const release = this.releaseFeedback;
      this.releaseFeedback = undefined;
      release?.();
    }
  };
  /**
   * Moves cursor feedback to the hovered anchor without invalidating the entire editor subtree.
   *
   * @param anchor - Current pointer anchor, or undefined after pointer exit or detachment.
   * @returns Previous feedback is removed and only the current anchor reflects held keys.
   */
  private setFeedbackAnchor(anchor: InputRegion | undefined): void {
    if (anchor && this.feedbackAnchor?.isSame(anchor)) {
      return;
    }
    const release = this.releaseFeedback;
    this.releaseFeedback = undefined;
    release?.();
    this.feedbackAnchor = anchor;
    this.updateFeedback();
  }
}
