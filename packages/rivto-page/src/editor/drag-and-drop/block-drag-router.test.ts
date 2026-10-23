import { BlockDragRouter } from "./block-drag-router";
import type { BlockDragTargetScope, ResolvedBlockDropTarget } from "./types";

afterEach(() => document.body.replaceChildren());

test("routes one current hit locally or to a foreign attachment without a second hit test", () => {
  const root = document.createElement("div");
  const other = document.createElement("div");
  document.body.append(root, other);
  const receiver: BlockDragTargetScope = { root: other, onDetach: () => () => {} };
  const target: ResolvedBlockDropTarget = {
    element: other,
    destination: { kind: "inside", parentId: null },
  };
  const foreign = { resolveForeign: jest.fn(() => target) };
  const local = { resolve: jest.fn(() => undefined) };
  const route = jest.fn(() => ({ controller: receiver, nestedBoundary: true }));
  const router = new BlockDragRouter(root, { resolve: route }, local, foreign);
  const ids = new Set(["source"]);
  expect(router.resolve(4, 5, ids, other)).toEqual({ ...target, scope: receiver });
  expect(foreign.resolveForeign).toHaveBeenCalledWith(receiver, 4, 5, ids, other, true);
  expect(route).toHaveBeenCalledWith(root, { x: 4, y: 5 }, 8, other);
  expect(local.resolve).not.toHaveBeenCalled();
  route.mockReturnValue({ controller: { root, onDetach: () => () => {} }, nestedBoundary: true });
  router.resolve(4, 5, ids, root);
  expect(local.resolve).toHaveBeenCalledWith(4, 5, ids, root, true);
  root.remove();
  expect(router.resolve(4, 5, ids, other)).toBeUndefined();
  expect(route).toHaveBeenCalledTimes(2);
});
