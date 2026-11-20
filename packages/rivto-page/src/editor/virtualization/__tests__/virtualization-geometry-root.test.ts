import { BrowserInputRoot, getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { TestBlockEditorAdapter } from "../../../test-utils/test-block-editor-adapter";
import { BlockVirtualizationController } from "../block-virtualization-controller";
import { BlockVirtualizationRegistry } from "../block-virtualization-registry";
import { attachBlockVirtualization } from "../browser/attach-block-virtualization";

it("observes geometry only while the matching Root is bound, regardless of mount order", () => {
  const element = document.createElement("div");
  const host = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.append(host);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const foreign = new BrowserInputRoot(document.createElement("div"));
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockVirtualizationController(
    adapter.blocks,
    adapter.selection,
    jest.fn(),
  );
  const registry = new BlockVirtualizationRegistry();
  const onMargin = jest.fn();
  const detach = attachBlockVirtualization(host, onMargin, registry, controller);
  try {
    expect(onMargin).not.toHaveBeenCalled();
    const unbindForeign = registry.bind(foreign.getElementIdentity(), foreign);
    expect(onMargin).not.toHaveBeenCalled();
    unbindForeign();
    const unbind = registry.bind(getBrowserElementIdentity(element), root);
    expect(onMargin).toHaveBeenCalledTimes(1);
    unbind();
    window.dispatchEvent(new Event("resize"));
    expect(onMargin).toHaveBeenCalledTimes(1);
    const unbindAgain = registry.bind(getBrowserElementIdentity(element), root);
    expect(onMargin).toHaveBeenCalledTimes(2);
    detach();
    window.dispatchEvent(new Event("resize"));
    expect(onMargin).toHaveBeenCalledTimes(2);
    unbindAgain();
  } finally {
    detach();
    registry.destroy();
    foreign.detach();
    root.detach();
    element.remove();
  }
});

it("releases geometry when text-owner observation fails during binding", () => {
  const element = document.createElement("div");
  const host = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  element.append(host);
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  const failure = new Error("text owner setup failed");
  const owners = jest.spyOn(root, "observeTextOwners").mockImplementation(() => {
    throw failure;
  });
  const adapter = new TestBlockEditorAdapter();
  const controller = new BlockVirtualizationController(
    adapter.blocks,
    adapter.selection,
    jest.fn(),
  );
  const registry = new BlockVirtualizationRegistry();
  const onMargin = jest.fn();
  const detach = attachBlockVirtualization(host, onMargin, registry, controller);
  try {
    expect(() => registry.bind(getBrowserElementIdentity(element), root)).toThrow(failure);
    expect(onMargin).toHaveBeenCalledTimes(1);
    window.dispatchEvent(new Event("resize"));
    expect(onMargin).toHaveBeenCalledTimes(1);
    owners.mockRestore();
    const unbind = registry.bind(getBrowserElementIdentity(element), root);
    expect(onMargin).toHaveBeenCalledTimes(2);
    unbind();
  } finally {
    owners.mockRestore();
    detach();
    registry.destroy();
    root.detach();
    element.remove();
  }
});
