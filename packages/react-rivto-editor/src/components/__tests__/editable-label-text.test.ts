import { isEditableNewlineInput } from "../editable-label-text";

describe("isEditableNewlineInput", () => {
  test("treats paragraph and line-break input as Enter", () => {
    expect(isEditableNewlineInput("insertParagraph")).toBe(true);
    expect(isEditableNewlineInput("insertLineBreak")).toBe(true);
    expect(isEditableNewlineInput("insertText")).toBe(false);
  });
});
