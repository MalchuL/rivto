import { readEditablePlainText } from "../editable-plain-text";

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
