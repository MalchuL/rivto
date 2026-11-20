import { createCaretSelection, createStructuralSelection, type Selection } from "@chulane/rivto";
import { focusSelectionCaret } from "../selection";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("requests focus only for a collapsed caret in the current selection", () => {
  let current: Selection | undefined = createCaretSelection("text", 3);
  const focusBlock = jestApi.fn((_blockId: string, _offset: number) => true);
  const selection = { get: () => current, focusBlock };
  expect(focusSelectionCaret(selection)).toBe(true);
  expect(focusBlock).toHaveBeenCalledWith("text", 3);
  current = createStructuralSelection(["text"]);
  expect(focusSelectionCaret(selection)).toBe(false);
  current = undefined;
  expect(focusSelectionCaret(selection)).toBe(false);
  expect(focusBlock).toHaveBeenCalledTimes(1);
  current = createCaretSelection("text", 0);
  focusBlock.mockReturnValue(false);
  expect(focusSelectionCaret(selection)).toBe(false);
});
