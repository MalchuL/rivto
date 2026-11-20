import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BlockVirtualizationController } from "../block-virtualization-controller";
import { attachBlockVirtualization } from "../browser/attach-block-virtualization";
import { BlockVirtualizationRegistry } from "../block-virtualization-registry";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";

it("keeps a replacement view registered when the older view detaches", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const adapter = new TestBlockEditorAdapter();
  const first = new BlockVirtualizationController(adapter.blocks, adapter.selection, jest.fn());
  const second = new BlockVirtualizationController(adapter.blocks, adapter.selection, jest.fn());
  const registry = new BlockVirtualizationRegistry();
  const occurrence = new BrowserInputRoot(root);
  const unbind = registry.bind(getBrowserElementIdentity(root), occurrence);
  const detachFirst = attachBlockVirtualization(root, jest.fn(), registry, first);
  const detachSecond = attachBlockVirtualization(root, jest.fn(), registry, second);
  try {
    expect(registry.get(occurrence)).toBe(second);
    detachFirst();
    expect(registry.get(occurrence)).toBe(second);
  } finally {
    detachFirst();
    detachSecond();
    unbind();
    root.remove();
  }
});

it("isolates editors and releases only the exact registration, even for the same view", () => {
  const root = document.createElement("div");
  const first = new BlockVirtualizationRegistry();
  const second = new BlockVirtualizationRegistry();
  const view = { mountBlocks: jest.fn(), observeRoot: () => () => {} };
  const other = { mountBlocks: jest.fn(), observeRoot: () => () => {} };
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const otherOccurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  first.bind(getBrowserElementIdentity(root), occurrence);
  second.bind(getBrowserElementIdentity(root), otherOccurrence);
  const old = first.register(getBrowserElementIdentity(root), view);
  const current = first.register(getBrowserElementIdentity(root), view);
  const otherRelease = second.register(getBrowserElementIdentity(root), other);
  old();
  expect(first.get(occurrence)).toBe(view);
  expect(first.get(otherOccurrence)).toBeUndefined();
  expect(second.get(otherOccurrence)).toBe(other);
  current();
  expect(first.get(occurrence)).toBeUndefined();
  expect(second.get(otherOccurrence)).toBe(other);
  first.destroy();
  otherRelease();
  expect(() => first.register(getBrowserElementIdentity(root), view)).toThrow(
    "Virtualization registry is destroyed",
  );
  expect(second.get(otherOccurrence)).toBeUndefined();
});

it("keeps a replacement when the same region capability is reused", () => {
  const root = document.createElement("div");
  const region = getBrowserElementIdentity(root);
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const registry = new BlockVirtualizationRegistry();
  const view = { mountBlocks: jest.fn(), observeRoot: () => () => {} };
  const unbind = registry.bind(region, occurrence);
  const releaseOld = registry.register(region, view);
  const releaseCurrent = registry.register(region, view);
  releaseOld();
  expect(registry.get(occurrence)).toBe(view);
  releaseCurrent();
  expect(registry.get(occurrence)).toBeUndefined();
  unbind();
  registry.destroy();
});

it("rolls back a view attachment when its editor registry is already destroyed", () => {
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  document.body.append(root);
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockVirtualizationController(
    adapter.blocks,
    adapter.selection,
    jest.fn(),
  );
  const registry = new BlockVirtualizationRegistry();
  registry.destroy();
  try {
    expect(() => attachBlockVirtualization(root, jest.fn(), registry, controller)).toThrow(
      "Virtualization registry is destroyed",
    );
    const replacement = new BlockVirtualizationRegistry();
    const occurrence = new BrowserInputRoot(root);
    const unbind = replacement.bind(getBrowserElementIdentity(root), occurrence);
    const detach = attachBlockVirtualization(root, jest.fn(), replacement, controller);
    expect(replacement.get(occurrence)).toBe(controller);
    detach();
    expect(replacement.get(occurrence)).toBeUndefined();
    unbind();
  } finally {
    root.remove();
  }
});

it("allows another attachment after geometry setup fails", () => {
  const root = document.createElement("div");
  const region = getBrowserElementIdentity(root);
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockVirtualizationController(
    adapter.blocks,
    adapter.selection,
    jest.fn(),
  );
  const registry = new BlockVirtualizationRegistry();
  const failure = new Error("geometry setup failed");
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const unbind = registry.bind(region, occurrence);
  expect(() =>
    controller.attach(
      region,
      () => {
        throw failure;
      },
      registry,
    ),
  ).toThrow(failure);
  const releaseGeometry = jest.fn();
  const detach = controller.attach(region, () => releaseGeometry, registry);
  const duplicateGeometry = jest.fn();
  expect(() => controller.attach(region, duplicateGeometry, registry)).toThrow(
    "Virtualization is already attached",
  );
  expect(duplicateGeometry).not.toHaveBeenCalled();
  detach();
  detach();
  expect(releaseGeometry).toHaveBeenCalledTimes(1);
  unbind();
  registry.destroy();
});

it("removes the view lookup before releasing its Root observation", () => {
  const root = document.createElement("div");
  const identity = getBrowserElementIdentity(root);
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockVirtualizationController(
    adapter.blocks,
    adapter.selection,
    jest.fn(),
  );
  const occurrence = {
    observeTextOwners: jest.fn(() => () => {}),
    captureRegionByIdentity: jest.fn(),
    isAttached: jest.fn(() => true),
  };
  const registry = new BlockVirtualizationRegistry();
  const observed = jest.fn();
  jest.spyOn(controller, "observeRoot").mockReturnValue(() => observed(registry.get(occurrence)));
  const unbind = registry.bind(identity, occurrence);
  const detach = controller.attach(identity, () => () => {}, registry);
  expect(registry.get(occurrence)).toBe(controller);
  detach();
  expect(observed).toHaveBeenCalledWith(undefined);
  unbind();
  registry.destroy();
});
