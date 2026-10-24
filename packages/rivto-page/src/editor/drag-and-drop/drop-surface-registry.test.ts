import { DROP_SURFACE_ATTRIBUTE, DropSurfaceRegistry } from "./drop-surface-registry";

afterEach(() => document.body.replaceChildren());

test("stale disposers preserve a newer attachment even for the same receiver", () => {
  const registry = new DropSurfaceRegistry();
  const controller = { root: document.createElement("div") };
  const old = registry.register(controller);
  const current = registry.register(controller);
  old();
  expect(registry.get(controller.root)).toBe(controller);
  expect(controller.root.hasAttribute(DROP_SURFACE_ATTRIBUTE)).toBe(true);
  current();
  current();
  expect(registry.get(controller.root)).toBeUndefined();
  expect(controller.root.hasAttribute(DROP_SURFACE_ATTRIBUTE)).toBe(false);
});

test("failed marker installation preserves the prior receiving attachment", () => {
  const registry = new DropSurfaceRegistry();
  const root = document.createElement("div");
  const controller = { root };
  const dispose = registry.register(controller);
  const marker = jest.spyOn(root, "setAttribute").mockImplementation(() => {
    throw new Error("marker failure");
  });
  expect(() => registry.register({ root })).toThrow("marker failure");
  expect(registry.get(root)).toBe(controller);
  marker.mockRestore();
  dispose();
});

test("nested content edges route to the enclosing receiver without another hit test", () => {
  const registry = new DropSurfaceRegistry();
  const outer = { root: document.createElement("div") };
  const inner = { root: document.createElement("div") };
  const content = document.createElement("div");
  document.body.append(outer.root);
  outer.root.append(inner.root);
  inner.root.append(content);
  registry.register(outer);
  registry.register(inner, () => content);
  const measure = jest.spyOn(content, "getBoundingClientRect").mockReturnValue({
    top: 100,
    bottom: 200,
    height: 100,
  } as DOMRect);
  expect(registry.resolve(outer.root, { x: 20, y: 150 }, 8, content)).toEqual({
    controller: inner,
    nestedBoundary: false,
  });
  expect(registry.resolve(outer.root, { x: 20, y: 101 }, 8, content)).toEqual({
    controller: outer,
    nestedBoundary: true,
  });
  expect(measure).toHaveBeenCalledTimes(2);
});

test("independent registries cannot resolve each other's receivers", () => {
  const first = new DropSurfaceRegistry();
  const second = new DropSurfaceRegistry();
  const controller = { root: document.createElement("div") };
  document.body.append(controller.root);
  first.register(controller);
  expect(second.resolve(controller.root, { x: 0, y: 0 }, 8, controller.root)).toBeNull();
  expect(first.resolve(controller.root, { x: 0, y: 0 }, 8, controller.root)?.controller).toBe(
    controller,
  );
});
