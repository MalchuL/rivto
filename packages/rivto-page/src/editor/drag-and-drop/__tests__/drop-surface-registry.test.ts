import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { DROP_SURFACE_ATTRIBUTE, DropSurfaceRegistry } from "../drop-surface-registry";

afterEach(() => document.body.replaceChildren());

test("stale disposers preserve a newer attachment even for the same receiver", () => {
  const registry = new DropSurfaceRegistry();
  const controller = { root: document.createElement("div") };
  document.body.append(controller.root);
  const old = registry.register(new BrowserInputRoot(controller.root), controller);
  const current = registry.register(new BrowserInputRoot(controller.root), controller);
  old();
  expect(registry.getCurrent(controller)).toBe(controller);
  expect(controller.root.hasAttribute(DROP_SURFACE_ATTRIBUTE)).toBe(true);
  current();
  current();
  expect(registry.getCurrent(controller)).toBeUndefined();
  expect(controller.root.hasAttribute(DROP_SURFACE_ATTRIBUTE)).toBe(false);
});

test("failed marker installation preserves the prior receiving attachment", () => {
  const registry = new DropSurfaceRegistry();
  const root = document.createElement("div");
  const controller = { root };
  document.body.append(root);
  const dispose = registry.register(new BrowserInputRoot(controller.root), controller);
  const marker = jest.spyOn(root, "setAttribute").mockImplementationOnce(() => {
    throw new Error("marker failure");
  });
  expect(() => registry.register(new BrowserInputRoot(root), { root })).toThrow("marker failure");
  expect(registry.getCurrent(controller)).toBe(controller);
  marker.mockRestore();
  dispose();
});

test("nested edges stay with their registered occurrence without measuring geometry", () => {
  const registry = new DropSurfaceRegistry();
  const outer = { root: document.createElement("div") };
  const inner = { root: document.createElement("div") };
  const content = document.createElement("div");
  document.body.append(outer.root);
  outer.root.append(inner.root);
  inner.root.append(content);
  registry.register(new BrowserInputRoot(outer.root), outer);
  registry.register(new BrowserInputRoot(inner.root), inner);
  const measure = jest.spyOn(content, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 200,
    height: 100,
  } as DOMRect);
  expect(registry.resolve(captureTestInputHit(content))).toBe(inner);
  expect(registry.resolve(captureTestInputHit(content))).toBe(inner);
  expect(measure).not.toHaveBeenCalled();
});

test("independent registries cannot resolve each other's receivers", () => {
  const first = new DropSurfaceRegistry();
  const second = new DropSurfaceRegistry();
  const controller = { root: document.createElement("div") };
  document.body.append(controller.root);
  first.register(new BrowserInputRoot(controller.root), controller);
  expect(second.resolve(captureTestInputHit(controller.root))).toBeNull();
  expect(first.resolve(captureTestInputHit(controller.root))).toBe(controller);
});
