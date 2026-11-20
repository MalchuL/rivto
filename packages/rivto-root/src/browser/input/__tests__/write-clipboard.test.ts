import { BrowserInputRoot } from "../browser-input-root";

const formats = {
  formats: { "text/plain": "text", "text/html": "<p>text</p>", "application/example": "custom" },
  asynchronousFormats: ["text/plain", "text/html"],
};

it("writes only the selected formats through the occurrence window", async () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const view = frame.contentWindow!;
  const element = view.document.createElement("div");
  view.document.body.append(element);
  const write = jest.fn().mockResolvedValue(undefined);
  const item = jest.fn();
  Object.defineProperty(view.navigator, "clipboard", { configurable: true, value: { write } });
  Object.defineProperty(view, "ClipboardItem", { configurable: true, value: item });
  const root = new BrowserInputRoot(element);
  try {
    await root.writeClipboard(formats);
    expect(write).toHaveBeenCalledTimes(1);
    expect(Object.keys(item.mock.calls[0]![0])).toEqual(["text/plain", "text/html"]);
  } finally {
    root.detach();
    frame.remove();
  }
});

it("writes all fallback formats and releases the listener after failure", async () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const doc = frame.contentDocument!;
  const element = doc.createElement("div");
  doc.body.append(element);
  const root = new BrowserInputRoot(element);
  const setData = jest.fn();
  const exec = jest.fn(() => {
    const event = new Event("copy", { bubbles: true, cancelable: true });
    Object.defineProperty(event, "clipboardData", { value: { setData } });
    doc.dispatchEvent(event);
    return true;
  });
  Object.defineProperty(doc, "execCommand", { configurable: true, value: exec });
  try {
    await root.writeClipboard(formats);
    expect(setData.mock.calls).toEqual(Object.entries(formats.formats));
    exec.mockReturnValueOnce(false);
    await expect(root.writeClipboard(formats)).rejects.toThrow("Unable to write to the clipboard");
    setData.mockClear();
    doc.dispatchEvent(new Event("copy"));
    expect(setData).not.toHaveBeenCalled();
  } finally {
    root.detach();
    frame.remove();
  }
});

it("rejects a write initiated after Root detachment", () => {
  const root = new BrowserInputRoot(document.createElement("div"));
  root.detach();
  expect(() => root.writeClipboard(formats)).toThrow("no longer attached");
});

it("propagates asynchronous clipboard rejection without invoking fallback", async () => {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const view = frame.contentWindow!;
  const root = new BrowserInputRoot(view.document.createElement("div"));
  const failure = new Error("denied");
  const exec = jest.fn();
  Object.defineProperty(view.navigator, "clipboard", {
    configurable: true,
    value: { write: jest.fn().mockRejectedValue(failure) },
  });
  Object.defineProperty(view, "ClipboardItem", { configurable: true, value: jest.fn() });
  Object.defineProperty(view.document, "execCommand", { configurable: true, value: exec });
  try {
    await expect(root.writeClipboard(formats)).rejects.toBe(failure);
    expect(exec).not.toHaveBeenCalled();
  } finally {
    root.detach();
    frame.remove();
  }
});
