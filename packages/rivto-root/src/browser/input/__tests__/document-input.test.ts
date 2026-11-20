/** @jest-environment jsdom */
import { BrowserInputRoot } from "../browser-input-root";

it("observes document bubbling even when propagation stops at document", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const target = document.createElement("button");
  document.body.append(target);
  const stop = (event: Event) => event.stopPropagation();
  document.addEventListener("keydown", stop);
  const observer = jest.fn();
  const release = root.observeDocumentInput("keydown", "bubble", (event) => observer(event.key));
  try {
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(observer).toHaveBeenCalledWith("Escape");
    root.detach();
    target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(observer).toHaveBeenCalledTimes(1);
  } finally {
    release();
    release();
    document.removeEventListener("keydown", stop);
    root.detach();
    target.remove();
  }
});

it("stops delivery when the occurrence moves to another document", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const observer = jest.fn();
  const release = root.observeDocumentInput("pointerdown", "capture", observer);
  try {
    document.implementation.createHTMLDocument("other").adoptNode(element);
    document.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(observer).not.toHaveBeenCalled();
  } finally {
    release();
    root.detach();
  }
});
