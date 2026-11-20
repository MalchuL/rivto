import { attachTestRoot } from "../../../test-utils/attach-test-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockVirtualizationRegistry } from "../block-virtualization-registry";
import { BlockEditorController } from "../../block-editor-controller";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("does not connect a foreign identity or an already detached occurrence", () => {
  const registry = new BlockVirtualizationRegistry();
  const identity = getBrowserElementIdentity(document.createElement("div"));
  const foreign = getBrowserElementIdentity(document.createElement("div"));
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => false),
  };
  const view = { mountBlocks: jest.fn(), observeRoot: jest.fn(() => () => {}) };
  const release = registry.register(identity, view);
  const unbindDetached = registry.bind(identity, occurrence);
  expect(view.observeRoot).not.toHaveBeenCalled();
  expect(registry.get(occurrence)).toBeUndefined();
  unbindDetached();
  occurrence.isAttached.mockReturnValue(true);
  const unbindForeign = registry.bind(foreign, occurrence);
  expect(view.observeRoot).not.toHaveBeenCalled();
  expect(registry.get(occurrence)).toBeUndefined();
  unbindForeign();
  const unbind = registry.bind(identity, occurrence);
  expect(view.observeRoot).toHaveBeenCalledTimes(1);
  expect(registry.get(occurrence)).toBe(view);
  unbind();
  release();
  registry.destroy();
});

it.each([true, false])("connects view and Root in either order, view first=%s", (viewFirst) => {
  const registry = new BlockVirtualizationRegistry();
  const root = document.createElement("div");
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const stop = jest.fn();
  const view = { mountBlocks: jest.fn(), observeRoot: jest.fn(() => stop) };
  let releaseView: () => void;
  let unbind: () => void;
  if (viewFirst) {
    releaseView = registry.register(getBrowserElementIdentity(root), view);
    unbind = registry.bind(getBrowserElementIdentity(root), occurrence);
  } else {
    unbind = registry.bind(getBrowserElementIdentity(root), occurrence);
    releaseView = registry.register(getBrowserElementIdentity(root), view);
  }
  expect(view.observeRoot).toHaveBeenCalledWith(occurrence);
  expect(registry.get(occurrence)).toBe(view);
  expect(registry.get({ isAttached: () => true })).toBeUndefined();
  unbind();
  expect(registry.get(occurrence)).toBeUndefined();
  expect(stop).toHaveBeenCalledTimes(1);
  const stopAgain = jest.fn();
  view.observeRoot.mockReturnValue(stopAgain);
  const unbindAgain = registry.bind(getBrowserElementIdentity(root), occurrence);
  unbind();
  expect(stopAgain).not.toHaveBeenCalled();
  releaseView();
  expect(stopAgain).toHaveBeenCalledTimes(1);
  unbindAgain();
  registry.destroy();
});

it("does not expose a view when its Root detaches or binding ends during lookup", () => {
  const registry = new BlockVirtualizationRegistry();
  const root = document.createElement("div");
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const view = { mountBlocks: jest.fn(), observeRoot: () => () => {} };
  registry.register(getBrowserElementIdentity(root), view);
  const unbind = registry.bind(getBrowserElementIdentity(root), occurrence);
  expect(registry.get(occurrence)).toBe(view);
  occurrence.isAttached.mockReturnValueOnce(false);
  expect(registry.get(occurrence)).toBeUndefined();
  occurrence.isAttached.mockImplementationOnce(() => {
    unbind();
    return true;
  });
  expect(registry.get(occurrence)).toBeUndefined();
  registry.destroy();
});

it("preserves the current view when a replacement observation fails", () => {
  const registry = new BlockVirtualizationRegistry();
  const root = document.createElement("div");
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const stop = jest.fn();
  const first = { mountBlocks: jest.fn(), observeRoot: jest.fn(() => stop) };
  const broken = {
    mountBlocks: jest.fn(),
    observeRoot: () => {
      throw new Error("observation failed");
    },
  };
  const unbind = registry.bind(getBrowserElementIdentity(root), occurrence);
  const release = registry.register(getBrowserElementIdentity(root), first);
  expect(() => registry.register(getBrowserElementIdentity(root), broken)).toThrow(
    "observation failed",
  );
  expect(registry.get(occurrence)).toBe(first);
  expect(stop).not.toHaveBeenCalled();
  release();
  expect(stop).toHaveBeenCalledTimes(1);
  unbind();
  registry.destroy();
});

it("releases a newly acquired observation if setup destroys the registry", () => {
  const registry = new BlockVirtualizationRegistry();
  const root = document.createElement("div");
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const stop = jest.fn();
  const view = {
    mountBlocks: jest.fn(),
    observeRoot: () => {
      registry.destroy();
      return stop;
    },
  };
  registry.register(getBrowserElementIdentity(root), view);
  expect(() => registry.bind(getBrowserElementIdentity(root), occurrence)).toThrow(
    "Virtualization binding ended during setup",
  );
  expect(stop).toHaveBeenCalledTimes(1);
  expect(registry.get(occurrence)).toBeUndefined();
});

it("rolls back the editor attachment when a view cannot observe its Root", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const view = {
    mountBlocks: jest.fn(),
    observeRoot: () => {
      throw new Error("observation failed");
    },
  };
  const release = editor.virtualization.register(getBrowserElementIdentity(root), view);
  try {
    expect(() => attachTestRoot(editor, root)).toThrow("observation failed");
    expect(editor.inputRoot).toBeUndefined();
    release();
    const detach = attachTestRoot(editor, root);
    expect(editor.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
    detach();
    expect(editor.inputRoot).toBeUndefined();
  } finally {
    release();
    editor.destroy();
  }
});

it("attempts every observation cleanup when one disposer fails", () => {
  const registry = new BlockVirtualizationRegistry();
  const root = document.createElement("div");
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const secondStop = jest.fn();
  const first = {
    mountBlocks: jest.fn(),
    observeRoot: () => () => {
      throw new Error("cleanup failed");
    },
  };
  const second = { mountBlocks: jest.fn(), observeRoot: () => secondStop };
  registry.register(getBrowserElementIdentity(root), first);
  registry.register(getBrowserElementIdentity(root), second);
  registry.bind(getBrowserElementIdentity(root), occurrence);
  expect(() => registry.destroy()).toThrow(AggregateError);
  expect(secondStop).toHaveBeenCalledTimes(1);
  expect(registry.get(occurrence)).toBeUndefined();
});

it("releases an observation when its setup destroys the owning editor", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const stop = jest.fn();
  const release = editor.virtualization.register(getBrowserElementIdentity(root), {
    mountBlocks: jest.fn(),
    observeRoot: () => {
      editor.destroy();
      return stop;
    },
  });
  expect(() => attachTestRoot(editor, root)).toThrow("Virtualization binding ended during setup");
  expect(editor.inputRoot).toBeUndefined();
  expect(stop).toHaveBeenCalledTimes(1);
  release();
  editor.destroy();
});

it("destroys the virtualization registry even when region cleanup fails", () => {
  const editor = new BlockEditorController({ adapter: new TestBlockEditorAdapter() });
  const root = document.createElement("div");
  const view = { mountBlocks: jest.fn(), observeRoot: () => () => {} };
  editor.virtualization.register(getBrowserElementIdentity(root), view);
  const fail = jest.spyOn(editor.regions, "destroy").mockImplementation(() => {
    throw new Error("region cleanup failed");
  });
  try {
    expect(() => editor.destroy()).toThrow(AggregateError);
    expect(editor.virtualization.get({ isAttached: () => true })).toBeUndefined();
    expect(() => editor.virtualization.register(getBrowserElementIdentity(root), view)).toThrow(
      "Virtualization registry is destroyed",
    );
  } finally {
    fail.mockRestore();
  }
});
