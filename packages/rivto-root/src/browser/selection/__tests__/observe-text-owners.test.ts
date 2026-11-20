import { BrowserInputRoot } from "../../input/browser-input-root";

const query = {
  ownerSelector: "[data-owner]",
  ownerAttribute: "data-owner",
  contentSelector: "[data-content]",
  boundarySelector: "[data-editor]",
};

it("reports focus and text endpoints without claiming nested or structural selection", () => {
  const element = document.createElement("div");
  element.dataset.editor = "";
  element.innerHTML =
    '<div data-owner="first"><span data-content tabindex="0">First</span></div><div data-owner="second"><span data-content>Second</span></div><div data-owner="label"><span>Label</span></div><div data-editor><div data-owner="nested"><span data-content>Nested</span></div></div>';
  document.body.append(element);
  const [first, second, nested] = element.querySelectorAll<HTMLElement>("[data-content]");
  const label = element.querySelector<HTMLElement>('[data-owner="label"] span')!;
  first.focus();
  const selection = document.getSelection()!;
  selection.setBaseAndExtent(first.firstChild!, 1, second.firstChild!, 2);
  const root = new BrowserInputRoot(element);
  const observe = jest.fn();
  const release = root.observeTextOwners(query, observe);
  try {
    expect(observe).toHaveBeenLastCalledWith(["first", "second"]);
    selection.setBaseAndExtent(label.firstChild!, 0, label.firstChild!, 2);
    document.dispatchEvent(new Event("selectionchange"));
    expect(observe).toHaveBeenLastCalledWith(["first"]);
    selection.setBaseAndExtent(nested.firstChild!, 0, nested.firstChild!, 2);
    document.dispatchEvent(new Event("selectionchange"));
    expect(observe).toHaveBeenLastCalledWith(["first"]);
    const calls = observe.mock.calls.length;
    root.detach();
    document.dispatchEvent(new Event("selectionchange"));
    expect(observe).toHaveBeenCalledTimes(calls);
  } finally {
    release();
    release();
    root.detach();
    selection.removeAllRanges();
    element.remove();
  }
});

it("removes installed listeners when initial observation fails", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const remove = jest.spyOn(element, "removeEventListener");
  const removeDocument = jest.spyOn(document, "removeEventListener");
  try {
    expect(() =>
      root.observeTextOwners(query, () => {
        throw new Error("observer failed");
      }),
    ).toThrow("observer failed");
    expect(remove).toHaveBeenCalledWith("focusin", expect.any(Function));
    expect(remove).toHaveBeenCalledWith("focusout", expect.any(Function));
    expect(removeDocument).toHaveBeenCalledWith("selectionchange", expect.any(Function));
  } finally {
    remove.mockRestore();
    removeDocument.mockRestore();
    root.detach();
  }
});

it("does not install listeners for a detached Root", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  root.detach();
  const add = jest.spyOn(element, "addEventListener");
  const observe = jest.fn();
  try {
    const release = root.observeTextOwners(query, observe);
    expect(add).not.toHaveBeenCalled();
    expect(observe).not.toHaveBeenCalled();
    release();
  } finally {
    add.mockRestore();
  }
});
