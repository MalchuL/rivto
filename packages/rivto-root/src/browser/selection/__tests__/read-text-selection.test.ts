import { BrowserInputRoot } from "../../input/browser-input-root";

const query = {
  ownerSelector: "[data-owner]",
  ownerAttribute: "data-owner",
  contentSelector: "[data-content]",
  boundarySelector: "[data-editor]",
};

it("reads directed offsets and excludes a nested occurrence", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML =
    '<div data-owner="first"><span data-content>ab<strong>cd</strong></span></div><div data-owner="second"><span data-content>last</span></div><div data-editor><div data-owner="nested"><span data-content>nested</span></div></div>';
  document.body.append(element);
  const [first, second, nested] = element.querySelectorAll("[data-content]");
  const root = new BrowserInputRoot(element);
  const selection = document.getSelection()!;
  try {
    selection.setBaseAndExtent(second.firstChild!, 3, first.firstChild!, 1);
    expect(root.readTextSelection(query)).toEqual({
      anchor: { ownerId: "second", offset: 3 },
      focus: { ownerId: "first", offset: 1 },
    });
    selection.setBaseAndExtent(first.firstChild!, 1, nested.firstChild!, 2);
    expect(root.readTextSelection(query)).toBeUndefined();
    root.detach();
    expect(root.readTextSelection(query)).toBeUndefined();
  } finally {
    selection.removeAllRanges();
    root.detach();
    element.remove();
  }
});

it("discards endpoints when the Root detaches while reading browser selection", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML = '<div data-owner="first"><span data-content>text</span></div>';
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(
    element.querySelector("[data-content]")!.firstChild!,
    0,
    element.querySelector("[data-content]")!.firstChild!,
    1,
  );
  const read = jest.spyOn(document, "getSelection").mockImplementation(() => {
    root.detach();
    return selection;
  });
  try {
    expect(root.readTextSelection(query)).toBeUndefined();
  } finally {
    read.mockRestore();
    selection.removeAllRanges();
    root.detach();
    element.remove();
  }
});
