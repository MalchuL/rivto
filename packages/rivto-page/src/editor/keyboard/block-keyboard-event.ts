import { shortcutFromKeyboardEvent } from "@chulane/rivto-keyboard";
import { BlockInputEvent } from "../events/block-input-event";

/** Typed Page keyboard context with normalized shortcut metadata. */
export class BlockKeyboardEvent extends BlockInputEvent<"keydown" | "keyup"> {
  readonly shortcut: string;
  readonly phase: "keydown" | "keyup";

  /**
   * Adds portable shortcut metadata to Page DOM context.
   *
   * @param event - Original Page keyboard input.
   * @param phase - Native input phase.
   */
  constructor(event: BlockInputEvent<"keydown" | "keyup">, phase: "keydown" | "keyup") {
    super(event.raw, event.root, event.eventTarget);
    this.phase = phase;
    this.shortcut = shortcutFromKeyboardEvent(event.raw);
  }
}
