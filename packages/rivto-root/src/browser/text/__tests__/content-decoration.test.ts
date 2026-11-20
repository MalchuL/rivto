import { captureBrowserTextHost } from "../browser-text-host";

it("decorates and clears a prefix while preserving text and caret", () => {
  const root = document.createElement("div");
  root.dataset.blockId = "block";
  const content = document.createElement("span");
  content.textContent = "TODO task";
  root.append(content);
  document.body.append(root);
  const input = captureBrowserTextHost(content, root)!;
  const selection = document.getSelection()!;
  const range = document.createRange();
  try {
    range.setStart(content.firstChild!, 7);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    input.decoratePrefix("TODO", "prompt-test");
    expect(content.querySelector(".prompt-test")?.textContent).toBe("TODO");
    expect(input.readText()).toBe("TODO task");
    expect(input.readCaret().offset).toBe(7);
    input.decoratePrefix(undefined, "prompt-test");
    expect(content.querySelector(".prompt-test")).toBeNull();
    expect(input.readText()).toBe("TODO task");
    expect(input.readCaret().offset).toBe(7);
  } finally {
    selection.removeAllRanges();
    root.remove();
  }
});
