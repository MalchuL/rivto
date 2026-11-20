/**
 * True when a native editing event is Enter creating a visual line break.
 *
 * `insertParagraph` is the default Enter action; `insertLineBreak` is
 * Shift+Enter (and some plaintext hosts). Neither stores a `\n` character.
 *
 * @param inputType - `InputEvent.inputType` from `beforeinput`.
 * @returns Whether the default action should be replaced with a plain newline.
 */
export function isEditableNewlineInput(inputType: string): boolean {
  return inputType === "insertParagraph" || inputType === "insertLineBreak";
}
