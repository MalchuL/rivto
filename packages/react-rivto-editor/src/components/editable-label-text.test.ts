import {
  isEditableNewlineInput,
  readEditablePlainText,
} from "./editable-label-text";

describe("readEditablePlainText", () => {
  test("keeps innerText newlines that textContent would drop", () => {
    const element = {
      innerText: "hello\nworld",
      textContent: "helloworld",
    } as HTMLElement;
    expect(readEditablePlainText(element)).toBe("hello\nworld");
  });

  test("falls back to textContent when innerText is missing", () => {
    const element = {
      textContent: "hello\nworld",
    } as HTMLElement;
    expect(readEditablePlainText(element)).toBe("hello\nworld");
  });

  test("normalizes carriage returns from innerText", () => {
    const element = {
      innerText: "hello\r\nworld",
      textContent: "helloworld",
    } as HTMLElement;
    expect(readEditablePlainText(element)).toBe("hello\nworld");
  });
});

describe("isEditableNewlineInput", () => {
  test("treats paragraph and line-break input as Enter", () => {
    expect(isEditableNewlineInput("insertParagraph")).toBe(true);
    expect(isEditableNewlineInput("insertLineBreak")).toBe(true);
    expect(isEditableNewlineInput("insertText")).toBe(false);
  });
});
