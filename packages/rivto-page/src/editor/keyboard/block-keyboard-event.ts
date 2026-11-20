import {
  captureKeyboardInput,
  formatKeyboardShortcut,
  type KeyboardKeyInput,
  type PrimaryModifier,
} from "@chulane/rivto-root";
import type { BlockInputEvent, BlockInputTarget } from "../events/types";

/** Typed Page keyboard context with normalized shortcut metadata. */
export class BlockKeyboardEvent {
  readonly keyboard: KeyboardKeyInput;
  readonly shortcut: string;
  readonly phase: "keydown" | "keyup";
  /** Listener realm selected by the keyboard registration. */
  readonly eventTarget: BlockInputTarget;
  /** Whether the original target belongs to the mounted Page occurrence. */
  readonly insideRoot: boolean;
  /** Stable block ID at the input target, when present. */
  readonly blockId: string | null;
  /** Whether the input targeted the Page root itself. */
  readonly targetIsRoot: boolean;
  /**
   * Requests cancellation of the browser default during this delivery.
   *
   * @returns The browser default is prevented when the input is cancelable.
   */
  readonly preventDefault: () => void;
  /**
   * Requests that browser propagation stop after the current target.
   *
   * @returns The browser will not propagate this input to later targets.
   */
  readonly stopPropagation: () => void;

  /**
   * Copies portable shortcut and Page target data without exposing browser objects.
   *
   * @param event - Original Page keyboard input.
   * @param phase - Native input phase.
   * @param primaryModifier - Modifier captured by the runtime for shortcut matching.
   */
  constructor(
    event: BlockInputEvent<"keydown" | "keyup">,
    phase: "keydown" | "keyup",
    primaryModifier: PrimaryModifier,
  ) {
    this.keyboard = captureKeyboardInput(event.input);
    this.phase = phase;
    this.eventTarget = event.eventTarget;
    this.insideRoot = event.insideRoot;
    this.blockId = event.blockId;
    this.targetIsRoot = event.targetIsRoot;
    this.preventDefault = () => event.preventDefault();
    this.stopPropagation = () => event.stopPropagation();
    this.shortcut = formatKeyboardShortcut(this.keyboard, primaryModifier);
  }
}
