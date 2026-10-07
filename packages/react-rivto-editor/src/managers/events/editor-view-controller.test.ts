import { createCaretSelection, createStructuralSelection } from "@chulane/rivto";
import { registerCollapse } from "../../extensions/built-ins/page/collapse/register";
import { DocumentStorage } from "@chulane/document-model";
import { DemoDatabase, DBDocumentModel } from "../../../../../demo/src/database";
import { BroadcastChannelProvider, YjsDocumentRegistry } from "@chulane/crdt-doc";
import { EditorStorage } from "../../editor-storage";
import { createReactEditor } from "../../react-editor";
import { EditorViewController } from "./editor-view-controller";
import { getEdgelessRuntime, installEdgelessRuntime } from "../../extensions/built-ins/selection/edgeless-runtime";
import { reconcileBlockElements, setBlockElementDefaultWidth } from "../../elements/block-element-projection";
import { getEdgelessSurfaceOptions, registerEdgelessSurface } from "../../extensions/edgeless/register";

async function eventually(assertion: () => void): Promise<void> {
  for (let attempt = 0; ; attempt += 1) {
    try { assertion(); return; }
    catch (error) {
      if (attempt === 200) throw error;
      await new Promise((resolve) => setTimeout(resolve, 2));
    }
  }
}

// Native EventTarget exercises listener registration/cleanup; these elements
// supply only the DOM containment and realm operations used by event routing.
class ElementTarget extends EventTarget {
  parentElement: ElementTarget | null = null;
  readonly attributes = new Map<string, string>();
  constructor(readonly ownerDocument: DocumentRealm) { super(); }
  setAttribute(key: string, value: string): void { this.attributes.set(key, value); }
  getAttribute(key: string): string | null { return this.attributes.get(key) ?? null; }
  closest(selector: string): ElementTarget | null {
    const key = selector.slice(1, -1);
    if (this.attributes.has(key)) return this;
    return this.parentElement?.closest(selector) ?? null;
  }
  contains(element: ElementTarget | null): boolean {
    for (let current = element; current; current = current.parentElement) if (current === this) return true;
    return false;
  }
  focus(): void { this.ownerDocument.activeElement = this; }
}
class DocumentRealm extends EventTarget {
  activeElement: ElementTarget | null = null;
  readonly defaultView = Object.assign(new EventTarget(), { Element: ElementTarget });
  getSelection(): null { return null; }
}
function root(realm: DocumentRealm): HTMLElement {
  return new ElementTarget(realm) as unknown as HTMLElement;
}
function event(type: string, target: HTMLElement, key?: string): Event {
  const value = new Event(type, { cancelable: true });
  Object.defineProperties(value, {
    target: { value: target }, key: { value: key }, ctrlKey: { value: false },
    metaKey: { value: false }, altKey: { value: false }, shiftKey: { value: false },
  });
  return value;
}

async function fixture() {
  const connections: string[] = [];
  const disconnections: string[] = [];
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()), createProviders: (id) => [{
    id, connect: async (doc) => { connections.push(doc.id); }, disconnect: async (doc) => { disconnections.push(doc.id); },
  }] });
  const modelA = await storage.create("A", [{ id: "same-id", type: "paragraph", content: "A" }]);
  const modelB = await storage.create("B", [{ id: "same-id", type: "paragraph", content: "B" }]);
  const seeds = new Map([["A", modelA], ["B", modelB]]);
  const core = new EditorStorage({ openDocument: async (id) => { const model = seeds.get(id); seeds.delete(id); return model ?? storage.openDocument(id); }, createEditor: (editor) => { editor.blockRegistry.defineBlock({ type: "paragraph" }); return createReactEditor({ editor }); } });
  const a = await core.acquireEditor("A"); const b = await core.acquireEditor("B");
  const editor = a.editor;
  return { storage, a, b, core, editor, connections, disconnections };
}

test("nested views acquire once per model, retain independently, and release on final cleanup", async () => {
  const f = await fixture();
  const first = new EditorViewController(f.a.editor, undefined, f.core);
  const nested = new EditorViewController(f.editor, "same-id", f.core);
  const other = new EditorViewController(f.b.editor, undefined, f.core);
  const closeFirst = first.mount(); const closeNested = nested.mount(); const closeOther = other.mount();
  await eventually(() => expect([first, nested, other].every((view) => view.getSnapshot().retained)).toBe(true));
  await f.a.release(); await f.b.release();
  expect(first.getSnapshot().document).toBe(nested.getSnapshot().document);
  expect(f.connections.filter((id) => id === "A")).toHaveLength(1);
  first.getSnapshot().api!.blocks.updateBlock("same-id", { content: "Edited A" });
  expect(nested.getSnapshot().api!.blocks.getBlockNode("same-id")?.content).toBe("Edited A");
  expect(other.getSnapshot().api!.blocks.getBlockNode("same-id")?.content).toBe("B");
  first.setEnabled(false);
  nested.setEnabled(false);
  expect(f.core.getDocument("A")).toBeDefined();
  first.setEnabled(true); nested.setEnabled(true);
  expect(f.connections.filter((id) => id === "A")).toHaveLength(1);
  closeFirst();
  expect(f.core.getDocument("A")).toBeDefined();
  expect(f.disconnections).not.toContain("A");
  closeNested();
  await eventually(() => expect(f.core.getDocument("A")).toBeUndefined());
  await eventually(() => expect(f.disconnections.filter((id) => id === "A")).toHaveLength(1));
  expect(f.core.getDocument("B")).toBeDefined();
  closeOther();
  await eventually(() => expect(f.core.getDocument("B")).toBeUndefined());
  f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("a missing target keeps its document acquired and source undo restores it", async () => {
  const f = await fixture();
  const view = new EditorViewController(f.editor, "same-id", f.core);
  const close = view.mount();
  await eventually(() => expect(view.getSnapshot().retained).toBe(true));
  await f.a.release();
  const api = view.getSnapshot().api!;
  api.history.batchUpdates(() => api.blocks.removeBlock("same-id"));
  expect(view.getSnapshot().status).toBe("missing");
  expect(f.core.getDocument("A")).toBeDefined();
  api.history.undo();
  expect(view.getSnapshot().status).toBe("available");
  expect(api.blocks.getBlockNode("same-id")?.content).toBe("A");
  close(); await f.b.release(); f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("a view can remount with explicit storage without releasing another occurrence", async () => {
  const f = await fixture();
  const view = new EditorViewController(f.editor, "same-id", f.core);
  const closeCancelled = view.mount();
  closeCancelled();
  const close = view.mount();
  await eventually(() => expect(view.getSnapshot().retained).toBe(true));
  await f.a.release();
  expect(view.getSnapshot().api!.blocks).toBe(f.editor.blocks);
  expect(f.connections.filter((id) => id === "A")).toHaveLength(1);
  close();
  await eventually(() => expect(f.core.getDocument("A")).toBeUndefined());
  await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});

test.each(["block", "edgeless"] as const)("view and shared selection calls replace the same root's pending restoration in %s", async (mode) => {
  const f = await fixture();
  f.editor.mode.set(mode);
  const realm = new DocumentRealm();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.assign(realm.defaultView, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback); return nextFrame;
    },
    cancelAnimationFrame: (frame: number) => { frames.delete(frame); },
  });
  const view = new EditorViewController(f.editor);
  const viewRoot = root(realm);
  view.setRoot(viewRoot);
  const close = view.mount();
  await eventually(() => expect(view.getSnapshot().retained).toBe(true));
  const api = view.getSnapshot().api!;
  const calls: string[] = [];
  const cancelOld = api.selection.scheduleIfSelectionUnchanged(() => calls.push("old"), () => calls.push("cancelled"));
  api.events.runInView(() => f.editor.selection.scheduleIfSelectionUnchanged(() => {
    expect(f.editor.events.getRoot()).toBe(viewRoot);
    calls.push("new");
  }));
  expect(calls).toEqual(["cancelled"]);
  expect(frames.size).toBe(1);
  expect(api.selection.hasPendingSelectionCallback).toBe(true);
  expect(f.editor.selection.hasPendingSelectionCallback).toBe(true);
  cancelOld();
  for (const callback of frames.values()) callback(0);
  expect(calls).toEqual(["cancelled", "new"]);
  expect(api.selection.hasPendingSelectionCallback).toBe(false);
  close();
  await f.a.release(); await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});

test("replacing a root cancels only its restoration and retains another view's DOM scope", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.assign(realm.defaultView, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback); return nextFrame;
    },
    cancelAnimationFrame: (frame: number) => { frames.delete(frame); },
  });
  const first = new EditorViewController(f.editor);
  const second = new EditorViewController(f.editor);
  first.setRoot(root(realm)); second.setRoot(root(realm));
  const closeFirst = first.mount(); const closeSecond = second.mount();
  await eventually(() => expect(second.getSnapshot().retained).toBe(true));
  const calls: string[] = [];
  first.getSnapshot().api!.selection.scheduleIfSelectionUnchanged(() => calls.push("first"), () => calls.push("cancelled"));
  second.getSnapshot().api!.selection.scheduleIfSelectionUnchanged(() => {
    expect(f.editor.events.getRoot()).toBe(second.getRoot());
    calls.push("second");
  });
  first.setRoot(root(realm));
  expect(calls).toEqual(["cancelled"]);
  expect(frames.size).toBe(1);
  expect(first.getSnapshot().api!.selection.hasPendingSelectionCallback).toBe(false);
  expect(second.getSnapshot().api!.selection.hasPendingSelectionCallback).toBe(true);
  (f.editor.events as import("./event-manager").EventManager).withViewRoot(first.getRoot(), () => {
    for (const callback of frames.values()) callback(0);
    expect(f.editor.events.getRoot()).toBe(first.getRoot());
  });
  expect(calls).toEqual(["cancelled", "second"]);
  closeFirst(); closeSecond();
  await f.a.release(); await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});

test.each(["block", "edgeless"] as const)("view cleanup cancels local DOM work, remounts fresh bindings, and runtime teardown cancels surviving views in %s", async (mode) => {
  const f = await fixture();
  f.editor.mode.set(mode);
  const realm = new DocumentRealm();
  const frames = new Map<number, FrameRequestCallback>();
  let nextFrame = 0;
  Object.assign(realm.defaultView, {
    requestAnimationFrame: (callback: FrameRequestCallback) => {
      frames.set(++nextFrame, callback); return nextFrame;
    },
    cancelAnimationFrame: (frame: number) => { frames.delete(frame); },
  });
  const first = new EditorViewController(f.editor);
  const second = new EditorViewController(f.editor);
  const firstRoot = root(realm);
  first.setRoot(firstRoot); second.setRoot(root(realm));
  const closeFirst = first.mount(); const closeSecond = second.mount();
  await eventually(() => expect(second.getSnapshot().retained).toBe(true));
  const firstApi = first.getSnapshot().api!;
  const secondApi = second.getSnapshot().api!;
  const cancelled: string[] = [];
  firstApi.selection.scheduleIfSelectionUnchanged(() => { throw new Error("closed view ran"); }, () => { cancelled.push("first"); });
  secondApi.selection.scheduleIfSelectionUnchanged(() => { throw new Error("destroyed runtime ran"); }, () => {
    cancelled.push("second");
    // A view's cancellation can schedule shared work; teardown must cancel that too.
    f.editor.selection.scheduleIfSelectionUnchanged(() => { throw new Error("teardown work ran"); }, () => { cancelled.push("runtime"); });
  });
  expect(frames.size).toBe(2);
  let inputs = 0;
  firstApi.events.register({ id: "local.input", type: "input" }, () => { inputs += 1; return false; });
  closeFirst();
  expect(cancelled).toEqual(["first"]);
  expect(frames.size).toBe(1);
  expect(secondApi.selection.hasPendingSelectionCallback).toBe(true);
  firstRoot.dispatchEvent(event("input", firstRoot));
  expect(inputs).toBe(0);

  const closeRemounted = first.mount();
  await eventually(() => expect(first.getSnapshot().retained).toBe(true));
  const remountedApi = first.getSnapshot().api!;
  expect(remountedApi).not.toBe(firstApi);
  remountedApi.events.register({ id: "local.input", type: "input" }, () => { inputs += 1; return false; });
  firstRoot.dispatchEvent(event("input", firstRoot));
  expect(inputs).toBe(1);
  remountedApi.selection.scheduleIfSelectionUnchanged(() => { throw new Error("destroyed remount ran"); }, () => { cancelled.push("remounted"); });
  expect(frames.size).toBe(2);
  let cleanups = 0;
  const cleanup = () => { cleanups += 1; expect(frames.size).toBe(0); };
  f.editor.extensions.install({ id: "cleanup.order", setup: () => cleanup });
  f.editor.destroy();
  expect(cancelled).toEqual(["first", "second", "remounted", "runtime"]);
  expect(cleanups).toBe(1);
  expect(secondApi.selection.hasPendingSelectionCallback).toBe(false);
  expect(remountedApi.selection.hasPendingSelectionCallback).toBe(false);
  closeSecond(); closeRemounted();
  expect(cancelled).toHaveLength(4);
  await f.a.release(); await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});

test("a standalone view leaves editor and document disposal to its caller", async () => {
  const f = await fixture();
  const view = new EditorViewController(f.editor, "same-id");
  const close = view.mount();
  await eventually(() => expect(view.getSnapshot().retained).toBe(true));
  close();
  expect(f.editor.blocks.getBlockNode("same-id")?.content).toBe("A");
  expect(f.disconnections).not.toContain("A");
  await f.a.release(); await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});

test("view-local events and shortcuts reuse IDs, dispatch once, and preserve semantic keymap overrides", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const first = new EditorViewController(f.a.editor, undefined, f.core);
  const nested = new EditorViewController(f.b.editor, undefined, f.core);
  const firstRoot = root(realm); const nestedRoot = root(realm);
  (nestedRoot as unknown as ElementTarget).parentElement = firstRoot as unknown as ElementTarget;
  first.setRoot(firstRoot); nested.setRoot(nestedRoot);
  const closeFirst = first.mount(); const closeNested = nested.mount();
  await eventually(() => expect(nested.getSnapshot().retained).toBe(true));
  let unfocusedDocument: string | undefined;
  f.editor.events.register({ id: "initial.document", type: "keydown", target: "window" }, (value) => {
    if (value.raw.key === "initial") unfocusedDocument = f.editor.blocks.getBlockNode("same-id")?.content;
    return false;
  });
  realm.defaultView.dispatchEvent(event("keydown", root(realm), "initial"));
  expect(unfocusedDocument).toBe("A");
  const calls: string[] = [];
  for (const view of [first, nested]) {
    const api = view.getSnapshot().api!;
    api.events.register({ id: "local.input", type: "input" }, () => {
      calls.push(api.blocks.getBlockNode("same-id")!.content); return false;
    });
    api.keyboard.register({ id: "local.shortcut", keys: "x" }, () => {
      calls.push(`key:${api.getDocument()!.id}`); return true;
    });
  }
  const gestures: string[] = [];
  for (const view of [first, nested]) {
    view.getSnapshot().api!.events.register({ id: "local.drag", type: "pointermove", target: "window" }, () => {
      gestures.push(view.editor.getDocument().id); return false;
    });
  }
  let lostFocus = 0;
  first.subscribeDeactivation(() => { lostFocus += 1; });
  firstRoot.dispatchEvent(event("input", firstRoot));
  first.getSnapshot().api!.selection.set({ type: "selection", anchorBlockId: "same-id", focusBlockId: "same-id", blocks: [{ id: "same-id", start: 0, end: -1 }] });
  nested.getSnapshot().api!.selection.set({ type: "selection", anchorBlockId: "same-id", focusBlockId: "same-id", blocks: [{ id: "same-id", start: 0, end: -1 }] });
  const input = event("input", nestedRoot);
  firstRoot.dispatchEvent(input); nestedRoot.dispatchEvent(input);
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
  nested.getSnapshot().api!.selection.set({ type: "selection", anchorBlockId: "same-id", focusBlockId: "same-id", blocks: [{ id: "same-id", start: 0, end: -1 }] });
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
  closeFirst(); await f.a.release(); await f.b.release();
  f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("hover routes to the pointed view without activating it or clearing selection", async () => {
  const f = await fixture();
  const realm = new DocumentRealm();
  const full = new EditorViewController(f.editor, undefined, f.core);
  const nested = new EditorViewController(f.editor, "same-id", f.core);
  const fullRoot = root(realm); const nestedRoot = root(realm);
  (nestedRoot as unknown as ElementTarget).parentElement = fullRoot as unknown as ElementTarget;
  full.setRoot(fullRoot); nested.setRoot(nestedRoot);
  const closeFull = full.mount(); const closeNested = nested.mount();
  await eventually(() => expect(nested.getSnapshot().retained).toBe(true));
  const pointed: HTMLElement[] = [];
  for (const view of [full, nested]) {
    view.getSnapshot().api!.events.register({ id: "hover", type: "pointermove", target: "window" }, ({ root }) => {
      pointed.push(root); return false;
    });
  }
  fullRoot.dispatchEvent(event("focusin", fullRoot));
  f.editor.selection.set(createStructuralSelection(["same-id"]));
  const selection = f.editor.selection.get();
  let changes = 0; let deactivations = 0;
  const stopSelection = f.editor.selection.subscribe(() => { changes += 1; });
  full.subscribeDeactivation(() => { deactivations += 1; });
  realm.defaultView.dispatchEvent(event("pointermove", nestedRoot));
  realm.defaultView.dispatchEvent(event("pointermove", fullRoot));
  expect(pointed).toEqual([nestedRoot, fullRoot]);
  expect(f.editor.events.getRoot()).toBe(fullRoot);
  expect(f.editor.selection.get()).toEqual(selection);
  expect(changes).toBe(0);
  expect(deactivations).toBe(0);
  nestedRoot.dispatchEvent(event("pointerdown", nestedRoot));
  expect(f.editor.events.getRoot()).toBe(nestedRoot);
  expect(deactivations).toBe(1);
  realm.defaultView.dispatchEvent(event("pointermove", fullRoot));
  expect(pointed.at(-1)).toBe(nestedRoot);
  realm.defaultView.dispatchEvent(event("pointerup", fullRoot));
  expect(f.editor.events.getRoot()).toBe(nestedRoot);
  stopSelection(); closeNested(); closeFull();
  await f.a.release(); await f.b.release(); f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("events read each view's surface type while sharing the core mode, managers, and canvas settings", async () => {
  const f = await fixture();
  f.editor.mode.set("edgeless");
  expect(f.editor.events.getSurfaceType()).toBe("edgeless");
  expect("surfaceType" in f.editor).toBe(false);
  const options = { blockElementWidth: 321, avoidBlockElementOverlap: false };
  const restoreOptions = registerEdgelessSurface(f.editor, options);
  const realm = new DocumentRealm();
  const full = new EditorViewController(f.editor);
  const embedded = new EditorViewController(f.editor, "same-id");
  const fullRoot = root(realm); const embeddedRoot = root(realm);
  fullRoot.setAttribute("data-rivto-surface", "edgeless");
  embeddedRoot.setAttribute("data-rivto-surface", "block");
  (embeddedRoot as unknown as ElementTarget).parentElement = fullRoot as unknown as ElementTarget;
  full.setRoot(fullRoot); embedded.setRoot(embeddedRoot);
  const closeFull = full.mount(); const closeEmbedded = embedded.mount();
  await eventually(() => expect(embedded.getSnapshot().retained).toBe(true));
  const fullApi = full.getSnapshot().api!;
  const embeddedApi = embedded.getSnapshot().api!;
  for (const api of [fullApi, embeddedApi]) {
    expect("surfaceType" in api).toBe(false);
    expect(api.mode).toBe(f.editor.mode);
    expect(api.surfaces).toBe(f.editor.surfaces);
    expect(getEdgelessSurfaceOptions(api)).toBe(options);
  }
  const calls: string[] = [];
  f.editor.events.register({ id: "page.input", type: "keydown", mode: "block" }, ({ mode }) => {
    calls.push(mode); return true;
  });
  f.editor.events.register({ id: "canvas.input", type: "keydown", mode: "edgeless" }, ({ mode }) => {
    calls.push(mode); return true;
  });
  fullRoot.dispatchEvent(event("keydown", fullRoot, "x"));
  expect(calls).toEqual(["edgeless"]);
  expect(f.editor.events.getSurfaceType()).toBe("edgeless");
  expect(embeddedApi.events.getSurfaceType()).toBe("block");
  let surfaceReads = 0;
  const getAttribute = embeddedRoot.getAttribute.bind(embeddedRoot);
  embeddedRoot.getAttribute = (name) => {
    if (name === "data-rivto-surface") surfaceReads += 1;
    return getAttribute(name);
  };
  embeddedRoot.dispatchEvent(event("keydown", embeddedRoot, "x"));
  expect(calls).toEqual(["edgeless", "block"]);
  expect(surfaceReads).toBe(1);
  expect(f.editor.mode.get()).toBe("edgeless");
  expect(f.editor.events.getSurfaceType()).toBe("block");
  expect(fullApi.events.getSurfaceType()).toBe("edgeless");
  expect(f.editor.events.runInView(() => fullApi.events.runInView(() => f.editor.events.getSurfaceType()))).toBe("edgeless");
  expect(f.editor.events.getSurfaceType()).toBe("block");
  closeEmbedded(); closeFull(); restoreOptions();
  expect(f.editor.events.getSurfaceType()).toBe("edgeless");
  await f.a.release(); await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});

test("canvas adapters share installation and settings while selection belongs to one occurrence", async () => {
  const f = await fixture();
  const uninstall = installEdgelessRuntime(f.editor);
  const realm = new DocumentRealm();
  const first = new EditorViewController(f.a.editor, undefined, f.core);
  const duplicate = new EditorViewController(f.a.editor, undefined, f.core);
  const firstRoot = root(realm); const duplicateRoot = root(realm);
  first.setRoot(firstRoot); duplicate.setRoot(duplicateRoot);
  const closeFirst = first.mount(); const closeDuplicate = duplicate.mount();
  await eventually(() => expect(duplicate.getSnapshot().retained).toBe(true));
  const api = first.getSnapshot().api!;
  setBlockElementDefaultWidth(f.editor, 321);
  api.elements.removeElements(api.elements.getElements().map((element) => element.id));
  reconcileBlockElements(api);
  expect(api.elements.getElements()[0]!.frame.width).toBe(321);
  const id = api.elements.getElements()[0]!.id;
  firstRoot.dispatchEvent(event("focusin", firstRoot));
  const canvas = getEdgelessRuntime(api);
  canvas.set([id]);
  expect(canvas.snapshot()).toMatchObject({ active: true, items: [id] });
  expect(getEdgelessRuntime(duplicate.getSnapshot().api!).snapshot()).toEqual({ active: false, items: [] });
  expect(duplicate.getSnapshot().api!.selection.snapshot()).toBeUndefined();
  duplicateRoot.dispatchEvent(event("focusin", duplicateRoot));
  expect(canvas.snapshot()).toEqual({ active: false, items: [] });
  closeDuplicate(); closeFirst(); uninstall();
  await f.a.release(); await f.b.release(); f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});


test("location lookup does not acquire a source, retains its ID after deletion, and follows relocation", async () => {
  const f = await fixture();
  f.a.document.blocks.insertBlock({ id: "target", type: "paragraph", content: "Source" });
  let acquisitions = 0;
  const acquire = f.core.acquireEditor.bind(f.core);
  f.core.acquireEditor = (...args) => { acquisitions += 1; return acquire(...args); };
  const locations: (string | undefined)[] = [];
  const stop = f.core.subscribeBlockLocation({ documentId: "A", blockId: "target" }, (result) => { locations.push(result.documentId); });
  await eventually(() => expect(locations.at(-1)).toBe("A"));
  expect(acquisitions).toBe(0);
  let searches = 0;
  const find = f.core.resolveBlock.bind(f.core);
  f.core.resolveBlock = (...args) => { searches += 1; return find(...args); };
  f.a.document.blocks.updateBlock("target", { content: "Text changed" });
  await Promise.resolve();
  expect(searches).toBe(0);
  f.a.document.blocks.removeBlock("target");
  await Promise.resolve();
  expect(locations.at(-1)).toBe("A");
  f.b.document.blocks.insertBlock({ id: "target", type: "paragraph", content: "Moved" });
  await eventually(() => expect(locations.at(-1)).toBe("B"));
  expect(acquisitions).toBe(0);
  stop(); await f.a.release(); await f.b.release(); f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("two editors synchronize their two shared documents while each third document stays unloaded on the peer", async () => {
  const room = crypto.randomUUID();
  const channels: string[][] = [[], []];
  const database = new DemoDatabase();
  const stores = [0, 1].map((user) => new DocumentStorage({
    registry: new YjsDocumentRegistry(room), createDocumentModel: (crdt) => new DBDocumentModel(crdt, database), createProviders: (channel) => {
      channels[user]!.push(channel);
      return [new BroadcastChannelProvider(channel)];
    },
  }));
  const first = stores[0]!; const second = stores[1]!;
  const modelA = await first.create("A", [{ id: "shared", type: "paragraph", content: "Initial A" }]);
  const modelB = await first.create("B", [{ id: "shared", type: "paragraph", content: "Initial B" }]);
  const modelC = await first.create("C", [{ id: "shared", type: "paragraph", content: "Only first user" }]);
  const modelD = await second.create("D", [{ id: "shared", type: "paragraph", content: "Only second user" }]);
  await eventually(() => expect(second.getDocumentIds()).toEqual(expect.arrayContaining(["A", "B", "C", "D"])));
  const seeds = [new Map([["A", modelA], ["B", modelB], ["C", modelC]]), new Map([["D", modelD]])];
  const cores = stores.map((storage, user) => new EditorStorage({ openDocument: async (id) => { const model = seeds[user]!.get(id); seeds[user]!.delete(id); return model ?? storage.openDocument(id); }, createEditor: (editor) => { editor.blockRegistry.defineBlock({ type: "paragraph" }); return createReactEditor({ editor }); } }));
  const leases = await Promise.all([["A", "B", "C"], ["A", "B", "D"]].map((ids, user) => Promise.all(ids.map((id) => cores[user]!.acquireEditor(id)))));
  const views = leases.map((entries, user) => entries.map((entry) => new EditorViewController(entry.editor, undefined, cores[user])));
  const cleanups = views.flat().map((view) => view.mount());
  await eventually(() => expect(views.flat().every((view) => view.getSnapshot().retained)).toBe(true));
  await Promise.all(leases.flat().map((lease) => lease.release()));
  await eventually(() => expect(cores[1]!.getDocument("A")!.blocks.getBlockNode("shared")?.content).toBe("Initial A"));
  views[0]![0]!.getSnapshot().api!.blocks.updateBlock("shared", { content: "From first user" });
  views[1]![1]!.getSnapshot().api!.blocks.updateBlock("shared", { content: "From second user" });
  views[0]![2]!.getSnapshot().api!.blocks.updateBlock("shared", { content: "Private C edit" });
  views[1]![2]!.getSnapshot().api!.blocks.updateBlock("shared", { content: "Private D edit" });
  await eventually(() => expect(cores[1]!.getDocument("A")!.blocks.getBlockNode("shared")?.content).toBe("From first user"));
  await eventually(() => expect(cores[0]!.getDocument("B")!.blocks.getBlockNode("shared")?.content).toBe("From second user"));
  expect(cores[0]!.getDocuments().map((doc) => doc.id).sort()).toEqual(["A", "B", "C"]);
  expect(cores[1]!.getDocuments().map((doc) => doc.id).sort()).toEqual(["A", "B", "D"]);
  const requested = channels.map((list) => list.map((channel) => JSON.parse(channel)[1]));
  expect(requested[0]).not.toContain("D"); expect(requested[1]).not.toContain("C");
  const laterLease = await cores[1]!.acquireEditor("C");
  const later = new EditorViewController(laterLease.editor, undefined, cores[1]);
  const closeLater = later.mount();
  await eventually(() => expect(later.getSnapshot().document?.blocks.getBlockNode("shared")?.content).toBe("Private C edit"));
  closeLater(); cleanups.forEach((close) => close());
  await Promise.all([...leases.flat(), laterLease].map((lease) => lease.release()));
  expect((await cores[1]!.getSingleEditor("A")).blocks.getBlockNode("shared")?.content).toBe("From first user");
  await Promise.all(cores.map((core) => core.destroy()));
  await Promise.all(stores.map((storage) => storage.destroy()));
});


test.each([10, 2000])("views own selection boundaries without repeated tree reads for %i blocks", async (count) => {
  const f = await fixture();
  f.a.document.blocks.insertBlock({ id: "outside-parent", type: "paragraph", children: [{
    id: "branch", type: "paragraph", children: Array.from({ length: count }, (_, index) => ({ id: `child-${index}`, type: "paragraph", content: "Child" })),
  }] });
  const unregisterCollapse = registerCollapse(f.editor);
  const realm = new DocumentRealm();
  const full = new EditorViewController(f.a.editor, undefined, f.core);
  const embedded = new EditorViewController(f.editor, "branch", f.core);
  const duplicate = new EditorViewController(f.editor, "branch", f.core);
  const fullRoot = root(realm); const embeddedRoot = root(realm); const duplicateRoot = root(realm);
  (embeddedRoot as unknown as ElementTarget).parentElement = fullRoot as unknown as ElementTarget;
  full.setRoot(fullRoot); embedded.setRoot(embeddedRoot); duplicate.setRoot(duplicateRoot);
  const closeFull = full.mount(); const closeEmbedded = embedded.mount(); const closeDuplicate = duplicate.mount();
  await eventually(() => expect([full, embedded, duplicate].every((view) => view.getSnapshot().retained)).toBe(true));
  const api = embedded.getSnapshot().api!;
  embeddedRoot.dispatchEvent(event("focusin", embeddedRoot));
  expect(f.editor.events.getDocumentView()).toBe(api);
  api.selection.set(createCaretSelection("same-id", 0));
  expect(f.a.editor.selection.get()).toBeUndefined();
  api.selection.set(createStructuralSelection(Array.from({ length: count }, (_, index) => `child-${index}`)));
  expect(api.selection.snapshot()?.blocks).toHaveLength(count);
  expect(full.getSnapshot().api!.selection.snapshot()).toBeUndefined();
  expect(duplicate.getSnapshot().api!.selection.snapshot()).toBeUndefined();

  let parents = 0; let forests = 0;
  const getParent = f.a.document.blocks.getParentId.bind(f.a.document.blocks);
  const getBlocks = f.a.document.blocks.getBlocks.bind(f.a.document.blocks);
  f.a.document.blocks.getParentId = (id) => { parents += 1; return getParent(id); };
  f.a.document.blocks.getBlocks = () => { forests += 1; return getBlocks(); };
  for (let index = 0; index < count; index += 1) expect(api.selection.isBlockSelected(`child-${index}`)).toBe(true);
  expect(parents).toBe(0);
  expect(forests).toBe(0);

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
  expect(f.editor.events.getDocumentView()).toBe(duplicate.getSnapshot().api);

  unregisterCollapse(); closeDuplicate(); closeEmbedded(); closeFull();
  await f.a.release(); await f.b.release(); f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("view behavior resolves against its own document before any DOM root is mounted", async () => {
  const f = await fixture();
  const a = f.a.editor; const b = f.b.editor;
  expect(a.views.resolve("same-id")).toBe(a.views.fallback);
  expect(b.views.resolve("same-id")).toBe(b.views.fallback);
  expect(a.blockListProps.prepare({})).toEqual({});
  expect(() => a.blockListProps.validate({})).not.toThrow();
  await f.a.release(); await f.b.release(); f.editor.destroy(); await f.core.destroy(); await f.storage.destroy();
});

test("destroying a runtime during drag releases window pointer ownership to surviving editors", async () => {
  const f = await fixture(); const realm = new DocumentRealm();
  const first = new EditorViewController(f.a.editor, undefined, f.core); const second = new EditorViewController(f.b.editor, undefined, f.core);
  const firstRoot = root(realm); const secondRoot = root(realm);
  first.setRoot(firstRoot); second.setRoot(secondRoot);
  const closeFirst = first.mount(); const closeSecond = second.mount();
  await eventually(() => expect(second.getSnapshot().retained).toBe(true));
  let moves = 0;
  second.getSnapshot().api!.events.register({ id: "surviving.pointer", type: "pointermove", target: "window" }, () => { moves += 1; return false; });
  firstRoot.dispatchEvent(event("pointerdown", firstRoot));
  f.a.editor.destroy();
  realm.defaultView.dispatchEvent(event("pointermove", secondRoot));
  expect(moves).toBe(1);
  closeFirst(); closeSecond(); await f.a.release(); await f.b.release(); await f.core.destroy(); await f.storage.destroy();
});
