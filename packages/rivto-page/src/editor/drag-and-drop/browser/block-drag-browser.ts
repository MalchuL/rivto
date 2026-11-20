import type { BlockInputEvent } from "../../events/types";
import type { InputRoot } from "@chulane/rivto-root";
import { BlockDropFeedback } from "../block-drop-feedback";
import { BlockDragPreview } from "../block-drag-preview";
import type { BlockDragHit } from "../types";

/** Owns browser-specific checks and feedback for one drag attachment. */
export class BlockDragBrowser {
  readonly feedback: BlockDropFeedback;
  readonly preview: BlockDragPreview;

  /**
   * Borrows the source occurrence for this gesture's browser operations.
   *
   * @param inputRoot - Borrowed occurrence providing feedback and preview capabilities.
   */
  constructor(
    inputRoot: Pick<
      InputRoot,
      "captureDocumentAttribute" | "createTextOverlay" | "createLineOverlay"
    >,
  ) {
    this.feedback = new BlockDropFeedback(inputRoot);
    this.preview = new BlockDragPreview(inputRoot);
  }

  /**
   * Borrows this native event's target unless pointer capture redirected delivery.
   *
   * The result is consumed synchronously during movement; scroll reconciliation
   * and release still hit-test geometry afresh. No native hit survives into another
   * input event, including release after pointer capture has already been cleared.
   * Root checks connectivity and capture in the input target's browser realm.
   * The gesture releases the captured hit after synchronous resolution.
   *
   * @param input - Current pointer movement input, before release-time capture cleanup.
   * @returns Opaque connected uncaptured hit, or undefined to request geometric resolution.
   */
  uncapturedHit(input: BlockInputEvent<"pointermove">): BlockDragHit | undefined {
    return input.input.target?.captureUncapturedPointerHit(input.input.pointerId);
  }
}
