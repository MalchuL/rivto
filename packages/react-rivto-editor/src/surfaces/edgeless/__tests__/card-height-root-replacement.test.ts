/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { observeCardHeightWhileMounted } from "../card-height-observation";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("replaces the Root for a mounted card and releases its previous measurement", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const card = panel.elements.insertElement({
    type: "rectangle",
    frame: { x: 0, y: 0, width: 720, height: 120 },
    zIndex: 0,
  });
  const firstRoot = document.createElement("div");
  const secondRoot = document.createElement("div");
  const host = document.createElement("div");
  const content = document.createElement("div");
  const child = document.createElement("div");
  content.append(child);
  host.append(content);
  firstRoot.append(host);
  document.body.append(firstRoot, secondRoot);
  let height = 240;
  Object.defineProperty(content, "scrollHeight", { get: () => height });
  const callbacks: ResizeObserverCallback[] = [];
  const disconnects: jest.Mock[] = [];
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: jestApi.fn().mockImplementation((callback: ResizeObserverCallback) => {
      callbacks.push(callback);
      const disconnect = jestApi.fn();
      disconnects.push(disconnect);
      return { observe: jestApi.fn(), disconnect };
    }),
  });
  let release: (() => void) | undefined;
  try {
    panel.setRoot(firstRoot);
    release = observeCardHeightWhileMounted(
      panel,
      panel.elements.getElementNode(card.id)!,
      getBrowserElementIdentity(host),
      getBrowserElementIdentity(content),
    );
    expect(callbacks).toHaveLength(1);
    panel.setRoot(null);
    secondRoot.append(host);
    height = 300;
    panel.setRoot(secondRoot);
    expect(disconnects[0]).toHaveBeenCalledTimes(1);
    expect(callbacks).toHaveLength(2);
    await Promise.resolve();
    expect(panel.elements.getElementNode(card.id)?.frame.height).toBe(302);
    height = 400;
    callbacks[0]!([], {} as ResizeObserver);
    await Promise.resolve();
    expect(panel.elements.getElementNode(card.id)?.frame.height).toBe(302);
    callbacks[1]!([], {} as ResizeObserver);
    await Promise.resolve();
    expect(panel.elements.getElementNode(card.id)?.frame.height).toBe(402);
    release();
    expect(disconnects[1]).toHaveBeenCalledTimes(1);
  } finally {
    release?.();
    panel.editor.destroy();
    await core.destroy();
    firstRoot.remove();
    secondRoot.remove();
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
  }
});

test("keeps the replacement observer when the Root changes during observer setup", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const card = panel.elements.insertElement({
    type: "rectangle",
    frame: { x: 0, y: 0, width: 720, height: 120 },
    zIndex: 0,
  });
  const firstRoot = document.createElement("div");
  const secondRoot = document.createElement("div");
  const host = document.createElement("div");
  const content = document.createElement("div");
  host.append(content);
  firstRoot.append(host);
  document.body.append(firstRoot, secondRoot);
  Object.defineProperty(content, "scrollHeight", { value: 240 });
  const disconnects: jest.Mock[] = [];
  const previous = Object.getOwnPropertyDescriptor(window, "ResizeObserver");
  Object.defineProperty(window, "ResizeObserver", {
    configurable: true,
    value: jestApi.fn().mockImplementation(() => {
      const index = disconnects.length;
      const disconnect = jestApi.fn();
      disconnects.push(disconnect);
      return {
        observe: () => {
          if (index === 0) {
            panel.setRoot(null);
            secondRoot.append(host);
            panel.setRoot(secondRoot);
          }
        },
        disconnect,
      };
    }),
  });
  let release: (() => void) | undefined;
  try {
    panel.setRoot(firstRoot);
    release = observeCardHeightWhileMounted(
      panel,
      panel.elements.getElementNode(card.id)!,
      getBrowserElementIdentity(host),
      getBrowserElementIdentity(content),
    );
    expect(disconnects).toHaveLength(2);
    expect(disconnects[0]).toHaveBeenCalledTimes(1);
    release();
    expect(disconnects[1]).toHaveBeenCalledTimes(1);
  } finally {
    release?.();
    panel.editor.destroy();
    await core.destroy();
    firstRoot.remove();
    secondRoot.remove();
    if (previous) {
      Object.defineProperty(window, "ResizeObserver", previous);
    } else {
      Reflect.deleteProperty(window, "ResizeObserver");
    }
  }
});
