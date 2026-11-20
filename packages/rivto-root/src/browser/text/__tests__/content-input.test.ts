import { captureBrowserTextHost } from "../browser-text-host";

it("reads text and caret only from the captured content host", () => {
  const block = document.createElement("div");
  block.dataset.blockId = "source";
  const content = document.createElement("span");
  content.textContent = "abc";
  block.append(content);
  document.body.append(block);
  const input = captureBrowserTextHost(content, block)!;
  const selection = document.getSelection()!;
  const range = document.createRange();
  try {
    range.setStart(content.firstChild!, 2);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    expect(input.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("source");
    expect(input.readCaret()).toEqual({ text: "abc", offset: 2 });
    content.textContent = "changed";
    selection.removeAllRanges();
    expect(input.readCaret()).toEqual({ text: "changed", offset: undefined });
    block.dataset.blockId = "updated";
    expect(input.readAncestorAttribute("[data-block-id]", "data-block-id")).toBe("updated");
    content.remove();
    expect(input.readAncestorAttribute("[data-block-id]", "data-block-id")).toBeUndefined();
    expect(captureBrowserTextHost(null, block)).toBeUndefined();
  } finally {
    selection.removeAllRanges();
    block.remove();
  }
});

it("copies content and viewport geometry without returning browser objects", () => {
  const content = document.createElement("span");
  const bounds = { left: 10, top: 20, bottom: 30 };
  const measure = jest.spyOn(content, "getBoundingClientRect").mockReturnValue(bounds as DOMRect);
  const selection = document.getSelection()!;
  selection.removeAllRanges();
  try {
    const geometry = captureBrowserTextHost(content, content)!.measureCaret();
    expect(geometry.content).toEqual(bounds);
    expect(geometry.content).not.toBe(bounds);
    expect(geometry.caret).toBeUndefined();
    expect(geometry.viewport).toEqual({ width: window.innerWidth, height: window.innerHeight });
  } finally {
    measure.mockRestore();
  }
});
