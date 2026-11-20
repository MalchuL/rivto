import { captureTestInputRegion } from "../../../test-utils/capture-test-input-region";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { captureTestInputHit } from "../../../test-utils/capture-test-input-hit";
import { BlockDragRouter } from "../block-drag-router";

it.each([2, 40])("bounds source ownership reads with %i mounted children", (count) => {
  const root = document.createElement("div");
  root.append(...Array.from({ length: count }, () => document.createElement("div")));
  document.body.append(root);
  const active = jest.fn(() => true);
  const source = captureTestInputRegion(root, root, active);
  const route = jest.fn(() => null);
  const local = jest.fn(() => undefined);
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: route },
    { resolve: local },
    {
      resolveForeign: () => undefined,
    },
  );
  try {
    router.resolve(1, 2, new Set(), captureTestInputHit(root));
    expect(route).toHaveBeenCalledTimes(1);
    expect(local).toHaveBeenCalledTimes(1);
    expect(active.mock.calls.length).toBeLessThanOrEqual(12);
  } finally {
    root.remove();
  }
});

it("does not route when checking source ownership disconnects its element", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const source = captureTestInputRegion(root, root, () => {
    root.remove();
    return true;
  });
  const route = jest.fn(() => null);
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: route },
    { resolve: () => undefined },
    { resolveForeign: () => undefined },
  );
  try {
    expect(router.resolve(1, 2, new Set(), captureTestInputHit(root))).toBeUndefined();
    expect(route).not.toHaveBeenCalled();
  } finally {
    root.remove();
  }
});

it("does not route a hit when the source is invalidated during hit testing", () => {
  const root = document.createElement("div");
  document.body.append(root);
  let active = true;
  const source = captureTestInputRegion(root, root, () => active);
  const route = jest.fn(() => null);
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: route },
    { resolve: () => undefined },
    {
      resolveForeign: () => undefined,
    },
  );
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => {
      active = false;
      return root;
    },
  });
  try {
    expect(router.resolve(1, 2, new Set())).toBeUndefined();
    expect(route).not.toHaveBeenCalled();
  } finally {
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    root.remove();
  }
});

it("does not route a hit after the source moves to another document during hit testing", () => {
  const root = document.createElement("div");
  document.body.append(root);
  const otherDocument = document.implementation.createHTMLDocument("other");
  const source = captureTestInputRegion(root, root, () => true);
  const route = jest.fn(() => null);
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: route },
    { resolve: () => undefined },
    {
      resolveForeign: () => undefined,
    },
  );
  const previous = Object.getOwnPropertyDescriptor(document, "elementFromPoint");
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => {
      otherDocument.body.append(root);
      return root;
    },
  });
  try {
    expect(router.resolve(1, 2, new Set())).toBeUndefined();
    expect(route).not.toHaveBeenCalled();
  } finally {
    if (previous) {
      Object.defineProperty(document, "elementFromPoint", previous);
    } else {
      Reflect.deleteProperty(document, "elementFromPoint");
    }
    root.remove();
  }
});

it("does not resolve or return a target after source replacement during routing", () => {
  const root = document.createElement("div");
  document.body.append(root);
  let active = true;
  const source = captureTestInputRegion(root, root, () => active);
  const local = jest.fn(() => ({
    anchor: source,
    destination: { kind: "inside" as const, parentId: null },
  }));
  const route = jest.fn(() => {
    active = false;
    return null;
  });
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: route },
    { resolve: local },
    {
      resolveForeign: () => undefined,
    },
  );
  try {
    expect(router.resolve(1, 2, new Set(), captureTestInputHit(root))).toBeUndefined();
    expect(local).not.toHaveBeenCalled();
    active = true;
    route.mockImplementation(() => null);
    local.mockImplementation(() => {
      active = false;
      return { anchor: source, destination: { kind: "inside", parentId: null } };
    });
    expect(router.resolve(1, 2, new Set(), captureTestInputHit(root))).toBeUndefined();
    expect(local).toHaveBeenCalledTimes(1);
  } finally {
    root.remove();
  }
});

it("does not route to a foreign receiver if comparing regions invalidates the source", () => {
  const root = document.createElement("div");
  const foreignRoot = document.createElement("div");
  document.body.append(root, foreignRoot);
  let active = true;
  const source = captureTestInputRegion(root, root, () => active);
  const region = captureTestInputRegion(foreignRoot, foreignRoot, () => {
    active = false;
    return true;
  });
  const receiver = { region, focus: () => {}, onDetach: () => () => {} };
  const foreign = jest.fn(() => undefined);
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: () => receiver },
    { resolve: () => undefined },
    {
      resolveForeign: foreign,
    },
  );
  try {
    expect(router.resolve(1, 2, new Set(), captureTestInputHit(root))).toBeUndefined();
    expect(foreign).not.toHaveBeenCalled();
  } finally {
    root.remove();
    foreignRoot.remove();
  }
});

it("discards a foreign target if its source is invalidated during resolution", () => {
  const root = document.createElement("div");
  const foreignRoot = document.createElement("div");
  document.body.append(root, foreignRoot);
  let active = true;
  const source = captureTestInputRegion(root, root, () => active);
  const region = captureTestInputRegion(foreignRoot, foreignRoot, () => true);
  const receiver = { region, focus: () => {}, onDetach: () => () => {} };
  const router = new BlockDragRouter(
    new BrowserInputRoot(root),
    source,
    { resolve: () => receiver },
    { resolve: () => undefined },
    {
      resolveForeign: () => {
        active = false;
        return { anchor: region, destination: { kind: "inside", parentId: null } };
      },
    },
  );
  try {
    expect(router.resolve(1, 2, new Set(), captureTestInputHit(root))).toBeUndefined();
  } finally {
    root.remove();
    foreignRoot.remove();
  }
});
