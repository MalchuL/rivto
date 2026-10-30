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
