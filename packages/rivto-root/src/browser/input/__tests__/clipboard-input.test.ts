import { BrowserInputListeners } from "../browser-input-listeners";

it("copies beforeinput text and composition data without exposing the native event", () => {
  const input = new BrowserInputListeners();
  const root = document.createElement("div");
  const received = jest.fn();
  input.register({ type: "beforeinput", target: "root", capture: false }, received);
  const detach = input.attach(root);
  const native = new InputEvent("beforeinput", {
    data: "文",
    inputType: "insertCompositionText",
    isComposing: true,
    bubbles: true,
  });
  root.dispatchEvent(native);
  expect(received).toHaveBeenCalledWith(
    expect.objectContaining({ data: "文", inputType: "insertCompositionText", isComposing: true }),
  );
  expect(received.mock.calls[0]![0]).not.toBe(native);
  expect(received.mock.calls[0]![0]).not.toHaveProperty("raw");
  detach();
});

it("provides synchronous clipboard data capabilities without exposing DataTransfer", () => {
  const input = new BrowserInputListeners();
  const root = document.createElement("div");
  const contents = new Map([["text/plain", "hello"]]);
  const clipboardData = {
    getData: jest.fn((type: string) => contents.get(type) ?? ""),
    setData: jest.fn((type: string, value: string) => contents.set(type, value)),
  };
  const received = jest.fn();
  input.register({ type: "copy", target: "root", capture: false }, (event) => {
    const operation: "copy" = event.type;
    expect(operation).toBe("copy");
    received(event);
    expect(event.clipboard?.read("text/plain")).toBe("hello");
    event.clipboard?.write("text/html", "<p>hello</p>");
    event.preventDefault();
  });
  const detach = input.attach(root);
  const native = new Event("copy", { bubbles: true, cancelable: true });
  Object.defineProperty(native, "clipboardData", { value: clipboardData });
  root.dispatchEvent(native);
  expect(contents.get("text/html")).toBe("<p>hello</p>");
  expect(native.defaultPrevented).toBe(true);
  expect(received.mock.calls[0]![0].clipboard).not.toBe(clipboardData);
  expect(received.mock.calls[0]![0]).not.toHaveProperty("raw");
  detach();
});

it("represents an unavailable clipboard without inventing its contents", () => {
  const input = new BrowserInputListeners();
  const root = document.createElement("div");
  const received = jest.fn();
  input.register({ type: "paste", target: "root", capture: false }, received);
  const detach = input.attach(root);
  root.dispatchEvent(new Event("paste", { bubbles: true }));
  expect(received.mock.calls[0]![0].clipboard).toBeNull();
  detach();
});
