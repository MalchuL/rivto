import type { KeyboardKeyInput } from "./types";

/**
 * Copies the keyboard values used by shortcut matching and composition policy.
 *
 * The returned plain object does not retain the source input or any browser event.
 *
 * @param input - Logical key, physical code, modifiers and composition state.
 * @returns Detached keyboard values captured at the time of the call.
 */
export function captureKeyboardInput(input: KeyboardKeyInput): KeyboardKeyInput {
  return {
    key: input.key,
    code: input.code,
    ctrlKey: input.ctrlKey,
    metaKey: input.metaKey,
    altKey: input.altKey,
    shiftKey: input.shiftKey,
    isComposing: input.isComposing,
  };
}
