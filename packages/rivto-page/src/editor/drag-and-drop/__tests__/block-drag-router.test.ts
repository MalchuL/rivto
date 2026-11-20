import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockDragRouter } from "../block-drag-router";
import type { BlockDragHit, BlockDragTargetScope, ResolvedBlockDropTarget } from "../types";

afterEach(() => document.body.replaceChildren());

test("routes one current hit locally or to a foreign attachment without a second hit test", () => {
  const root = document.createElement("div");
  const other = document.createElement("div");
  document.body.append(root, other);
  const receiver: BlockDragTargetScope = {
    region: captureTestInputRegion(other, other, () => other.isConnected),
    focus: jest.fn(),
    onDetach: () => () => {},
  };
  const target: ResolvedBlockDropTarget = {
    anchor: captureTestInputRegion(other, other, () => true),
    destination: { kind: "inside", parentId: null },
  };
  const foreign = { resolveForeign: jest.fn(() => target) };
  const local = { resolve: jest.fn(() => undefined) };
  const route = jest.fn(() => receiver);
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    captureTestInputRegion(root, root, () => root.isConnected),
    { resolve: route },
    local,
    foreign,
  );
  const ids = new Set(["source"]);
  const accepts = jest.fn(() => true);
  const foreignHit = captureTestInputHit(other);
  expect(router.resolve(4, 5, ids, foreignHit, accepts)).toEqual({ ...target, scope: receiver });
  expect(foreign.resolveForeign).toHaveBeenCalledWith(receiver, 4, 5, ids, foreignHit);
  expect(route).toHaveBeenCalledWith(foreignHit);
  expect(local.resolve).not.toHaveBeenCalled();
  const localScope = {
    region: captureTestInputRegion(root, root, () => true),
    focus: jest.fn(),
    onDetach: () => () => {},
  };
  route.mockReturnValue(localScope);
  const localHit = captureTestInputHit(root);
  router.resolve(4, 5, ids, localHit, accepts);
  expect(local.resolve).toHaveBeenCalledWith(4, 5, ids, localHit, accepts);
  root.remove();
  expect(router.resolve(4, 5, ids, captureTestInputHit(other))).toBeUndefined();
  expect(route).toHaveBeenCalledTimes(2);
});

test("releases a geometry hit after resolution even when a consumer throws", () => {
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.append(target);
  document.body.append(root);
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: () => target });
  let captured: BlockDragHit | undefined;
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    captureTestInputRegion(root, root, () => root.isConnected),
    { resolve: () => null },
    {
      resolve: (x, y, excluded, hit) => {
        captured = hit;
        expect(hit?.getNearestAncestorIdentity("*")).toBe(getBrowserElementIdentity(target));
        throw new Error("target failure");
      },
    },
    { resolveForeign: () => undefined },
  );
  try {
    expect(() => router.resolve(1, 2, new Set())).toThrow("target failure");
    expect(captured).toBeDefined();
    expect(captured?.isCurrent()).toBe(false);
  } finally {
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});

test("reuses a valid hit and refreshes one from a different document", () => {
  const root = document.createElement("div");
  const target = document.createElement("div");
  root.append(target);
  document.body.append(root);
  const foreignDocument = document.implementation.createHTMLDocument("foreign");
  const foreignTarget = foreignDocument.createElement("div");
  foreignDocument.body.append(foreignTarget);
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  const hitTest = jest.fn(() => target);
  Object.defineProperty(document, "elementFromPoint", { configurable: true, value: hitTest });
  let observed: ReturnType<typeof getBrowserElementIdentity> | undefined;
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    captureTestInputRegion(root, root, () => root.isConnected),
    {
      /**
       * Records the opaque identity represented by the routed hit.
       *
       * @param hit - Validated hit selected for this resolution.
       * @returns No foreign receiver, keeping this fixture on its local route.
       */
      resolve: (hit) => {
        observed = hit?.getNearestAncestorIdentity("*");
        return null;
      },
    },
    { resolve: () => undefined },
    { resolveForeign: () => undefined },
  );
  try {
    router.resolve(1, 2, new Set(), captureTestInputHit(target));
    expect(observed).toBe(getBrowserElementIdentity(target));
    expect(hitTest).not.toHaveBeenCalled();
    router.resolve(1, 2, new Set(), captureTestInputHit(foreignTarget));
    expect(observed).toBe(getBrowserElementIdentity(target));
    expect(hitTest).toHaveBeenCalledTimes(1);
  } finally {
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
  }
});
