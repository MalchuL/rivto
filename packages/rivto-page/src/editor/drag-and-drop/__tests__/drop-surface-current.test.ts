import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { DropSurfaceRegistry } from "../drop-surface-registry";

it("recognizes only the current connected receiver by its registration identity", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const registry = new DropSurfaceRegistry();
  const previous = { root };
  const replacement = { root };
  const releasePrevious = registry.register(new BrowserInputRoot(root), previous);
  expect(registry.getCurrent(previous)).toBe(previous);
  const releaseReplacement = registry.register(new BrowserInputRoot(root), replacement);
  expect(registry.getCurrent(previous)).toBeUndefined();
  expect(registry.getCurrent(replacement)).toBe(replacement);
  releasePrevious();
  expect(registry.getCurrent(replacement)).toBe(replacement);
  root.remove();
  expect(registry.getCurrent(replacement)).toBeUndefined();
  document.body.append(root);
  expect(registry.getCurrent(replacement)).toBe(replacement);
  releaseReplacement();
  expect(registry.getCurrent(replacement)).toBeUndefined();
  root.remove();
});

it("keeps a repeated registration current when its older disposer runs", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const registry = new DropSurfaceRegistry();
  const receiver = { root };
  const releasePrevious = registry.register(new BrowserInputRoot(root), receiver);
  const releaseCurrent = registry.register(new BrowserInputRoot(root), receiver);
  releasePrevious();
  expect(registry.getCurrent(receiver)).toBe(receiver);
  releaseCurrent();
  expect(registry.getCurrent(receiver)).toBeUndefined();
  root.remove();
});

it("invalidates a receiver when its Root detaches and releases its marker afterward", () => {
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const registry = new DropSurfaceRegistry();
  const receiver = {};
  const release = registry.register(root, receiver);
  expect(registry.getCurrent(receiver)).toBe(receiver);
  root.detach();
  expect(registry.getCurrent(receiver)).toBeUndefined();
  release();
  expect(element.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
  element.remove();
});

it("rolls back the marker if the Root detaches during registration", () => {
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  const setMarker = root.setTemporaryAttribute.bind(root);
  jest.spyOn(root, "setTemporaryAttribute").mockImplementation((name, value) => {
    const release = setMarker(name, value);
    root.detach();
    return release;
  });
  const registry = new DropSurfaceRegistry();
  expect(() => registry.register(root, {})).toThrow(
    "Drop surface Root changed during registration",
  );
  expect(element.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
});
