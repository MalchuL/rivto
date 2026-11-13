import { BlockPointerOwnership } from "./block-pointer-ownership";

it("excludes competing gestures and prevents stale release from cancelling a later owner", () => {
  const pointer = new BlockPointerOwnership();
  const selection = pointer.acquire();
  expect(selection).toBeDefined();
  expect(pointer.acquire()).toBeUndefined();
  selection!();
  const drag = pointer.acquire();
  expect(drag).toBeDefined();
  selection!();
  expect(pointer.acquire()).toBeUndefined();
  drag!();
  expect(pointer.acquire()).toBeDefined();
});

it("restores embedded frame interaction only when the owning gesture releases", () => {
  const pointer = new BlockPointerOwnership();
  const root = document.createElement("div");
  const release = pointer.acquire(root)!;
  expect(root.hasAttribute("data-rivto-pointer-active")).toBe(true);
  expect(pointer.acquire(root)).toBeUndefined();
  release();
  expect(root.hasAttribute("data-rivto-pointer-active")).toBe(false);
  const next = pointer.acquire(root)!;
  release();
  expect(root.hasAttribute("data-rivto-pointer-active")).toBe(true);
  next();
  expect(root.hasAttribute("data-rivto-pointer-active")).toBe(false);
});
