import { createReactEditor as createRuntime } from "../react-editor";
import { createTestReactEditor as createReactEditor } from "../test-utils";
import { createTestCoreEditor as createEditor } from "../test-utils";
import {
  createElement,
  useContext,
  type ComponentType,
  type ReactNode,
} from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BlockWrapper,
  type BlockShellProps,
  type BlockWrapperProps,
} from "../blocks";
import { EditorView } from "../editor-view";
import { EditorViewController } from "../managers/events/editor-view-controller";
import {
  EditorEvent,
  EventManager,
  KeyboardEditorEvent,
  KeyboardManager,
  type ReactEditorExtension,
} from "../managers";
import { type ReactEditor } from "../react-editor";
import {
  standardPreset,
  trailingBlockExtension,
} from "../extensions/built-ins/built-ins";
import { pageDragExtension } from "../extensions/block-drag";
import { edgelessPreset } from "../extensions/edgeless";
import { isReactEditor, isRivtoEditor } from "../utils";
import { EditorStorage } from "../editor-storage";
import { EditorStorageContext } from "../editor-storage-context";
import { createTestMultiEditor } from "../test-utils";
import { PageSurface } from "../surfaces/page/page-surface";
import { DocumentModelImpl, DocumentStorage } from "@chulane/document-model";
import { YjsDoc, YjsDocumentRegistry, BroadcastChannelProvider } from "@chulane/crdt-doc";

const Empty: ComponentType<{ blockId: string }> = () => null;
const EmptyComponent: ComponentType = () => null;
const EmptyWrapper: ComponentType<BlockWrapperProps> = () => null;
const SecondWrapper: ComponentType<BlockWrapperProps> = () => null;
const EmptySurface: ComponentType = () => null;
const EmptyEditorWrapper: ComponentType<{ readonly children?: ReactNode }> = ({
  children,
}) => children;

describe("ReactEditor", () => {
  test("nested views inherit the nearest storage while independent providers keep equal document IDs separate", async () => {
    const first = await createTestMultiEditor([new DocumentModelImpl(new YjsDoc("shared"))]);
    const second = await createTestMultiEditor([new DocumentModelImpl(new YjsDoc("shared"))]);
    const a = first.getEditor("shared")!;
    const b = second.getEditor("shared")!;
    a.blocks.insertBlock({ id: "same", type: "paragraph", content: "First user" });
    b.blocks.insertBlock({ id: "same", type: "paragraph", content: "Second user" });
    function Source() {
      const storage = useContext(EditorStorageContext);
      return storage?.getEditor("shared")?.blocks.getBlockNode("same")?.content;
    }
    const markup = renderToStaticMarkup(createElement(EditorStorageContext.Provider, { value: first },
      createElement(EditorView, { reactEditor: a }, createElement(EditorView, { reactEditor: a, rootBlockId: "same" }, createElement(Source))),
      createElement(EditorStorageContext.Provider, { value: second }, createElement(EditorView, { reactEditor: b }, createElement(Source))),
      createElement(EditorView, { reactEditor: a }, createElement(Source)),
    ));
    expect(markup).toBe("First userSecond userFirst user");
    expect(a.getDocument()).not.toBe(b.getDocument());
    await first.destroy(); await second.destroy();
  });

  test("source APIs retain their document for direct commands, transactions, subscriptions, and undo", async () => {
    const host = new DocumentModelImpl(new YjsDoc("host"));
    const source = new DocumentModelImpl(new YjsDoc("bound-source"));
    const replacement = new DocumentModelImpl(new YjsDoc("bound-replacement"));
    const mediator = await createTestMultiEditor([host, source, replacement]);
    const editor = await mediator.getSingleEditor(host.id);
    const reactEditor = mediator.getEditor(host.id)!;
    editor.blocks.insertBlock({ id: "shared-id", type: "paragraph", content: "Host" });
    source.blocks.insertBlock({ id: "shared-id", type: "paragraph", content: "Source" });
    replacement.blocks.insertBlock({ id: "shared-id", type: "paragraph", content: "Replacement" });
    reactEditor.mode.set("edgeless");
    const sourceEditor = mediator.getEditor(source.id)!;
    const controller = new EditorViewController(sourceEditor, "shared-id");
    const closeView = controller.mount();
    const view = controller.getSnapshot().api!;
    expect(view.renderers).toBe(sourceEditor.renderers);
    expect(view.events).not.toBe(sourceEditor.events);
    expect("getView" in sourceEditor).toBe(false);
    expect(view.blocks).toBe(sourceEditor.blocks);
    expect(view.mode).toBe(sourceEditor.mode);
    expect(view.mode.get()).toBe("block");
    expect(reactEditor.mode).toBe(editor.mode);
    expect(reactEditor.mode.get()).toBe("edgeless");
    const changes: string[] = [];
    const unsubscribe = view.blocks.subscribeBlockNode("shared-id", () => {
      changes.push(view.blocks.getBlockNode("shared-id")!.content);
    });
    // Retain an ordinary manager method across an await and another document receiving focus.
    const update = view.blocks.updateBlock.bind(view.blocks);
    await Promise.resolve();
    const replacementView = mediator.getEditor(replacement.id)!;
    replacementView.blocks.updateBlock("shared-id", { content: "Replacement" });
    expect(view.getDocument()).toBe(source);
    expect(view.blocks.getRootIds()).toEqual(["shared-id"]);
    const result = view.history.batchUpdates(() => {
      update("shared-id", { content: "Edited source" });
      view.blocks.setBlockProp("shared-id", "checked", true);
      return "source transaction";
    });
    expect(result).toBe("source transaction");
    expect(changes).toContain("Edited source");
    expect(replacement.blocks.getBlockNode("shared-id")!.content).toBe("Replacement");
    expect(source.blocks.getBlockNode("shared-id")!.props.checked).toBe(true);
    replacementView.blocks.updateBlock("shared-id", { content: "Replacement" });
    view.history.undo();
    expect(source.blocks.getBlockNode("shared-id")).toMatchObject({ content: "Source", props: {} });
    view.history.redo();
    expect(source.blocks.getBlockNode("shared-id")!.content).toBe("Edited source");
    expect(() => view.history.batchUpdates(() => { throw new Error("aborted callback"); })).toThrow("aborted callback");
    expect(replacementView.blocks.getBlockNode("shared-id")!.content).toBe("Replacement");
    const count = changes.length;
    unsubscribe();
    update("shared-id", { content: "After unsubscribe" });
    expect(changes).toHaveLength(count);
    closeView();
    reactEditor.destroy();
    await mediator.destroy();
  });

  test("opens a registered document with a factory and returns its fixed core", async () => {
    const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
    const editors = new EditorStorage({ openDocument: (id) => storage.openDocument(id), createEditor: (editor) => createRuntime({ editor, extensions: [standardPreset()] }) });
    expect(editors.getDocuments()).toEqual([]);
    storage.registerDocument("first");
    const core = await editors.getSingleEditor("first");
    core.blocks.insertBlock({ id: "first", type: "paragraph", content: "First document" });
    const reactEditor = editors.getEditor("first")!;
    expect(reactEditor.blocks).toBe(core.blocks);
    expect("getSingleEditor" in reactEditor).toBe(false);
    expect(reactEditor.getDocument()).toBe(core.getDocument());
    expect(renderToStaticMarkup(createElement(EditorView, { reactEditor }, createElement(PageSurface)))).toContain("First document");
    await editors.destroy(); await storage.destroy();
  });

  test("keeps shared documents active after another React runtime is destroyed", async () => {
    const channel = crypto.randomUUID();
    const firstDoc = new YjsDoc(channel); const secondDoc = new YjsDoc(channel);
    await firstDoc.attachProvider(new BroadcastChannelProvider(channel));
    await secondDoc.attachProvider(new BroadcastChannelProvider(channel));
    const firstModel = new DocumentModelImpl(firstDoc);
    const secondModel = new DocumentModelImpl(secondDoc);
    const firstCore = await createTestMultiEditor([firstModel], undefined, { extensions: [standardPreset()] });
    const secondCore = await createTestMultiEditor([secondModel], undefined, { extensions: [standardPreset()] });
    const firstRuntime = firstCore.getEditor(channel)!;
    const secondRuntime = secondCore.getEditor(channel)!;
    const first = firstRuntime;
    const second = secondRuntime;
    let firstUpdates = 0; let secondUpdates = 0;
    first.subscribe(() => { firstUpdates += 1; });
    second.subscribe(() => { secondUpdates += 1; });
    const sharedId = first.blocks.insertBlock({ type: "paragraph", content: "Shared" }).id;
    for (let attempt = 0; attempt < 100 && !second.blocks.hasBlock(sharedId); attempt += 1) await new Promise((resolve) => setTimeout(resolve, 5));
    expect(second.blocks.getBlockNode(sharedId)?.content).toBe("Shared");
    expect(firstUpdates).toBeGreaterThan(0); expect(secondUpdates).toBeGreaterThan(0);
    secondRuntime.destroy(); await secondCore.destroy();
    const stopped = secondUpdates;
    const survivingId = first.blocks.insertBlock({ type: "paragraph", content: "Surviving" }).id;
    expect(first.blocks.getBlockNode(survivingId)?.content).toBe("Surviving");
    expect(secondUpdates).toBe(stopped);
    firstRuntime.destroy(); await firstCore.destroy();
  });

  test("distinguishes React and core editor runtimes", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });

    expect(isReactEditor(reactEditor)).toBe(true);
    expect(isRivtoEditor(reactEditor)).toBe(false);
    expect(isReactEditor(editor)).toBe(false);
    expect(isRivtoEditor(editor)).toBe(true);

    reactEditor.destroy();
    editor.destroy();
  });

  test("passes the complete ReactEditor runtime directly to extension setup", async () => {
    const editor = await createEditor();
    let received: ReactEditor | undefined;
    const reactEditor = createRuntime({
      editor,
      extensions: [{
        id: "identity",
        setup(reactEditor) {
          received = reactEditor;
        },
      }],
    });

    expect(received).toBe(reactEditor);
    const exposesCore: "editor" extends keyof typeof reactEditor ? true : false = false;
    type RemovedBatching = Extract<
      "batchUpdates" | "batchUpdatesWithoutHistory",
      keyof typeof reactEditor
    >;
    const exposesBatching: Record<RemovedBatching, never> = {};
    expect(exposesCore).toBe(false);
    expect(exposesBatching).toEqual({});
    expect(reactEditor).not.toHaveProperty("batchUpdates");
    expect(reactEditor).not.toHaveProperty("batchUpdatesWithoutHistory");
    expect(received?.events).toBe(reactEditor.events);
    reactEditor.destroy();
    editor.destroy();
  });

  test("sets extensions up in order and cleans them in reverse order", async () => {
    const editor = await createEditor();
    const calls: string[] = [];
    const extension = (id: string): ReactEditorExtension => ({
      id,
      setup: () => {
        calls.push(`setup:${id}`);
        return () => calls.push(`cleanup:${id}`);
      },
    });
    const reactEditor = createReactEditor({ editor, extensions: [extension("a"), extension("b")] });
    reactEditor.destroy();
    editor.destroy();
    expect(calls).toEqual(["setup:a", "setup:b", "cleanup:b", "cleanup:a"]);
  });

  test("rejects duplicate extension IDs and cleans completed setup", async () => {
    const editor = await createEditor();
    let cleaned = false;
    const first: ReactEditorExtension = { id: "same", setup: () => () => { cleaned = true; } };
    expect(() => createReactEditor({ editor, extensions: [first, { id: "same", setup() {} }] })).toThrow(/already registered/);
    expect(cleaned).toBe(true);
    editor.destroy();
  });

  test("registers and disposes a model, renderer, and slash conversion atomically", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const dispose = reactEditor.blockTypes.register({
      definition: { type: "test.card", title: "Card" },
      render: Empty,
      slashCommand: { title: "Card" },
    });
    expect(editor.blockRegistry.has("test.card")).toBe(true);
    expect(reactEditor.renderers.get("test.card")).toBe(Empty);
    const paragraphId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    expect(reactEditor.slashCommands.getAll({ blockId: paragraphId }).some(({ id }) => id === "type.test.card")).toBe(true);
    dispose();
    expect(editor.blockRegistry.has("test.card")).toBe(false);
    expect(reactEditor.renderers.get("test.card")).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("registers list slash commands that atomically reset checkbox state", async () => {
    const editor = await createEditor();
    const blockId = editor.blocks.insertBlock({
      type: "paragraph",
      listProps: { type: "checkbox", checked: true },
    }).id;
    const reactEditor = createReactEditor({ editor, extensions: [standardPreset()] });

    expect(reactEditor.slashCommands.getAll({ blockId }).map(({ id }) => id)).toEqual(
      expect.arrayContaining([
        "list.list",
        "list.numbered_list",
        "list.start_numbered_list",
        "list.continue_numbered_list",
      ]),
    );
    reactEditor.slashCommands.execute("list.start_numbered_list", { blockId });
    expect(editor.blocks.getBlockNode(blockId)).toMatchObject({
      listProps: { type: "start_numbered_list", checked: false },
    });
    reactEditor.destroy();
    editor.destroy();
  });

  test("configures the default paragraph slash command", async () => {
    const editor = await createEditor();
    editor.blockRegistry.defineBlock({ type: "test.source" });
    const blockId = editor.blocks.insertBlock({ type: "test.source" }).id;
    const reactEditor = createReactEditor({
      editor,
      extensions: [standardPreset({ writing: { slashCommand: { group: "Writing" } } })],
    });

    expect(reactEditor.slashCommands.getAll({ blockId })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "type.paragraph",
          title: "Markdown",
          group: "Writing",
          keywords: ["paragraph", "text"],
        }),
      ]),
    );
    reactEditor.destroy();
    editor.destroy();
  });

  test("rolls block registration back when its slash command conflicts", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const releaseConflict = reactEditor.slashCommands.register({ id: "type.test.conflict", title: "Conflict", execute() {} });
    expect(() => reactEditor.blockTypes.register({
      definition: { type: "test.conflict" },
      render: Empty,
      slashCommand: { title: "Conflict" },
    })).toThrow(/already registered/);
    expect(editor.blockRegistry.has("test.conflict")).toBe(false);
    expect(reactEditor.renderers.get("test.conflict")).toBeUndefined();
    releaseConflict();
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps mode-specific block wrappers in registration order", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [{
        id: "wrapper",
        setup: (reactEditor) => {
          reactEditor.surfaces.registerBlockWrapper("block", EmptyWrapper);
          reactEditor.surfaces.registerBlockWrapper("block", SecondWrapper);
        },
      }],
    });
    expect(reactEditor.surfaces.getBlockWrappers("block")).toEqual([
      EmptyWrapper,
      SecondWrapper,
    ]);
    expect(reactEditor.surfaces.getBlockWrappers("edgeless")).toEqual([]);
    reactEditor.destroy();
    expect(reactEditor.surfaces.getBlockWrappers("block")).toEqual([]);
    editor.destroy();
  });

  test("composes the first registered block wrapper outermost", async () => {
    const editor = await createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph", content: "Order" }).id;
    const block = editor.blocks.getBlockNode(blockId)!;
    const Shell: ComponentType<BlockShellProps> = () => createElement("span", { "data-layer": "shell" });
    const Outer: ComponentType<BlockWrapperProps> = ({ children }) => (
      createElement("div", { "data-layer": "outer" }, children)
    );
    const Inner: ComponentType<BlockWrapperProps> = ({ children }) => (
      createElement("div", { "data-layer": "inner" }, children)
    );
    const Surface = () => createElement(BlockWrapper, {
      fallback: Shell,
      block,
      isSelected: false,
      content: null,
    });
    const reactEditor = createReactEditor({
      editor,
      extensions: [{
        id: "ordered-wrappers",
        setup: (reactEditor) => {
          reactEditor.surfaces.register("block", Surface);
          reactEditor.surfaces.registerBlockWrapper("block", Outer);
          reactEditor.surfaces.registerBlockWrapper("block", Inner);
        },
      }],
    });

    const markup = renderToStaticMarkup(createElement(EditorView, { reactEditor }, createElement(Surface)));
    expect(markup).toContain(
      '<div data-layer="outer"><div data-layer="inner"><span data-layer="shell"></span></div></div>',
    );
    reactEditor.destroy();
    editor.destroy();
  });

  test("supports dynamic public presentation registration and disposal", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const disposeComponent = reactEditor.extensions.mount(EmptyComponent);
    const disposeEditorWrapper = reactEditor.surfaces.registerEditorWrapper(EmptyEditorWrapper, "block");
    const disposeSurface = reactEditor.surfaces.register("block", EmptySurface);
    const disposeBlockWrapper = reactEditor.surfaces.registerBlockWrapper("block", EmptyWrapper);

    expect(reactEditor.extensions.getComponents()).toEqual([EmptyComponent]);
    expect(reactEditor.surfaces.getEditorWrappers("block")).toEqual([EmptyEditorWrapper]);
    expect(reactEditor.surfaces.get("block")).toBe(EmptySurface);
    expect(reactEditor.surfaces.getBlockWrappers("block")).toEqual([EmptyWrapper]);

    disposeBlockWrapper();
    disposeSurface();
    disposeEditorWrapper();
    disposeComponent();
    expect(reactEditor.extensions.getComponents()).toEqual([]);
    expect(reactEditor.surfaces.getEditorWrappers("block")).toEqual([]);
    expect(reactEditor.surfaces.get("block")).toBeUndefined();
    expect(reactEditor.surfaces.getBlockWrappers("block")).toEqual([]);

    reactEditor.destroy();
    editor.destroy();
  });

  test("makes public presentation disposers idempotent", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const dispose = reactEditor.extensions.mount(EmptyComponent);

    dispose();
    const revisionAfterDisposal = reactEditor.extensions.revision;
    dispose();

    expect(reactEditor.extensions.revision).toBe(revisionAfterDisposal);
    reactEditor.destroy();
    editor.destroy();
  });

  test("runs extension cleanup before removing its owned registrations", async () => {
    const editor = await createEditor();
    let sawMountedComponent = false;
    const reactEditor = createReactEditor({
      editor,
      extensions: [{
        id: "owned-ui",
        setup(reactEditor) {
          reactEditor.extensions.mount(EmptyComponent);
          return () => {
            sawMountedComponent = reactEditor.extensions.getComponents().includes(EmptyComponent);
          };
        },
      }],
    });

    reactEditor.destroy();
    expect(sawMountedComponent).toBe(true);
    expect(reactEditor.extensions.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("removes dynamic presentation registrations in reverse order on destroy", async () => {
    const editor = await createEditor();
    const First: ComponentType = () => null;
    const Second: ComponentType = () => null;
    const reactEditor = createReactEditor({ editor });
    reactEditor.extensions.mount(First);
    reactEditor.extensions.mount(Second);
    const snapshots: ComponentType[][] = [];
    reactEditor.extensions.subscribe(() => {
      snapshots.push([...reactEditor.extensions.getComponents()]);
    });

    reactEditor.destroy();

    expect(snapshots[0]).toEqual([First]);
    expect(snapshots[1]).toEqual([]);
    editor.destroy();
  });

  test("rolls back partial extension presentation setup", async () => {
    const editor = await createEditor();
    let failedRuntime: ReactEditor | undefined;

    expect(() => createReactEditor({
      editor,
      extensions: [{
        id: "partial",
        setup(reactEditor) {
          failedRuntime = reactEditor;
          reactEditor.extensions.mount(EmptyComponent);
          reactEditor.surfaces.registerEditorWrapper(EmptyEditorWrapper);
          reactEditor.surfaces.register("block", EmptySurface);
          reactEditor.surfaces.registerBlockWrapper("block", EmptyWrapper);
          throw new Error("setup failed");
        },
      }],
    })).toThrow("setup failed");

    expect(failedRuntime?.extensions.getComponents()).toEqual([]);
    expect(failedRuntime?.surfaces.getEditorWrappers("block")).toEqual([]);
    expect(failedRuntime?.surfaces.get("block")).toBeUndefined();
    expect(failedRuntime?.surfaces.getBlockWrappers("block")).toEqual([]);
    editor.destroy();
  });

  test("standardPreset excludes optional edgeless and drag extensions", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [standardPreset()],
    });

    expect(reactEditor.blockTypes.getDefinition("paragraph")).toBeDefined();
    expect(reactEditor.surfaces.get("edgeless")).toBeUndefined();
    expect(reactEditor.surfaces.getEditorWrappers("block")).toHaveLength(0);
    expect(reactEditor.surfaces.getBlockWrappers("block")).toHaveLength(0);
    expect(reactEditor.surfaces.getBlockWrappers("edgeless")).toHaveLength(0);
    // Slash menu and trailing block controls are the standard preset's UI.
    expect(reactEditor.extensions.getComponents()).toHaveLength(2);

    reactEditor.destroy();
    editor.destroy();
  });

  test("installs optional edgeless and block drag extensions explicitly", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({
      editor,
      extensions: [standardPreset(), pageDragExtension(), ...edgelessPreset()],
    });

    expect(reactEditor.extensions.getComponents().length).toBeGreaterThan(0);
    expect(reactEditor.surfaces.getEditorWrappers("block")).toHaveLength(1);
    expect(reactEditor.surfaces.getBlockWrappers("block")).toHaveLength(1);
    expect(reactEditor.surfaces.getBlockWrappers("edgeless")).toHaveLength(1);

    reactEditor.destroy();
    editor.destroy();
  });

  test("requires a positive trailing block count", () => {
    expect(() => trailingBlockExtension(0)).toThrow("positive integer");
    expect(() => trailingBlockExtension(1.5)).toThrow("positive integer");
    expect(trailingBlockExtension(4).id).toBe("block.trailing-create");
  });

  test("forwards core changes through one global revision stream", async () => {
    const editor = await createEditor();
    const leftId = editor.blocks.insertBlock({ type: "paragraph", content: "left" }).id;
    const rightId = editor.blocks.insertBlock({ type: "paragraph", content: "right" }, leftId).id;
    const parentId = editor.blocks.insertBlock({
      type: "paragraph",
      content: "parent",
      children: [{ type: "paragraph", content: "child" }],
    }, rightId).id;
    const childId = editor.blocks.getBlock(parentId)!.children[0]!.id;
    const reactEditor = createReactEditor({ editor });
    let updates = 0;
    const dispose = reactEditor.subscribe(() => { updates += 1; });
    const initialRevision = reactEditor.revision;

    editor.blocks.updateBlock(leftId, { content: "changed" });
    editor.blocks.updateBlock(childId, { content: "changed child" });
    editor.blocks.moveBlock(childId, rightId, "inside");
    expect(updates).toBe(3);
    expect(reactEditor.revision).toBe(initialRevision + 3);

    dispose();
    reactEditor.destroy();
    editor.destroy();
  });

  test("uses two document APIs with shared registrations and independent subscriptions", async () => {
    const editor = await createEditor();
    const first = editor.getDocument()!;
    first.blocks.insertBlock({ id: "same", type: "paragraph", content: "First" });
    const secondCore = await createEditor();
    const second = { editor: secondCore, document: secondCore.getDocument(), release: () => secondCore.destroy() };
    second.editor.blocks.insertBlock({ id: "same", type: "paragraph", content: "Second" });
    const reactEditor = createReactEditor({ editor });
    const other = createReactEditor({ editor: secondCore });
    expect(other.renderers).not.toBe(reactEditor.renderers);
    expect(other.getDocument()).toBe(second.document);
    let updates = 0;
    const dispose = reactEditor.blocks.subscribeBlockNode("same", () => { updates += 1; });
    other.blocks.updateBlock("same", { content: "Changed second" });
    expect(reactEditor.blocks.getBlockNode("same")?.content).toBe("First");
    expect(other.blocks.getBlockNode("same")?.content).toBe("Changed second");
    expect(updates).toBe(0);
    reactEditor.blocks.updateBlock("same", { content: "Changed first" });
    expect(updates).toBe(1);
    dispose(); reactEditor.destroy(); other.destroy(); await second.release(); await editor.destroy();
  });

  test("rolls back registrations when a duplicate surface fails setup", async () => {
    const editor = await createEditor();
    let failedRuntime: ReactEditor | undefined;

    expect(() => createReactEditor({
      editor,
      extensions: [{
        id: "duplicate-surface",
        setup(reactEditor) {
          failedRuntime = reactEditor;
          reactEditor.extensions.mount(EmptyComponent);
          reactEditor.surfaces.register("block", EmptySurface);
          reactEditor.surfaces.register("block", EmptySurface);
        },
      }],
    })).toThrow(/already registered/);

    expect(failedRuntime?.extensions.getComponents()).toEqual([]);
    expect(failedRuntime?.surfaces.get("block")).toBeUndefined();
    editor.destroy();
  });

  test("destroys event registrations when a duplicate binding fails setup", async () => {
    const editor = await createEditor();
    let failedRuntime: ReactEditor | undefined;

    expect(() => createReactEditor({
      editor,
      extensions: [{
        id: "duplicates",
        setup(reactEditor) {
          failedRuntime = reactEditor;
          reactEditor.keyboard.register({
            id: "test.duplicate",
            keys: ["Primary+K"],
          }, () => false);
          reactEditor.keyboard.register({
            id: "test.duplicate",
            keys: ["Primary+L"],
          }, () => false);
        },
      }],
    })).toThrow(/already registered/);

    expect(() => failedRuntime?.keyboard.register({
      id: "test.after-destroy",
      keys: ["Primary+J"],
    }, () => false)).toThrow(/destroyed/);
    editor.destroy();
  });

  test("rejects presentation registration after destruction", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.destroy();

    expect(() => reactEditor.extensions.mount(EmptyComponent)).toThrow(/destroyed/);
    expect(() => reactEditor.blockTypes.delete("paragraph")).toThrow(/destroyed/);
    expect(() => reactEditor.renderers.delete("paragraph")).toThrow(/destroyed/);
    expect(() => reactEditor.surfaces.delete("block")).toThrow(/destroyed/);
    expect(() => reactEditor.slashCommands.delete("type.paragraph")).toThrow(/destroyed/);
    expect(() => reactEditor.surfaces.registerEditorWrapper(EmptyEditorWrapper)).toThrow(/destroyed/);
    expect(() => reactEditor.surfaces.register("block", EmptySurface)).toThrow(/destroyed/);
    expect(() => reactEditor.surfaces.registerBlockWrapper("block", EmptyWrapper)).toThrow(/destroyed/);
    editor.destroy();
  });
});

describe("delegated events", () => {
  class FakeTarget {
    readonly listeners = new Map<string, Set<EventListener>>();

    addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      const listeners = this.listeners.get(type) ?? new Set<EventListener>();
      listeners.add(listener as EventListener);
      this.listeners.set(type, listeners);
    }

    removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
      this.listeners.get(type)?.delete(listener as EventListener);
    }

    emit(type: string, event: Event): void {
      [...(this.listeners.get(type) ?? [])].forEach((listener) => listener(event));
    }

    count(): number {
      return [...this.listeners.values()].reduce((sum, listeners) => sum + listeners.size, 0);
    }
  }

  class FakeElement extends FakeTarget {
    ownerDocument!: FakeDocument;
    parent: FakeElement | null = null;
    attributes = new Map<string, string>();
    readonly nodeType = 1;
    readonly tagName = "DIV";

    contains(candidate: unknown): boolean {
      let found = false;
      for (let current = candidate as FakeElement | null; current; current = current.parent) {
        if (current === this) {
          found = true;
          break;
        }
      }
      return found;
    }

    closest(selector: string): FakeElement | null {
      if (selector.includes("data-block-id") && this.attributes.has("data-block-id")) {
        return this;
      }
      if (selector.includes("data-block-content") && this.attributes.has("data-block-content")) {
        return this;
      }
      return this.parent?.closest(selector) ?? null;
    }

    getAttribute(name: string): string | null {
      return this.attributes.get(name) ?? null;
    }
  }

  class FakeDocument extends FakeTarget {
    defaultView!: FakeWindow;
  }

  class FakeWindow extends FakeTarget {
    Element = FakeElement;
  }

  function realm() {
    const window = new FakeWindow();
    const document = new FakeDocument();
    window.Element = FakeElement;
    document.defaultView = window;
    const root = new FakeElement();
    root.ownerDocument = document;
    return { document, root, window };
  }

  function keyboardEvent(
    target: FakeElement,
    key: string,
    modifiers: Partial<Pick<KeyboardEvent, "code" | "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing">> = {},
  ): KeyboardEvent {
    const event = {
      type: "keydown",
      key,
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      isComposing: false,
      cancelable: true,
      defaultPrevented: false,
      target,
      preventDefault() { event.defaultPrevented = true; },
      ...modifiers,
    };
    return event as unknown as KeyboardEvent;
  }

  test("uses separate event and keyboard managers across surface realms", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    expect(events).toBeInstanceOf(EventManager);
    expect(reactEditor.keyboard).toBeInstanceOf(KeyboardManager);
    const first = realm();
    const second = realm();
    const disposeDocument = events.register({
      id: "test.selection-change",
      type: "selectionchange",
      target: "document",
    }, () => undefined);
    reactEditor.keyboard.register({
      id: "test.surface-key",
      keys: "Enter",
    }, () => false);
    reactEditor.keyboard.register({
      id: "test.window-key",
      keys: "Escape",
      target: "window",
    }, () => false);
    events.setRoot(first.root as unknown as HTMLElement);
    expect(first.root.count()).toBeGreaterThan(0);
    expect(first.document.count()).toBe(1);
    expect(first.window.count()).toBeGreaterThan(0);
    events.setRoot(second.root as unknown as HTMLElement);
    expect(first.root.count()).toBe(0);
    expect(first.document.count()).toBe(0);
    expect(first.window.count()).toBe(0);
    expect(second.document.count()).toBe(1);
    disposeDocument();
    reactEditor.destroy();
    expect(second.root.count()).toBe(0);
    expect(second.document.count()).toBe(0);
    expect(second.window.count()).toBe(0);
    editor.destroy();
  });

  test("orders handlers, claims events, and falls through conditional bindings", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    const keyboard = reactEditor.keyboard;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    let predicateEvent: KeyboardEditorEvent | undefined;
    let handlerEvent: KeyboardEditorEvent | undefined;
    keyboard.register({ id: "first", keys: ["Tab"], when: (event) => {
      predicateEvent = event;
      return false;
    } }, () => {
      calls.push("skipped");
      return true;
    });
    keyboard.register({ id: "second", keys: ["Tab"] }, (event) => {
      handlerEvent = event;
      calls.push(event.shortcut);
      return true;
    });
    keyboard.register({ id: "late", keys: ["Tab"] }, () => {
      calls.push("late");
      return true;
    });
    const event = keyboardEvent(root, "Tab");
    root.emit("keydown", event);
    expect(calls).toEqual(["Tab"]);
    expect(handlerEvent).toBe(predicateEvent);
    expect(handlerEvent).toBeInstanceOf(KeyboardEditorEvent);
    expect(handlerEvent).toBeInstanceOf(EditorEvent);
    expect(handlerEvent?.raw).toBe(event);
    expect(handlerEvent?.phase).toBe("keydown");
    expect(event.defaultPrevented).toBe(true);
    reactEditor.destroy();
    editor.destroy();
  });

  test("matches primary letter shortcuts by physical key across keyboard layouts", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    reactEditor.keyboard.register({ id: "test.undo", keys: ["Primary+z"] }, () => {
      calls.push("undo");
      return true;
    });
    reactEditor.keyboard.register({
      id: "test.redo",
      keys: ["Primary+Shift+z", "Primary+y"],
    }, () => {
      calls.push("redo");
      return true;
    });

    root.emit("keydown", keyboardEvent(root, "я", { code: "KeyZ", ctrlKey: true }));
    root.emit("keydown", keyboardEvent(root, "Я", {
      code: "KeyZ",
      ctrlKey: true,
      shiftKey: true,
    }));
    root.emit("keydown", keyboardEvent(root, "н", { code: "KeyY", ctrlKey: true }));

    expect(calls).toEqual(["undo", "redo", "redo"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("filters keyboard targets, modes, and scopes before applying priority", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { document, root, window } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const content = new FakeElement();
    content.ownerDocument = document;
    content.parent = root;
    content.attributes.set("data-block-content", "");
    const calls: string[] = [];
    reactEditor.keyboard.register({ id: "low", keys: ["Tab"] }, () => {
      calls.push("low");
      return true;
    });
    reactEditor.keyboard.register({
      id: "high",
      keys: ["Tab"],
      mode: "block",
      scope: "content",
      priority: 10,
    }, () => {
      calls.push("high");
      return true;
    });
    reactEditor.keyboard.register({
      id: "window",
      keys: ["Escape"],
      target: "window",
    }, () => {
      calls.push("window");
      return true;
    });

    root.emit("keydown", keyboardEvent(root, "Tab"));
    root.emit("keydown", keyboardEvent(content, "Tab"));
    reactEditor.mode.set("edgeless");
    root.emit("keydown", keyboardEvent(content, "Tab"));
    window.emit("keydown", keyboardEvent(root, "Escape"));
    expect(calls).toEqual(["low", "high", "low", "window"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("filters DOM modes and never resolves markers outside the active surface", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    const { document, root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const inside = new FakeElement();
    inside.ownerDocument = document;
    inside.parent = root;
    inside.attributes.set("data-block-id", "inside");
    const outside = new FakeElement();
    outside.ownerDocument = document;
    outside.attributes.set("data-block-id", "outside");
    const seen: Array<[boolean, string | undefined]> = [];
    events.register({
      id: "test.pointer",
      type: "pointerdown",
      target: "document",
      mode: "block",
    }, ({ insideRoot, blockId }) => {
      seen.push([insideRoot, blockId]);
    });

    document.emit("pointerdown", {
      type: "pointerdown",
      target: inside,
      defaultPrevented: false,
      cancelable: true,
      preventDefault() {},
    } as unknown as PointerEvent);
    document.emit("pointerdown", {
      type: "pointerdown",
      target: outside,
      defaultPrevented: false,
      cancelable: true,
      preventDefault() {},
    } as unknown as PointerEvent);
    reactEditor.mode.set("edgeless");
    document.emit("pointerdown", {
      type: "pointerdown",
      target: inside,
      defaultPrevented: false,
      cancelable: true,
      preventDefault() {},
    } as unknown as PointerEvent);
    expect(seen).toEqual([[true, "inside"], [false, undefined]]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("filters delegated events by surface, block, and content scope", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const block = new FakeElement();
    block.ownerDocument = root.ownerDocument;
    block.parent = root;
    block.attributes.set("data-block-id", "block");
    const content = new FakeElement();
    content.ownerDocument = root.ownerDocument;
    content.parent = block;
    content.attributes.set("data-block-content", "");
    const calls: string[] = [];

    for (const scope of ["surface", "block", "content"] as const) {
      events.register({
        id: `scope.${scope}`,
        type: "pointerdown",
        scope,
      }, () => {
        calls.push(scope);
      });
    }

    root.emit("pointerdown", {
      type: "pointerdown",
      target: content,
      defaultPrevented: false,
      cancelable: true,
      preventDefault() {},
    } as unknown as PointerEvent);
    expect(calls).toEqual(["surface", "block", "content"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("deletes DOM registrations and releases their stable IDs", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const register = () => reactEditor.events.register({
      id: "test.delete-dom",
      type: "click",
    }, () => false);

    const staleDisposer = register();
    expect(() => register()).toThrow(/already registered/);
    expect(reactEditor.events.delete("test.delete-dom")).toBe(true);
    expect(reactEditor.events.delete("test.delete-dom")).toBe(false);
    expect(register).not.toThrow();
    staleDisposer();
    expect(() => register()).toThrow(/already registered/);
    reactEditor.destroy();
    editor.destroy();
  });

  test("dispatches keyboard actions before ordinary DOM key handlers", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    reactEditor.keyboard.register({
      id: "test.keyboard-first",
      keys: ["Enter"],
    }, () => {
      calls.push("keyboard");
      return true;
    });
    reactEditor.events.register({
      id: "test.dom-second",
      type: "keydown",
    }, () => {
      calls.push("dom");
      return true;
    });

    root.emit("keydown", keyboardEvent(root, "Enter"));
    expect(calls).toEqual(["keyboard"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("orders DOM handlers, applies when, and stops after a claim", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    let predicateEvent: EditorEvent | undefined;
    let handlerEvent: EditorEvent | undefined;
    reactEditor.events.register({
      id: "test.dom-skipped",
      type: "click",
      when: (event) => {
        predicateEvent = event;
        return false;
      },
    }, () => {
      calls.push("skipped");
      return true;
    });
    reactEditor.events.register({
      id: "test.dom-claimed",
      type: "click",
    }, (event) => {
      handlerEvent = event;
      calls.push("claimed");
      return true;
    });
    reactEditor.events.register({
      id: "test.dom-late",
      type: "click",
    }, () => {
      calls.push("late");
      return true;
    });
    const nativeEvent = {
      type: "click",
      target: root,
      defaultPrevented: false,
      cancelable: true,
      preventDefault() { nativeEvent.defaultPrevented = true; },
    };
    const event = nativeEvent as unknown as MouseEvent;

    root.emit("click", event);
    expect(calls).toEqual(["claimed"]);
    expect(handlerEvent).toBe(predicateEvent);
    expect(handlerEvent).toBeInstanceOf(EditorEvent);
    expect(handlerEvent?.raw).toBe(event);
    expect(nativeEvent.defaultPrevented).toBe(true);
    reactEditor.destroy();
    editor.destroy();
  });

  test("constructs exported editor event values directly", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    const surface = root as unknown as HTMLElement;
    const raw = keyboardEvent(root, "Enter");
    const selection = reactEditor.selection.get();
    const base = {
      raw,
      reactEditor,
      root: surface,
      mode: reactEditor.mode.get(),
      selection,
      eventTarget: "surface" as const,
      insideRoot: true,
      blockElement: null,
      blockId: undefined,
      contentElement: null,
    };
    const event = new EditorEvent(base);
    const keyboardEventValue = new KeyboardEditorEvent({
      ...base,
      shortcut: "Enter",
      phase: "keydown",
    });

    expect(event.raw).toBe(raw);
    expect(event.selection).toBe(selection);
    expect(keyboardEventValue).toBeInstanceOf(EditorEvent);
    expect(keyboardEventValue.shortcut).toBe("Enter");
    reactEditor.destroy();
    editor.destroy();
  });

  test("applies overrides, disabling, exact modifiers, and duplicate IDs", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({
      editor,
      keymap: {
        remapped: ["Primary+ArrowRight"],
        disabled: [],
        unknown: ["Escape"],
      },
    });
    const events = reactEditor.events;
    const keyboard = reactEditor.keyboard;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    keyboard.register({ id: "remapped", keys: ["Tab"] }, () => { calls.push("remapped"); return true; });
    keyboard.register({ id: "disabled", keys: ["Escape"] }, () => { calls.push("disabled"); return true; });
    expect(() => keyboard.register({ id: "remapped", keys: ["Enter"] }, () => true)).toThrow(/already registered/);
    expect(() => events.register({
      id: "remapped",
      type: "click",
    }, () => false)).not.toThrow();
    const release = keyboard.register({ id: "temporary", keys: ["Enter"] }, () => true);
    release();
    expect(() => keyboard.register({ id: "temporary", keys: ["Enter"] }, () => true)).not.toThrow();
    root.emit("keydown", keyboardEvent(root, "Tab"));
    root.emit("keydown", keyboardEvent(root, "ArrowRight", { ctrlKey: true }));
    root.emit("keydown", keyboardEvent(root, "ArrowRight", { ctrlKey: true, shiftKey: true }));
    root.emit("keydown", keyboardEvent(root, "Escape"));
    expect(calls).toEqual(["remapped"]);
    const listed = keyboard.list();
    expect(listed.find((item) => item.id === "unknown")).toMatchObject({
      installed: false,
      keys: ["Escape"],
    });
    expect(listed.find((item) => item.id === "disabled")).toMatchObject({
      disabled: true,
      overridden: true,
    });
    const revisions: number[] = [];
    const stop = keyboard.subscribe(() => revisions.push(keyboard.revision));
    keyboard.setKeymapOverride("remapped", ["Enter"]);
    expect(listed.find((item) => item.id === "remapped")?.conflicts ?? []).not.toContain("temporary");
    expect(keyboard.list().find((item) => item.id === "remapped")?.keys).toEqual(["Enter"]);
    expect(revisions.length).toBeGreaterThan(0);
    stop();
    reactEditor.destroy();
    editor.destroy();
  });

  test("replaces the complete keymap and applies overrides registered later", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    const defaults = ["a"];
    reactEditor.keyboard.register({ id: "dynamic", keys: defaults }, () => {
      calls.push("dynamic");
      return true;
    });

    reactEditor.keyboard.replaceKeymap({
      dynamic: ["b"],
      future: ["c"],
    });
    reactEditor.keyboard.register({ id: "future", keys: ["d"] }, () => {
      calls.push("future");
      return true;
    });
    root.emit("keydown", keyboardEvent(root, "a"));
    root.emit("keydown", keyboardEvent(root, "b"));
    root.emit("keydown", keyboardEvent(root, "c"));
    expect(calls).toEqual(["dynamic", "future"]);

    calls.length = 0;
    defaults[0] = "x";
    reactEditor.keyboard.replaceKeymap({});
    root.emit("keydown", keyboardEvent(root, "b"));
    root.emit("keydown", keyboardEvent(root, "a"));
    root.emit("keydown", keyboardEvent(root, "d"));
    expect(calls).toEqual(["dynamic", "future"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("updates one override defensively and rejects invalid keymaps atomically", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    reactEditor.keyboard.register({ id: "dynamic", keys: ["a"] }, () => {
      calls.push("dynamic");
      return true;
    });
    const keys = ["b"];
    reactEditor.keyboard.setKeymapOverride("dynamic", keys);
    keys[0] = "c";
    expect(() => reactEditor.keyboard.replaceKeymap({
      dynamic: ["Unknown+b"],
    })).toThrow(/Unknown keyboard modifier/);
    root.emit("keydown", keyboardEvent(root, "b"));
    root.emit("keydown", keyboardEvent(root, "c"));
    expect(calls).toEqual(["dynamic"]);

    calls.length = 0;
    reactEditor.keyboard.setKeymapOverride("dynamic", []);
    root.emit("keydown", keyboardEvent(root, "b"));
    reactEditor.keyboard.setKeymapOverride("dynamic", undefined);
    root.emit("keydown", keyboardEvent(root, "a"));
    expect(calls).toEqual(["dynamic"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("supports keyup and all composition policies", async () => {
    const editor = await createEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    const keyboard = reactEditor.keyboard;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    keyboard.register({ id: "ignored", keys: ["a"] }, () => { calls.push("ignored"); return true; });
    keyboard.register({ id: "handled", keys: ["b"], composing: "handle" }, () => { calls.push("handled"); return true; });
    keyboard.register({ id: "prevented", keys: ["c"], composing: "prevent" }, () => { calls.push("prevented"); return true; });
    keyboard.register({ id: "released", keys: ["d"], phase: "keyup" }, () => { calls.push("released"); return true; });
    const ignored = keyboardEvent(root, "a", { isComposing: true });
    const handled = keyboardEvent(root, "b", { isComposing: true });
    const prevented = keyboardEvent(root, "c", { isComposing: true });
    root.emit("keydown", ignored);
    root.emit("keydown", handled);
    root.emit("keydown", prevented);
    root.emit("keyup", { ...keyboardEvent(root, "d"), type: "keyup" } as KeyboardEvent);
    expect(calls).toEqual(["handled", "released"]);
    expect(keyboard.list().find((item) => item.id === "released")?.phase).toBe("keyup");
    expect(ignored.defaultPrevented).toBe(false);
    expect(handled.defaultPrevented).toBe(true);
    expect(prevented.defaultPrevented).toBe(true);
    reactEditor.destroy();
    editor.destroy();
  });
});
