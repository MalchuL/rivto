import type { BlockInputEvent } from "../events/block-input-event";
import type { BlockEditorEventsApi } from "../events/block-editor-events";
import type { BlockKeyboardApi } from "../keyboard/block-keyboard";
import type { BlockPointerSelection } from "./block-pointer-selection";

/** Owns hovered-anchor feedback and its keyboard subscriptions. */
export class BlockSelectionFeedback {
  private feedbackAnchor: HTMLElement | null = null;

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
        (event) => this.setFeedbackAnchor(event.selectionAnchor),
      );
      this.events.observe(
        "selection.feedback.out",
        { type: "pointerout", scope: "root", priority: 0 },
        this.onPointerOut,
      );
      this.events.onDetach(() => this.setFeedbackAnchor(null));
    } catch (error) {
      this.release(disposers, [error]);
    }
    return () => this.release(disposers);
  }

  /**
   * Removes hover feedback when the pointer leaves its current anchor.
   *
   * @param event - Native pointer transition in this occurrence.
   * @returns Feedback remains only when the related target is within the same anchor.
   */
  private onPointerOut = (event: BlockInputEvent<"pointerout">): void => {
    const target = event.raw.relatedTarget;
    const ElementType = event.root.ownerDocument.defaultView?.Element;
    if (
      !ElementType ||
      !(target instanceof ElementType) ||
      !this.feedbackAnchor?.contains(target)
    ) {
      this.setFeedbackAnchor(null);
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
    for (const dispose of [...disposers.splice(0), () => this.setFeedbackAnchor(null)]) {
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
    this.feedbackAnchor?.toggleAttribute(
      "data-block-selecting",
      this.pointer.isToggleInstalled() &&
        this.keyboard.isHeld(this.keyboard.capture(this.toggleBinding)),
    );
  };
  /**
   * Moves cursor feedback to the hovered anchor without invalidating the entire editor subtree.
   *
   * @param anchor - Current pointer anchor, or null after pointer exit or detachment.
   * @returns Previous feedback is removed and only the current anchor reflects held keys.
   */
  private setFeedbackAnchor(anchor: HTMLElement | null): void {
    if (anchor === this.feedbackAnchor) {
      return;
    }
    this.feedbackAnchor?.removeAttribute("data-block-selecting");
    this.feedbackAnchor = anchor;
    this.updateFeedback();
  }
}
