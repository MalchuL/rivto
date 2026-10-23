import { DefaultBlockBehavior } from "../block-behaviors/default-block-behavior";
import { ReactPanel } from "./react-panel";
import { BroadcastChannelProvider, YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage } from "@chulane/document-model";
import { createCaretSelection, createStructuralSelection } from "@chulane/rivto";
import { DBDocumentModel, DemoDatabase } from "../../../../demo/src/database";
import { EditorStorage } from "../editor/editor-storage";
import { createReactEditor } from "../editor/react-editor";
import { registerCollapse } from "../extensions/built-ins/page/collapse/register";
import {
  getEdgelessRuntime,
  installEdgelessRuntime,
} from "../extensions/built-ins/selection/edgeless-runtime";
import { EdgelessSurfaceRegistration } from "../surfaces/edgeless/register";
import { ChildrenPanel } from "@chulane/rivto";
import { EmbeddingPanel } from "@chulane/rivto";

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      if (attempt === 200) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
}

// Native EventTarget exercises listener registration/cleanup; these elements
// supply only the DOM containment and realm operations used by event routing.
class ElementTarget extends EventTarget {
  parentElement: ElementTarget | null = null;
  readonly attributes = new Map<string, string>();
  /**
   * Creates a fake element associated with the fixture document realm.
   *
   * @param ownerDocument - Fixture document realm that owns the element and its focus state.
   */
  constructor(readonly ownerDocument: DocumentRealm) {
    super();
  }
  /**
   * Stores an attribute on the fixture element.
   *
   * @param key - Property or attribute key to access.
   * @param value - Attribute string to store.
   */
  setAttribute(key: string, value: string): void {
    this.attributes.set(key, value);
  }
  /**
   * Reads an attribute from the fixture element.
   *
   * @param key - Property or attribute key to access.
   * @returns Stored string, or null when absent.
   */
  getAttribute(key: string): string | null {
    return this.attributes.get(key) ?? null;
  }
  /**
   * Checks whether the fixture stores an attribute, including empty values.
   *
   * @param name - Attribute name to inspect.
   * @returns True when the attribute exists.
   */
  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  /**
   * Walks fixture ancestors for a matching attribute selector.
   *
   * @param selector - Selector to match against this fixture and its ancestors.
   * @returns Matching element, or null if no ancestor matches.
   */
  closest(selector: string): ElementTarget | null {
    const key = selector.slice(1, -1);
    if (this.attributes.has(key)) {
      return this;
    }
    return this.parentElement?.closest(selector) ?? null;
  }
  /**
   * Checks whether a fixture element is contained in this element's parent chain.
   *
   * @param element - Element snapshot or DOM host used by the operation.
   * @returns Whether the element is this node or a descendant.
   */
  contains(element: ElementTarget | null): boolean {
    for (let current = element; current; current = current.parentElement) {
      if (current === this) {
        return true;
      }
    }
    return false;
  }
  /**
   * Marks this fixture element as the document's active element.
   */
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
}
class DocumentRealm extends EventTarget {
  activeElement: ElementTarget | null = null;
  readonly defaultView = Object.assign(new EventTarget(), { Element: ElementTarget });
  /**
   * Simulates a document realm without a native selection.
   *
   * @returns Always null.
   */
  getSelection(): null {
    return null;
  }
}
function root(realm: DocumentRealm): HTMLElement {
  return new ElementTarget(realm) as unknown as HTMLElement;
}
function event(type: string, target: HTMLElement, key?: string): Event {
  const value = new Event(type, { cancelable: true });
  Object.defineProperties(value, {
    target: { value: target },
    key: { value: key },
    ctrlKey: { value: false },
    metaKey: { value: false },
    altKey: { value: false },
    shiftKey: { value: false },
  });
  return value;
}

async function fixture() {
  const connections: string[] = [];
  const disconnections: string[] = [];
  const storage = new DocumentStorage({
    registry: new YjsDocumentRegistry(crypto.randomUUID()),
    createProviders: (id) => [
      {
        id,
        connect: async (doc) => {
          connections.push(doc.id);
        },
        disconnect: async (doc) => {
          disconnections.push(doc.id);
        },
      },
    ],
  });
  const modelA = await storage.create("A", [{ id: "same-id", type: "paragraph", content: "A" }]);
  const modelB = await storage.create("B", [{ id: "same-id", type: "paragraph", content: "B" }]);
  const seeds = new Map([
    ["A", modelA],
    ["B", modelB],
  ]);
  const core = new EditorStorage({
    openDocument: async (id) => {
      const model = seeds.get(id);
      seeds.delete(id);
      return model ?? storage.openDocument(id);
    },
    createEditor: (editor) => {
      editor.blockRegistry.defineBlock({ type: "paragraph" });
      return createReactEditor({ editor });
    },
  });
  const a = await core.acquireEditor("A");
  const b = await core.acquireEditor("B");
  const editor = a.editor;
  return { storage, a, b, core, editor: editor, connections, disconnections };
}

test("nested panels share a retained editor and leave acquisition release to the owner", async () => {
  const f = await fixture();
  const first = new ReactPanel(f.a.editor, new ChildrenPanel(f.a.editor, {}), {});
  const nested = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const other = new ReactPanel(f.b.editor, new ChildrenPanel(f.b.editor, {}), {});
  const closeFirst = first.destroy;
  const closeNested = nested.destroy;
  const closeOther = other.destroy;
  await eventually(() =>
    expect([first, nested, other].every((reactPanel) => reactPanel.getSnapshot().retained)).toBe(
      true,
    ),
  );
  expect(first.getSnapshot().document).toBe(nested.getSnapshot().document);
  expect(f.connections.filter((id) => id === "A")).toHaveLength(1);
  first.getSnapshot().api!.editor.blocks.updateBlock("same-id", { content: "Edited A" });
  expect(nested.getSnapshot().api!.editor.blocks.getBlockNode("same-id")?.content).toBe("Edited A");
  expect(other.getSnapshot().api!.editor.blocks.getBlockNode("same-id")?.content).toBe("B");
  first.setEnabled(false);
  nested.setEnabled(false);
  expect(f.core.getDocument("A")).toBeDefined();
  first.setEnabled(true);
  nested.setEnabled(true);
  expect(f.connections.filter((id) => id === "A")).toHaveLength(1);
  closeFirst();
  expect(f.core.getDocument("A")).toBeDefined();
  expect(f.disconnections).not.toContain("A");
  closeNested();
  expect(f.core.getDocument("A")).toBeDefined();
  await f.a.release();
  await eventually(() => expect(f.core.getDocument("A")).toBeUndefined());
  await eventually(() => expect(f.disconnections.filter((id) => id === "A")).toHaveLength(1));
  expect(f.core.getDocument("B")).toBeDefined();
  closeOther();
  await f.b.release();
  await eventually(() => expect(f.core.getDocument("B")).toBeUndefined());
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("a missing target keeps its document acquired and source undo restores it", async () => {
  const f = await fixture();
  const reactPanel = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const close = reactPanel.destroy;
  await eventually(() => expect(reactPanel.getSnapshot().retained).toBe(true));
  const api = reactPanel.getSnapshot().api!;
  api.editor.history.batchUpdates(() => api.editor.blocks.removeBlock("same-id"));
  expect(reactPanel.getSnapshot().status).toBe("missing");
  expect(f.core.getDocument("A")).toBeDefined();
  api.editor.history.undo();
  expect(reactPanel.getSnapshot().status).toBe("available");
  expect(api.editor.blocks.getBlockNode("same-id")?.content).toBe("A");
  close();
  await f.a.release();
  await f.b.release();
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("a replacement panel reuses explicit storage without releasing another occurrence", async () => {
  const f = await fixture();
  let reactPanel = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const closeCancelled = reactPanel.destroy;
  closeCancelled();
  const previous = reactPanel;
  reactPanel = new ReactPanel(f.editor, new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }));
  const close = reactPanel.destroy;
  closeCancelled();
  expect(reactPanel).not.toBe(previous);
  await eventually(() => expect(reactPanel.getSnapshot().retained).toBe(true));
  expect(reactPanel.getSnapshot().api!.editor.blocks).toBe(f.editor.blocks);
  expect(f.connections.filter((id) => id === "A")).toHaveLength(1);
  close();
  expect(f.core.getDocument("A")).toBeDefined();
  await f.a.release();
  await eventually(() => expect(f.core.getDocument("A")).toBeUndefined());
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test.each(["block", "edgeless"] as const)(
  "panel and shared selection calls replace the same root's pending restoration in %s",
  async (mode) => {
    const f = await fixture();
    const realm = new DocumentRealm();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    Object.assign(realm.defaultView, {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (frame: number) => {
        frames.delete(frame);
      },
    });
    const reactPanel = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
    reactPanel.mode.set(mode);
    const panelRoot = root(realm);
    reactPanel.setRoot(panelRoot);
    const close = reactPanel.destroy;
    await eventually(() => expect(reactPanel.getSnapshot().retained).toBe(true));
    const api = reactPanel.getSnapshot().api!;
    const calls: string[] = [];
    const cancelOld = api.selection.scheduleIfSelectionUnchanged(
      () => calls.push("old"),
      () => calls.push("cancelled"),
    );
    api.selection.scheduleIfSelectionUnchanged(() => {
      expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(panelRoot);
      calls.push("new");
    });
    expect(calls).toEqual(["cancelled"]);
    expect(frames.size).toBe(1);
    expect(api.selection.hasPendingSelectionCallback).toBe(true);
    expect(api.selection.hasPendingSelectionCallback).toBe(true);
    cancelOld();
    for (const callback of frames.values()) {
      callback(0);
    }
    expect(calls).toEqual(["cancelled", "new"]);
    expect(api.selection.hasPendingSelectionCallback).toBe(false);
    close();
    await f.a.release();
    await f.b.release();
    await f.core.destroy();
    await f.storage.destroy();
  },
);

test("replacing a root cancels only its restoration and retains another panel's DOM scope", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.assign(realm.defaultView, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback);
      return nextFrame;
    },
    cancelAnimationFrame: (frame: number) => {
      frames.delete(frame);
    },
  });
  const first = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const second = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  first.setRoot(root(realm));
  second.setRoot(root(realm));
  const closeFirst = first.destroy;
  const closeSecond = second.destroy;
  await eventually(() => expect(second.getSnapshot().retained).toBe(true));
  const calls: string[] = [];
  first.getSnapshot().api!.selection.scheduleIfSelectionUnchanged(
    () => calls.push("first"),
    () => calls.push("cancelled"),
  );
  second.getSnapshot().api!.selection.scheduleIfSelectionUnchanged(() => {
    expect(second.getSnapshot().api!.events.getRoot()).toBe(second.getRoot());
    calls.push("second");
  });
  first.setRoot(root(realm));
  expect(calls).toEqual(["cancelled"]);
  expect(frames.size).toBe(1);
  expect(first.getSnapshot().api!.selection.hasPendingSelectionCallback).toBe(false);
  expect(second.getSnapshot().api!.selection.hasPendingSelectionCallback).toBe(true);
  const activeRoot = f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot();
  for (const callback of frames.values()) {
    callback(0);
  }
  expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(activeRoot);
  expect(calls).toEqual(["cancelled", "second"]);
  closeFirst();
  closeSecond();
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test.each(["block", "edgeless"] as const)(
  "panel cleanup cancels local DOM work, remounts fresh bindings, and runtime teardown cancels surviving panels in %s",
  async (mode) => {
    const f = await fixture();
    const realm = new DocumentRealm();
    const frames = new Map<number, FrameRequestCallback>();
    let nextFrame = 0;
    Object.assign(realm.defaultView, {
      requestAnimationFrame: (callback: FrameRequestCallback) => {
        frames.set(++nextFrame, callback);
        return nextFrame;
      },
      cancelAnimationFrame: (frame: number) => {
        frames.delete(frame);
      },
    });
    let first = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
    const second = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
    first.mode.set(mode);
    second.mode.set(mode);
    const firstRoot = root(realm);
    first.setRoot(firstRoot);
    second.setRoot(root(realm));
    const closeFirst = first.destroy;
    const closeSecond = second.destroy;
    await eventually(() => expect(second.getSnapshot().retained).toBe(true));
    const firstApi = first.getSnapshot().api!;
    const firstSelection = firstApi.selection;
    const secondApi = second.getSnapshot().api!;
    const cancelled: string[] = [];
    firstApi.selection.scheduleIfSelectionUnchanged(
      () => {
        throw new Error("closed panel ran");
      },
      () => {
        cancelled.push("first");
      },
    );
    secondApi.selection.scheduleIfSelectionUnchanged(
      () => {
        throw new Error("destroyed runtime ran");
      },
      () => {
        cancelled.push("second");
        // A panel's cancellation can schedule shared work; teardown must cancel that too.
        secondApi.selection.scheduleIfSelectionUnchanged(
          () => {
            throw new Error("teardown work ran");
          },
          () => {
            cancelled.push("runtime");
          },
        );
      },
    );
    expect(frames.size).toBe(2);
    let inputs = 0;
    firstApi.events.register({ id: "local.input", type: "input" }, () => {
      inputs += 1;
      return false;
    });
    closeFirst();
    expect(cancelled).toEqual(["first"]);
    expect(frames.size).toBe(1);
    expect(secondApi.selection.hasPendingSelectionCallback).toBe(true);
    firstRoot.dispatchEvent(event("input", firstRoot));
    expect(inputs).toBe(0);

    first = new ReactPanel(f.editor, new ChildrenPanel(f.editor));
    first.mode.set(mode);
    first.setRoot(firstRoot);
    const closeRemounted = first.destroy;
    closeFirst();
    await eventually(() => expect(first.getSnapshot().retained).toBe(true));
    const remountedApi = first.getSnapshot().api!;
    expect(remountedApi).not.toBe(firstApi);
    expect(remountedApi.selection).not.toBe(firstSelection);
    remountedApi.events.register({ id: "local.input", type: "input" }, () => {
      inputs += 1;
      return false;
    });
    firstRoot.dispatchEvent(event("input", firstRoot));
    expect(inputs).toBe(1);
    remountedApi.selection.scheduleIfSelectionUnchanged(
      () => {
        throw new Error("destroyed remount ran");
      },
      () => {
        cancelled.push("remounted");
      },
    );
    expect(frames.size).toBe(2);
    let cleanups = 0;
    const cleanup = () => {
      cleanups += 1;
      expect(frames.size).toBe(0);
    };
    f.editor.extensions.install({ id: "cleanup.order", setup: () => cleanup });
    f.editor.destroy();
    expect(cancelled).toEqual(["first", "second", "runtime", "remounted"]);
    expect(cleanups).toBe(1);
    expect(secondApi.selection.hasPendingSelectionCallback).toBe(false);
    expect(remountedApi.selection.hasPendingSelectionCallback).toBe(false);
    closeSecond();
    closeRemounted();
    expect(cancelled).toHaveLength(4);
    await f.a.release();
    await f.b.release();
    await f.core.destroy();
    await f.storage.destroy();
  },
);

test("a standalone panel leaves editor and document disposal to its caller", async () => {
  const f = await fixture();
  const reactPanel = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const close = reactPanel.destroy;
  await eventually(() => expect(reactPanel.getSnapshot().retained).toBe(true));
  close();
  expect(f.editor.blocks.getBlockNode("same-id")?.content).toBe("A");
  expect(f.disconnections).not.toContain("A");
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("panel-local events and shortcuts reuse IDs, dispatch once, and preserve semantic keymap overrides", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const first = new ReactPanel(f.a.editor, new ChildrenPanel(f.a.editor, {}), {});
  const nested = new ReactPanel(f.b.editor, new ChildrenPanel(f.b.editor, {}), {});
  const firstRoot = root(realm);
  const nestedRoot = root(realm);
  (nestedRoot as unknown as ElementTarget).parentElement = firstRoot as unknown as ElementTarget;
  first.setRoot(firstRoot);
  nested.setRoot(nestedRoot);
  const closeFirst = first.destroy;
  const closeNested = nested.destroy;
  await eventually(() => expect(nested.getSnapshot().retained).toBe(true));
  let unfocusedDocument: string | undefined;
  f.editor.events.register(
    { id: "initial.document", type: "keydown", target: "window" },
    (value) => {
      if (value.raw.key === "initial") {
        unfocusedDocument = f.editor.blocks.getBlockNode("same-id")?.content;
      }
      return false;
    },
  );
  realm.defaultView.dispatchEvent(event("keydown", root(realm), "initial"));
  expect(unfocusedDocument).toBe("A");
  const calls: string[] = [];
  for (const reactPanel of [first, nested]) {
    const api = reactPanel.getSnapshot().api!;
    api.events.register({ id: "local.input", type: "input" }, () => {
      calls.push(api.editor.blocks.getBlockNode("same-id")!.content);
      return false;
    });
    api.keyboard.register({ id: "local.shortcut", keys: "x" }, () => {
      calls.push(`key:${api.editor.getDocument()!.id}`);
      return true;
    });
  }
  const gestures: string[] = [];
  for (const reactPanel of [first, nested]) {
    reactPanel
      .getSnapshot()
      .api!.events.register({ id: "local.drag", type: "pointermove", target: "window" }, () => {
        gestures.push(reactPanel.editor.getDocument().id);
        return false;
      });
  }
  let lostFocus = 0;
  first.subscribeDeactivation(() => {
    lostFocus += 1;
  });
  firstRoot.dispatchEvent(event("input", firstRoot));
  first.getSnapshot().api!.selection.set({
    type: "selection",
    anchorBlockId: "same-id",
    focusBlockId: "same-id",
    blocks: [{ id: "same-id", start: 0, end: -1 }],
  });
  nested.getSnapshot().api!.selection.set({
    type: "selection",
    anchorBlockId: "same-id",
    focusBlockId: "same-id",
    blocks: [{ id: "same-id", start: 0, end: -1 }],
  });
  const input = event("input", nestedRoot);
  firstRoot.dispatchEvent(input);
  nestedRoot.dispatchEvent(input);
  expect(calls).toEqual(["A", "B"]);
  expect(lostFocus).toBe(1);
  expect(nested.getSnapshot().api!.selection.isBlockSelected("same-id")).toBe(true);
  f.b.editor.keyboard.setKeymapOverride("local.shortcut", ["y"]);
  const inventory = f.b.editor.keyboard.list().filter((item) => item.id === "local.shortcut");
  expect(inventory).toHaveLength(1);
  expect(inventory[0]).toMatchObject({ installed: true, overridden: true, keys: ["y"] });
  nestedRoot.dispatchEvent(event("keydown", nestedRoot, "x"));
  expect(calls).toEqual(["A", "B"]);
  nestedRoot.dispatchEvent(event("keydown", nestedRoot, "y"));
  expect(calls).toEqual(["A", "B", "key:B"]);
  nested.getSnapshot().api!.selection.set({
    type: "selection",
    anchorBlockId: "same-id",
    focusBlockId: "same-id",
    blocks: [{ id: "same-id", start: 0, end: -1 }],
  });
  expect(nested.getSnapshot().api!.selection.isBlockSelected("same-id")).toBe(true);
  expect(first.getSnapshot().api!.selection.isBlockSelected("same-id")).toBe(true);
  firstRoot.dispatchEvent(event("pointerdown", firstRoot));
  expect(first.getSnapshot().api!.selection.isBlockSelected("same-id")).toBe(true);
  realm.defaultView.dispatchEvent(event("pointermove", nestedRoot));
  expect(gestures).toEqual(["A"]);
  realm.defaultView.dispatchEvent(event("pointerup", nestedRoot));
  realm.defaultView.dispatchEvent(event("pointermove", nestedRoot));
  expect(gestures).toEqual(["A", "B"]);
  closeNested();
  firstRoot.dispatchEvent(event("input", firstRoot));
  expect(calls.at(-1)).toBe("A");
  closeFirst();
  await f.a.release();
  await f.b.release();
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("hover routes to the pointed panel without activating it or clearing selection", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const full = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const nested = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const fullRoot = root(realm);
  const nestedRoot = root(realm);
  (nestedRoot as unknown as ElementTarget).parentElement = fullRoot as unknown as ElementTarget;
  full.setRoot(fullRoot);
  nested.setRoot(nestedRoot);
  const closeFull = full.destroy;
  const closeNested = nested.destroy;
  await eventually(() => expect(nested.getSnapshot().retained).toBe(true));
  const pointed: HTMLElement[] = [];
  for (const reactPanel of [full, nested]) {
    reactPanel
      .getSnapshot()
      .api!.events.register({ id: "hover", type: "pointermove", target: "window" }, ({ root }) => {
        pointed.push(root);
        return false;
      });
  }
  fullRoot.dispatchEvent(event("focusin", fullRoot));
  f.editor.selection.set(createStructuralSelection(["same-id"]));
  const selection = f.editor.selection.get();
  let changes = 0;
  let deactivations = 0;
  const stopSelection = f.editor.selection.subscribe(() => {
    changes += 1;
  });
  full.subscribeDeactivation(() => {
    deactivations += 1;
  });
  realm.defaultView.dispatchEvent(event("pointermove", nestedRoot));
  realm.defaultView.dispatchEvent(event("pointermove", fullRoot));
  expect(pointed).toEqual([nestedRoot, fullRoot]);
  expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(fullRoot);
  expect(f.editor.selection.get()).toEqual(selection);
  expect(changes).toBe(0);
  expect(deactivations).toBe(0);
  nestedRoot.dispatchEvent(event("pointerdown", nestedRoot));
  expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(nestedRoot);
  expect(deactivations).toBe(1);
  realm.defaultView.dispatchEvent(event("pointermove", fullRoot));
  expect(pointed.at(-1)).toBe(nestedRoot);
  realm.defaultView.dispatchEvent(event("pointerup", fullRoot));
  expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(nestedRoot);
  stopSelection();
  closeNested();
  closeFull();
  await f.a.release();
  await f.b.release();
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("events read each panel's surface type while sharing the core mode, managers, and canvas settings", async () => {
  const f = await fixture();
  expect(f.editor.panels.getSurfaceType()).toBe("block");
  expect("surfaceType" in f.editor).toBe(false);
  const options = { blockElementWidth: 321, avoidBlockElementOverlap: false };
  const restoreOptions = new EdgelessSurfaceRegistration(f.editor, options).dispose;
  const realm = new DocumentRealm();
  const full = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const embedded = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const fullRoot = root(realm);
  const embeddedRoot = root(realm);
  fullRoot.setAttribute("data-rivto-surface", "edgeless");
  embeddedRoot.setAttribute("data-rivto-surface", "block");
  (embeddedRoot as unknown as ElementTarget).parentElement = fullRoot as unknown as ElementTarget;
  full.setRoot(fullRoot);
  embedded.setRoot(embeddedRoot);
  const closeFull = full.destroy;
  const closeEmbedded = embedded.destroy;
  await eventually(() => expect(embedded.getSnapshot().retained).toBe(true));
  full.mode.set("edgeless");
  const fullApi = full.getSnapshot().api!;
  const embeddedApi = embedded.getSnapshot().api!;
  for (const api of [fullApi, embeddedApi]) {
    expect("surfaceType" in api).toBe(false);
    expect(api.mode).toBeDefined();
    expect(api.editor.surfaces).toBe(f.editor.surfaces);
    expect(EdgelessSurfaceRegistration.getOptions(api.editor.surfaces)).toBe(options);
  }
  const calls: string[] = [];
  f.editor.events.register({ id: "page.input", type: "keydown", mode: "block" }, ({ mode }) => {
    calls.push(mode);
    return true;
  });
  f.editor.events.register(
    { id: "canvas.input", type: "keydown", mode: "edgeless" },
    ({ mode }) => {
      calls.push(mode);
      return true;
    },
  );
  fullRoot.dispatchEvent(event("keydown", fullRoot, "x"));
  expect(calls).toEqual(["edgeless"]);
  expect(f.editor.panels.getSurfaceType()).toBe("edgeless");
  expect(embeddedApi.events.getSurfaceType()).toBe("block");
  let surfaceReads = 0;
  const getAttribute = embeddedRoot.getAttribute.bind(embeddedRoot);
  embeddedRoot.getAttribute = (name) => {
    if (name === "data-rivto-surface") {
      surfaceReads += 1;
    }
    return getAttribute(name);
  };
  embeddedRoot.dispatchEvent(event("keydown", embeddedRoot, "x"));
  expect(calls).toEqual(["edgeless", "block"]);
  expect(surfaceReads).toBe(1);
  expect(full.mode.get()).toBe("edgeless");
  expect(f.editor.panels.getSurfaceType()).toBe("block");
  expect(fullApi.events.getSurfaceType()).toBe("edgeless");
  expect(fullApi.events.getSurfaceType()).toBe("edgeless");
  expect(f.editor.panels.getSurfaceType()).toBe("block");
  closeEmbedded();
  closeFull();
  restoreOptions();
  expect(f.editor.panels.getSurfaceType()).toBe("block");
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("canvas adapters share installation and settings while selection belongs to one occurrence", async () => {
  const f = await fixture();
  const uninstall = installEdgelessRuntime(f.editor);
  const realm = new DocumentRealm();
  const first = new ReactPanel(f.a.editor, new ChildrenPanel(f.a.editor, {}), {});
  const duplicate = new ReactPanel(f.a.editor, new ChildrenPanel(f.a.editor, {}), {});
  const firstRoot = root(realm);
  const duplicateRoot = root(realm);
  first.setRoot(firstRoot);
  duplicate.setRoot(duplicateRoot);
  const closeFirst = first.destroy;
  const closeDuplicate = duplicate.destroy;
  await eventually(() => expect(duplicate.getSnapshot().retained).toBe(true));
  const api = first.getSnapshot().api!;
  f.editor.blockElements.setDefaultWidth(321);
  api.editor.elements.removeElements(
    api.editor.elements.getElementNodes().map((element) => element.id),
  );
  api.editor.blockElements.reconcile();
  expect(api.editor.elements.getElementNodes()[0]!.frame.width).toBe(321);
  const id = api.editor.elements.getElementNodes()[0]!.id;
  firstRoot.dispatchEvent(event("focusin", firstRoot));
  const canvas = getEdgelessRuntime(api);
  canvas.set([id]);
  expect(canvas.snapshot()).toMatchObject({ active: true, items: [id] });
  expect(getEdgelessRuntime(duplicate.getSnapshot().api!).snapshot()).toEqual({
    active: false,
    items: [],
  });
  expect(duplicate.getSnapshot().api!.selection.snapshot()).toBeUndefined();
  duplicateRoot.dispatchEvent(event("focusin", duplicateRoot));
  expect(canvas.snapshot()).toEqual({ active: false, items: [] });
  closeDuplicate();
  closeFirst();
  uninstall();
  await f.a.release();
  await f.b.release();
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("location lookup does not acquire a source, retains its ID after deletion, and follows relocation", async () => {
  const f = await fixture();
  f.a.document.blocks.insertBlock({ id: "target", type: "paragraph", content: "Source" });
  let acquisitions = 0;
  const acquire = f.core.acquireEditor.bind(f.core);
  f.core.acquireEditor = (...args) => {
    acquisitions += 1;
    return acquire(...args);
  };
  const locations: (string | undefined)[] = [];
  const stop = f.core.blockReferences.subscribeBlockLocation(
    { documentId: "A", blockId: "target" },
    (result) => {
      locations.push(result.documentId);
    },
  );
  await eventually(() => expect(locations.at(-1)).toBe("A"));
  expect(acquisitions).toBe(0);
  let searches = 0;
  const find = f.core.blockReferences.resolveBlock.bind(f.core.blockReferences);
  f.core.blockReferences.resolveBlock = (...args) => {
    searches += 1;
    return find(...args);
  };
  f.a.document.blocks.updateBlock("target", { content: "Text changed" });
  await Promise.resolve();
  expect(searches).toBe(0);
  f.a.document.blocks.removeBlock("target");
  await Promise.resolve();
  expect(locations.at(-1)).toBe("A");
  f.b.document.blocks.insertBlock({ id: "target", type: "paragraph", content: "Moved" });
  await eventually(() => expect(locations.at(-1)).toBe("B"));
  expect(acquisitions).toBe(0);
  stop();
  await f.a.release();
  await f.b.release();
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("two editors synchronize their two shared documents while each third document stays unloaded on the peer", async () => {
  const room = crypto.randomUUID();
  const channels: string[][] = [[], []];
  const database = new DemoDatabase();
  const stores = [0, 1].map(
    (user) =>
      new DocumentStorage({
        registry: new YjsDocumentRegistry(room),
        createDocumentModel: (crdt) => new DBDocumentModel(crdt, database),
        createProviders: (channel) => {
          channels[user]!.push(channel);
          return [new BroadcastChannelProvider(channel)];
        },
      }),
  );
  const first = stores[0]!;
  const second = stores[1]!;
  const modelA = await first.create("A", [
    { id: "shared", type: "paragraph", content: "Initial A" },
  ]);
  const modelB = await first.create("B", [
    { id: "shared", type: "paragraph", content: "Initial B" },
  ]);
  const modelC = await first.create("C", [
    { id: "shared", type: "paragraph", content: "Only first user" },
  ]);
  const modelD = await second.create("D", [
    { id: "shared", type: "paragraph", content: "Only second user" },
  ]);
  await eventually(() =>
    expect(second.getDocumentIds()).toEqual(expect.arrayContaining(["A", "B", "C", "D"])),
  );
  const seeds = [
    new Map([
      ["A", modelA],
      ["B", modelB],
      ["C", modelC],
    ]),
    new Map([["D", modelD]]),
  ];
  const cores = stores.map(
    (storage, user) =>
      new EditorStorage({
        openDocument: async (id) => {
          const model = seeds[user]!.get(id);
          seeds[user]!.delete(id);
          return model ?? storage.openDocument(id);
        },
        createEditor: (editor) => {
          editor.blockRegistry.defineBlock({ type: "paragraph" });
          return createReactEditor({ editor });
        },
      }),
  );
  const leases = await Promise.all(
    [
      ["A", "B", "C"],
      ["A", "B", "D"],
    ].map((ids, user) => Promise.all(ids.map((id) => cores[user]!.acquireEditor(id)))),
  );
  const panels = leases.map((entries, user) =>
    entries.map((entry) => new ReactPanel(entry.editor, new ChildrenPanel(entry.editor, {}), {})),
  );
  const cleanups = panels.flat().map((reactPanel) => reactPanel.destroy);
  await eventually(() =>
    expect(panels.flat().every((reactPanel) => reactPanel.getSnapshot().retained)).toBe(true),
  );
  await eventually(() =>
    expect(cores[1]!.getDocument("A")!.blocks.getBlockNode("shared")?.content).toBe("Initial A"),
  );
  panels[0]![0]!
    .getSnapshot()
    .api!.editor.blocks.updateBlock("shared", { content: "From first user" });
  panels[1]![1]!
    .getSnapshot()
    .api!.editor.blocks.updateBlock("shared", { content: "From second user" });
  panels[0]![2]!
    .getSnapshot()
    .api!.editor.blocks.updateBlock("shared", { content: "Private C edit" });
  panels[1]![2]!
    .getSnapshot()
    .api!.editor.blocks.updateBlock("shared", { content: "Private D edit" });
  await eventually(() =>
    expect(cores[1]!.getDocument("A")!.blocks.getBlockNode("shared")?.content).toBe(
      "From first user",
    ),
  );
  await eventually(() =>
    expect(cores[0]!.getDocument("B")!.blocks.getBlockNode("shared")?.content).toBe(
      "From second user",
    ),
  );
  expect(
    cores[0]!
      .getDocuments()
      .map((doc) => doc.id)
      .sort(),
  ).toEqual(["A", "B", "C"]);
  expect(
    cores[1]!
      .getDocuments()
      .map((doc) => doc.id)
      .sort(),
  ).toEqual(["A", "B", "D"]);
  const requested = channels.map((list) => list.map((channel) => JSON.parse(channel)[1]));
  expect(requested[0]).not.toContain("D");
  expect(requested[1]).not.toContain("C");
  const laterLease = await cores[1]!.acquireEditor("C");
  const later = new ReactPanel(laterLease.editor, new ChildrenPanel(laterLease.editor, {}), {});
  const closeLater = later.destroy;
  await eventually(() =>
    expect(later.getSnapshot().document?.blocks.getBlockNode("shared")?.content).toBe(
      "Private C edit",
    ),
  );
  closeLater();
  cleanups.forEach((close) => close());
  await Promise.all([...leases.flat(), laterLease].map((lease) => lease.release()));
  expect((await cores[1]!.acquireEditor("A")).editor.blocks.getBlockNode("shared")?.content).toBe(
    "From first user",
  );
  await Promise.all(cores.map((core) => core.destroy()));
  await Promise.all(stores.map((storage) => storage.destroy()));
});

test.each([10, 2000])(
  "panels own selection boundaries without repeated tree reads for %i blocks",
  async (count) => {
    const f = await fixture();
    f.a.document.blocks.insertBlock({
      id: "outside-parent",
      type: "paragraph",
      children: [
        {
          id: "branch",
          type: "paragraph",
          children: Array.from({ length: count }, (value, index) => ({
            id: `child-${index}`,
            type: "paragraph",
            content: "Child",
          })),
        },
      ],
    });
    const unregisterCollapse = registerCollapse(f.editor);
    const realm = new DocumentRealm();
    const full = new ReactPanel(f.a.editor, new ChildrenPanel(f.a.editor, {}), {});
    const embedded = new ReactPanel(
      f.editor,
      new EmbeddingPanel(f.editor, { rootBlockId: "branch" }),
      {},
    );
    const duplicate = new ReactPanel(
      f.editor,
      new EmbeddingPanel(f.editor, { rootBlockId: "branch" }),
      {},
    );
    const fullRoot = root(realm);
    const embeddedRoot = root(realm);
    const duplicateRoot = root(realm);
    (embeddedRoot as unknown as ElementTarget).parentElement = fullRoot as unknown as ElementTarget;
    full.setRoot(fullRoot);
    embedded.setRoot(embeddedRoot);
    duplicate.setRoot(duplicateRoot);
    const closeFull = full.destroy;
    const closeEmbedded = embedded.destroy;
    const closeDuplicate = duplicate.destroy;
    await eventually(() =>
      expect(
        [full, embedded, duplicate].every((reactPanel) => reactPanel.getSnapshot().retained),
      ).toBe(true),
    );
    const api = embedded.getSnapshot().api!;
    embeddedRoot.dispatchEvent(event("focusin", embeddedRoot));
    expect(f.editor.panels.getActive() ?? f.editor.panels.getDefault()).toBe(api);
    api.selection.set(createCaretSelection("same-id", 0));
    expect(f.a.editor.selection.get()).toBeUndefined();
    api.selection.set(
      createStructuralSelection(Array.from({ length: count }, (value, index) => `child-${index}`)),
    );
    expect(api.selection.snapshot()?.blocks).toHaveLength(count);
    expect(full.getSnapshot().api!.selection.snapshot()).toBeUndefined();
    expect(duplicate.getSnapshot().api!.selection.snapshot()).toBeUndefined();

    let parents = 0;
    let forests = 0;
    const getParent = f.a.document.blocks.getParentId.bind(f.a.document.blocks);
    const getBlocks = f.a.document.blocks.getBlocks.bind(f.a.document.blocks);
    f.a.document.blocks.getParentId = (id) => {
      parents += 1;
      return getParent(id);
    };
    f.a.document.blocks.getBlocks = () => {
      forests += 1;
      return getBlocks();
    };
    for (let index = 0; index < count; index += 1) {
      expect(api.selection.isBlockSelected(`child-${index}`)).toBe(true);
      expect(full.getSnapshot().api!.selection.isBlockSelected(`child-${index}`)).toBe(true);
      expect(duplicate.getSnapshot().api!.selection.isBlockSelected(`child-${index}`)).toBe(true);
    }
    expect(parents).toBe(0);
    expect(forests).toBe(0);

    const fullApi = full.getSnapshot().api!;
    const duplicateApi = duplicate.getSnapshot().api!;
    // Inactive panels paint coverage without gaining command ownership.
    fullApi.selection.delete();
    expect(f.a.document.blocks.hasBlock("child-0")).toBe(true);
    fullRoot.dispatchEvent(event("focusin", fullRoot));
    fullApi.selection.set(createStructuralSelection(["child-0", "same-id"]));
    expect(api.selection.isBlockSelected("child-0")).toBe(true);
    expect(duplicateApi.selection.isBlockSelected("child-0")).toBe(true);
    expect(api.selection.snapshot()).toBeUndefined();
    expect(f.b.editor.selection.isBlockSelected("same-id")).toBe(false);
    fullApi.selection.clear();
    for (const panel of [api, fullApi, duplicateApi]) {
      expect(panel.selection.isBlockSelected("child-0")).toBe(false);
    }
    embeddedRoot.dispatchEvent(event("focusin", embeddedRoot));
    api.selection.set(createCaretSelection("child-0", 0));
    for (const panel of [api, fullApi, duplicateApi]) {
      expect(panel.selection.isBlockSelected("child-0")).toBe(false);
    }

    api.selection.set(createCaretSelection("child-0", 0));
    // A hidden document ancestor is outside the embedding's displayed subtree.
    f.a.document.blocks.updateBlock("outside-parent", { listProps: { collapsed: true } });
    expect(api.selection.get()?.focusBlockId).toBe("child-0");
    f.a.document.blocks.updateBlock("branch", { listProps: { collapsed: true } });
    expect(api.selection.get()?.focusBlockId).toBe("branch");
    expect(f.a.editor.selection.get()?.focusBlockId).toBe("branch");
    expect(full.getSnapshot().api!.selection.snapshot()).toBeUndefined();
    api.selection.set(createCaretSelection("child-1", 0));
    expect(api.selection.get()?.focusBlockId).toBe("branch");
    f.a.document.blocks.updateBlock("branch", { listProps: { collapsed: false } });
    api.selection.set(createCaretSelection("child-0", 0));
    f.a.document.blocks.moveBlock("child-0", "outside-parent", "inside");
    expect(api.selection.snapshot()).toBeUndefined();
    expect(f.a.editor.selection.get()).toBeUndefined();
    api.selection.set(createCaretSelection("child-1", 0));
    duplicateRoot.dispatchEvent(event("focusin", duplicateRoot));
    expect(f.a.editor.selection.get()).toBeUndefined();
    expect(f.editor.panels.getActive() ?? f.editor.panels.getDefault()).toBe(
      duplicate.getSnapshot().api,
    );

    unregisterCollapse();
    closeDuplicate();
    closeEmbedded();
    closeFull();
    await f.a.release();
    await f.b.release();
    f.editor.destroy();
    await f.core.destroy();
    await f.storage.destroy();
  },
);

test("panel behavior resolves against its own document before any DOM root is mounted", async () => {
  const f = await fixture();
  const a = f.a.editor;
  const b = f.b.editor;
  expect(
    a.blockBehaviors.resolveAll({
      editor: a,
      block: a.blocks.getBlockNode("same-id")!,
    })[0],
  ).toBeInstanceOf(DefaultBlockBehavior);
  expect(
    b.blockBehaviors.resolveAll({
      editor: b,
      block: b.blocks.getBlockNode("same-id")!,
    })[0],
  ).toBeInstanceOf(DefaultBlockBehavior);
  expect(a.blockListProps.prepare({})).toEqual({});
  expect(() => a.blockListProps.validate({})).not.toThrow();
  await f.a.release();
  await f.b.release();
  f.editor.destroy();
  await f.core.destroy();
  await f.storage.destroy();
});

test("destroying a runtime during drag releases window pointer ownership to surviving editors", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const first = new ReactPanel(f.a.editor, new ChildrenPanel(f.a.editor, {}), {});
  const second = new ReactPanel(f.b.editor, new ChildrenPanel(f.b.editor, {}), {});
  const firstRoot = root(realm);
  const secondRoot = root(realm);
  first.setRoot(firstRoot);
  second.setRoot(secondRoot);
  const closeFirst = first.destroy;
  const closeSecond = second.destroy;
  await eventually(() => expect(second.getSnapshot().retained).toBe(true));
  let moves = 0;
  second
    .getSnapshot()
    .api!.events.register(
      { id: "surviving.pointer", type: "pointermove", target: "window" },
      () => {
        moves += 1;
        return false;
      },
    );
  firstRoot.dispatchEvent(event("pointerdown", firstRoot));
  f.a.editor.destroy();
  realm.defaultView.dispatchEvent(event("pointermove", secondRoot));
  expect(moves).toBe(1);
  closeFirst();
  closeSecond();
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("panel keymap updates share inventory and dispatch without inheriting manager state", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const reactPanel = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const surface = root(realm);
  reactPanel.setRoot(surface);
  const close = reactPanel.destroy;
  await eventually(() => expect(reactPanel.getSnapshot().retained).toBe(true));
  const api = reactPanel.getSnapshot().api!;
  let calls = 0;
  api.keyboard.register({ id: "local.action", keys: "a" }, () => {
    calls += 1;
    return true;
  });
  api.keyboard.replaceKeymap({ "local.action": ["b"] });
  expect(api.keyboard.list()).toBe(f.editor.keyboard.list());
  expect(api.keyboard.revision).toBe(f.editor.keyboard.revision);
  expect(f.editor.keyboard.list().find((binding) => binding.id === "local.action")?.keys).toEqual([
    "b",
  ]);
  surface.dispatchEvent(event("keydown", surface, "a"));
  expect(calls).toBe(0);
  surface.dispatchEvent(event("keydown", surface, "b"));
  expect(calls).toBe(1);
  f.editor.panels.cancelPendingSelections();
  expect(f.editor.blocks.getBlockNode("same-id")?.content).toBe("A");
  close();
  surface.dispatchEvent(event("keydown", surface, "b"));
  expect(calls).toBe(1);
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("retained slash and clipboard APIs keep their surface without changing the active panel", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const canvas = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const page = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const canvasRoot = root(realm);
  const pageRoot = root(realm);
  canvasRoot.setAttribute("data-rivto-surface", "edgeless");
  pageRoot.setAttribute("data-rivto-surface", "block");
  canvas.setRoot(canvasRoot);
  page.setRoot(pageRoot);
  const closeCanvas = canvas.destroy;
  const closePage = page.destroy;
  await eventually(() => expect(page.getSnapshot().retained).toBe(true));
  const canvasApi = canvas.getSnapshot().api!;
  const pageApi = page.getSnapshot().api!;
  canvasRoot.dispatchEvent(event("focusin", canvasRoot));
  const calls: string[] = [];
  const disposeCommand = f.editor.slashCommands.register({
    id: "panel.explicit",
    title: "Explicit panel",
    execute: ({ reactPanel }) => {
      calls.push(reactPanel.events.getSurfaceType());
      expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(canvasRoot);
    },
  });
  await Promise.resolve();
  pageApi.slashCommands.execute("panel.explicit", { blockId: "same-id" });
  canvasApi.slashCommands.execute("panel.explicit", { blockId: "same-id" });
  expect(calls).toEqual(["block", "edgeless"]);
  // Hover dispatch supplies its receiver without replacing the focused root.
  f.editor.events.register({ id: "panel.hover", type: "pointermove" }, ({ reactPanel, mode }) => {
    expect(reactPanel).toBe(pageApi);
    expect(mode).toBe("block");
    expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(canvasRoot);
    return false;
  });
  pageRoot.dispatchEvent(event("pointermove", pageRoot));
  canvasApi.selection.set(createCaretSelection("same-id", 1));
  pageApi.clipboard.paste({ text: "Unfocused paste", defaultBlockType: "paragraph" });
  expect(f.editor.blocks.getBlockNode("same-id")?.content).toBe("A");
  const { ElementPasteStrategy } =
    await import("../extensions/built-ins/clipboard/element-paste-strategy");
  const removeStrategy = f.editor.pasteStrategies.register(
    "panel.elements",
    new ElementPasteStrategy(f.editor),
  );
  const bundle = {
    version: 4 as const,
    blocks: [],
    elements: [
      {
        childIds: [],
        id: "visual-source",
        type: "text",
        frame: { x: 0, y: 0, width: 100, height: 40 },
        zIndex: 1,
        props: { text: "Paste" },
      },
    ],
  };
  const before = f.editor.elements.getElementNodes().filter(({ type }) => type === "text").length;
  pageApi.clipboard.paste({ bundle, defaultBlockType: "paragraph" });
  expect(f.editor.elements.getElementNodes().filter(({ type }) => type === "text")).toHaveLength(
    before,
  );
  canvasApi.clipboard.paste({ bundle });
  expect(f.editor.elements.getElementNodes().filter(({ type }) => type === "text")).toHaveLength(
    before + 1,
  );
  expect(f.editor.panels.getActiveRoot() ?? f.editor.panels.getDefaultRoot()).toBe(canvasRoot);
  removeStrategy();
  disposeCommand();
  closePage();
  closeCanvas();
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("panel editors share runtime registrations and keep independent DOM managers", async () => {
  const f = await fixture();
  const first = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const second = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const a = first.getSnapshot().api!;
  const b = second.getSnapshot().api!;
  expect(a).toBe(first);
  expect(a.editor).toBe(f.editor);
  expect(b.editor).toBe(f.editor);
  expect(a.editor.blocks).toBe(b.editor.blocks);
  expect(a.editor.history).toBe(b.editor.history);
  expect(a.editor.pasteStrategies).toBe(b.editor.pasteStrategies);
  expect(a.events).not.toBe(b.events);
  expect(a.selection).not.toBe(b.selection);
  expect("readDOM" in f.editor.selection).toBe(false);
  expect("createViewApi" in a.clipboard).toBe(false);
  expect(a.blocks).not.toBe(a.document.blocks);
  expect("registerFormatter" in a.clipboard).toBe(false);
  expect("register" in a.slashCommands).toBe(false);
  const close = first.destroy;
  await eventually(() => expect(first.getSnapshot().retained).toBe(true));
  close();
  b.editor.blocks.updateBlock("same-id", { content: "Runtime remains available" });
  expect(b.editor.blocks.getBlockNode("same-id")?.content).toBe("Runtime remains available");
  second.destroy();
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("active lookup stays empty until interaction while default prefers the full document", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const subtree = new ReactPanel(
    f.editor,
    new EmbeddingPanel(f.editor, { rootBlockId: "same-id" }),
    {},
  );
  const full = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const subtreeRoot = root(realm);
  const fullRoot = root(realm);
  subtree.setRoot(subtreeRoot);
  full.setRoot(fullRoot);
  expect(f.editor.panels.getActive()).toBeUndefined();
  expect(f.editor.panels.getDefault()).toBe(full);
  subtreeRoot.dispatchEvent(event("focusin", subtreeRoot));
  expect(f.editor.panels.getActive()).toBe(subtree);
  expect(f.editor.panels.getDefault()).toBe(full);
  subtree.setRoot(null);
  expect(f.editor.panels.getActive()).toBeUndefined();
  expect(f.editor.panels.getDefault()).toBe(full);
  full.setRoot(null);
  subtree.destroy();
  full.destroy();
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});

test("handled pointer events can preserve native defaults without reaching later editor handlers", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const reactPanel = new ReactPanel(f.editor, new ChildrenPanel(f.editor, {}), {});
  const panelRoot = root(realm);
  reactPanel.setRoot(panelRoot);
  const close = reactPanel.destroy;
  await eventually(() => expect(reactPanel.getSnapshot().retained).toBe(true));
  const calls: string[] = [];
  for (const preventDefault of [false, true]) {
    const removeFirst = f.editor.events.register(
      { id: "gesture.first", type: "pointerdown", preventDefault },
      () => {
        calls.push("first");
        return true;
      },
    );
    const removeSecond = f.editor.events.register(
      { id: "gesture.second", type: "pointerdown" },
      () => {
        calls.push("second");
        return true;
      },
    );
    const down = event("pointerdown", panelRoot);
    panelRoot.dispatchEvent(down);
    expect(down.defaultPrevented).toBe(preventDefault);
    removeFirst();
    removeSecond();
  }
  expect(calls).toEqual(["first", "first"]);
  close();
  await f.a.release();
  await f.b.release();
  await f.core.destroy();
  await f.storage.destroy();
});
