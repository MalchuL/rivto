import { BrowserInputRoot } from "../browser-input-root";

it("delivers normalized window resize only while the Root is attached", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const observer = jest.fn();
  const release = root.observeWindowInput("resize", "bubble", observer);
  try {
    window.dispatchEvent(new Event("resize"));
    expect(observer).toHaveBeenCalledTimes(1);
    expect(observer.mock.calls[0]![0]).toMatchObject({ type: "resize" });
    root.detach();
    window.dispatchEvent(new Event("resize"));
    expect(observer).toHaveBeenCalledTimes(1);
  } finally {
    release();
    root.detach();
  }
});

it("observes outside pointer presses during capture without exposing browser events", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const outside = document.createElement("button");
  outside.dataset.control = "yes";
  document.body.append(outside);
  const observer = jest.fn();
  const release = root.observeWindowInput("pointerdown", "capture", (input) => {
    observer(input.target?.hasAncestor("[data-control]"));
    expect(input).not.toHaveProperty("raw");
  });
  try {
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(observer).toHaveBeenCalledWith(true);
    root.detach();
    outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(observer).toHaveBeenCalledTimes(1);
  } finally {
    release();
    release();
    outside.remove();
    root.detach();
  }
});

it("stops delivery after a document move and releases the captured window", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const observer = jest.fn();
  const release = root.observeWindowInput("pointerdown", "capture", observer);
  try {
    document.implementation.createHTMLDocument("other").adoptNode(element);
    window.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true }));
    expect(observer).not.toHaveBeenCalled();
  } finally {
    release();
    root.detach();
  }
});

it("observes keyboard input in the requested bubble phase after target cancellation", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  const target = document.createElement("button");
  document.body.append(target);
  const observer = jest.fn();
  target.addEventListener("keydown", (event) => event.preventDefault());
  const release = root.observeWindowInput("keydown", "bubble", (input) => {
    observer(input.key, input.defaultPrevented);
  });
  try {
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );
    expect(observer).toHaveBeenCalledWith("Escape", true);
  } finally {
    release();
    target.remove();
    root.detach();
  }
});
