import { createRivtoEditor } from "@chulane/rivto";
import {
  createElement,
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
import {
  DOMEditorEvents,
  EditorEvent,
  KeyboardEditorEvents,
} from "../events";
import {
  createReactEditor,
  type ReactEditor,
  type ReactEditorPlugin,
} from "../react-editor";

const Empty: ComponentType<{ blockId: string }> = () => null;
const EmptyComponent: ComponentType = () => null;
const EmptyWrapper: ComponentType<BlockWrapperProps> = () => null;
const SecondWrapper: ComponentType<BlockWrapperProps> = () => null;
const EmptySurface: ComponentType = () => null;
const EmptyEditorWrapper: ComponentType<{ readonly children?: ReactNode }> = ({
  children,
}) => children;

describe("ReactEditor", () => {
  test("passes the complete ReactEditor runtime directly to plugin setup", () => {
    const editor = createRivtoEditor();
    let received: ReactEditor | undefined;
    const reactEditor = createReactEditor({
      editor,
      plugins: [{
        id: "identity",
        setup(runtime) {
          received = runtime;
        },
      }],
    });

    expect(received).toBe(reactEditor);
    expect(received?.editor).toBe(editor);
    expect(received?.events).toBe(reactEditor.events);
    reactEditor.destroy();
    editor.destroy();
  });

  test("sets plugins up in order and cleans them in reverse order", () => {
    const editor = createRivtoEditor();
    const calls: string[] = [];
    const plugin = (id: string): ReactEditorPlugin => ({
      id,
      setup: () => {
        calls.push(`setup:${id}`);
        return () => calls.push(`cleanup:${id}`);
      },
    });
    const reactEditor = createReactEditor({ editor, plugins: [plugin("a"), plugin("b")] });
    reactEditor.destroy();
    editor.destroy();
    expect(calls).toEqual(["setup:a", "setup:b", "cleanup:b", "cleanup:a"]);
  });

  test("rejects duplicate plugin IDs and cleans completed setup", () => {
    const editor = createRivtoEditor();
    let cleaned = false;
    const first: ReactEditorPlugin = { id: "same", setup: () => () => { cleaned = true; } };
    expect(() => createReactEditor({ editor, plugins: [first, { id: "same", setup() {} }] })).toThrow(/already registered/);
    expect(cleaned).toBe(true);
    editor.destroy();
  });

  test("registers and disposes a model, renderer, and slash conversion atomically", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const dispose = reactEditor.registerBlock({
      definition: { type: "test.card", title: "Card" },
      render: Empty,
      slashCommand: { title: "Card" },
    });
    expect(editor.blocks.has("test.card")).toBe(true);
    expect(reactEditor.getRenderer("test.card")).toBe(Empty);
    const paragraphId = editor.insertBlock({ type: "paragraph" });
    expect(editor.slashCommands.getAll({ blockId: paragraphId }).some(({ id }) => id === "type.test.card")).toBe(true);
    dispose();
    expect(editor.blocks.has("test.card")).toBe(false);
    expect(reactEditor.getRenderer("test.card")).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("rolls block registration back when its slash command conflicts", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const releaseConflict = editor.slashCommands.register({ id: "type.test.conflict", title: "Conflict", execute() {} });
    expect(() => reactEditor.registerBlock({
      definition: { type: "test.conflict" },
      render: Empty,
      slashCommand: { title: "Conflict" },
    })).toThrow(/already registered/);
    expect(editor.blocks.has("test.conflict")).toBe(false);
    expect(reactEditor.getRenderer("test.conflict")).toBeUndefined();
    releaseConflict();
    reactEditor.destroy();
    editor.destroy();
  });

  test("keeps mode-specific block wrappers in registration order", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      plugins: [{
        id: "wrapper",
        setup: (runtime) => {
          runtime.registerBlockWrapper("block", EmptyWrapper);
          runtime.registerBlockWrapper("block", SecondWrapper);
        },
      }],
    });
    expect(reactEditor.getBlockWrappers("block")).toEqual([
      EmptyWrapper,
      SecondWrapper,
    ]);
    expect(reactEditor.getBlockWrappers("edgeless")).toEqual([]);
    reactEditor.destroy();
    expect(reactEditor.getBlockWrappers("block")).toEqual([]);
    editor.destroy();
  });

  test("composes the first registered block wrapper outermost", () => {
    const editor = createRivtoEditor();
    const blockId = editor.insertBlock({ type: "paragraph", content: "Order" });
    const block = editor.getBlock(blockId)!;
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
      selected: false,
      content: null,
    });
    const reactEditor = createReactEditor({
      editor,
      plugins: [{
        id: "ordered-wrappers",
        setup: (runtime) => {
          runtime.registerSurface("block", Surface);
          runtime.registerBlockWrapper("block", Outer);
          runtime.registerBlockWrapper("block", Inner);
        },
      }],
    });

    const markup = renderToStaticMarkup(createElement(EditorView, { editor: reactEditor }));
    expect(markup).toContain(
      '<div data-layer="outer"><div data-layer="inner"><span data-layer="shell"></span></div></div>',
    );
    reactEditor.destroy();
    editor.destroy();
  });

  test("supports dynamic public presentation registration and disposal", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const disposeComponent = reactEditor.mount(EmptyComponent, "block");
    const disposeEditorWrapper = reactEditor.wrapEditor(EmptyEditorWrapper, "block");
    const disposeSurface = reactEditor.registerSurface("block", EmptySurface);
    const disposeBlockWrapper = reactEditor.registerBlockWrapper("block", EmptyWrapper);

    expect(reactEditor.getComponents("block")).toEqual([EmptyComponent]);
    expect(reactEditor.getEditorWrappers("block")).toEqual([EmptyEditorWrapper]);
    expect(reactEditor.getSurface("block")).toBe(EmptySurface);
    expect(reactEditor.getBlockWrappers("block")).toEqual([EmptyWrapper]);

    disposeBlockWrapper();
    disposeSurface();
    disposeEditorWrapper();
    disposeComponent();
    expect(reactEditor.getComponents("block")).toEqual([]);
    expect(reactEditor.getEditorWrappers("block")).toEqual([]);
    expect(reactEditor.getSurface("block")).toBeUndefined();
    expect(reactEditor.getBlockWrappers("block")).toEqual([]);

    reactEditor.destroy();
    editor.destroy();
  });

  test("makes public presentation disposers idempotent", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const dispose = reactEditor.mount(EmptyComponent);

    dispose();
    const revisionAfterDisposal = reactEditor.revision;
    dispose();

    expect(reactEditor.revision).toBe(revisionAfterDisposal);
    reactEditor.destroy();
    editor.destroy();
  });

  test("runs plugin cleanup before removing its owned registrations", () => {
    const editor = createRivtoEditor();
    let sawMountedComponent = false;
    const reactEditor = createReactEditor({
      editor,
      plugins: [{
        id: "owned-ui",
        setup(runtime) {
          runtime.mount(EmptyComponent);
          return () => {
            sawMountedComponent = runtime.getComponents("block").includes(EmptyComponent);
          };
        },
      }],
    });

    reactEditor.destroy();
    expect(sawMountedComponent).toBe(true);
    expect(reactEditor.getComponents("block")).toEqual([]);
    editor.destroy();
  });

  test("removes dynamic presentation registrations in reverse order on destroy", () => {
    const editor = createRivtoEditor();
    const First: ComponentType = () => null;
    const Second: ComponentType = () => null;
    const reactEditor = createReactEditor({ editor });
    reactEditor.mount(First);
    reactEditor.mount(Second);
    const snapshots: ComponentType[][] = [];
    reactEditor.subscribe(() => {
      snapshots.push(reactEditor.getComponents("block"));
    });

    reactEditor.destroy();

    expect(snapshots[0]).toEqual([First]);
    expect(snapshots[1]).toEqual([]);
    editor.destroy();
  });

  test("rolls back partial plugin presentation setup", () => {
    const editor = createRivtoEditor();
    let failedRuntime: ReactEditor | undefined;

    expect(() => createReactEditor({
      editor,
      plugins: [{
        id: "partial",
        setup(runtime) {
          failedRuntime = runtime;
          runtime.mount(EmptyComponent);
          runtime.wrapEditor(EmptyEditorWrapper);
          runtime.registerSurface("block", EmptySurface);
          runtime.registerBlockWrapper("block", EmptyWrapper);
          throw new Error("setup failed");
        },
      }],
    })).toThrow("setup failed");

    expect(failedRuntime?.getComponents("block")).toEqual([]);
    expect(failedRuntime?.getEditorWrappers("block")).toEqual([]);
    expect(failedRuntime?.getSurface("block")).toBeUndefined();
    expect(failedRuntime?.getBlockWrappers("block")).toEqual([]);
    editor.destroy();
  });

  test("rolls back registrations when a duplicate surface fails setup", () => {
    const editor = createRivtoEditor();
    let failedRuntime: ReactEditor | undefined;

    expect(() => createReactEditor({
      editor,
      plugins: [{
        id: "duplicate-surface",
        setup(runtime) {
          failedRuntime = runtime;
          runtime.mount(EmptyComponent);
          runtime.registerSurface("block", EmptySurface);
          runtime.registerSurface("block", EmptySurface);
        },
      }],
    })).toThrow(/already registered/);

    expect(failedRuntime?.getComponents("block")).toEqual([]);
    expect(failedRuntime?.getSurface("block")).toBeUndefined();
    editor.destroy();
  });

  test("destroys event registrations when a duplicate binding fails setup", () => {
    const editor = createRivtoEditor();
    let failedRuntime: ReactEditor | undefined;

    expect(() => createReactEditor({
      editor,
      plugins: [{
        id: "duplicates",
        setup(runtime) {
          failedRuntime = runtime;
          runtime.events.bind({
            id: "test.duplicate",
            keys: ["Primary+K"],
          }, () => false);
          runtime.events.bind({
            id: "test.duplicate",
            keys: ["Primary+L"],
          }, () => false);
        },
      }],
    })).toThrow(/already registered/);

    expect(() => failedRuntime?.events.bind({
      id: "test.after-destroy",
      keys: ["Primary+J"],
    }, () => false)).toThrow(/destroyed/);
    editor.destroy();
  });

  test("rejects presentation registration after destruction", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.destroy();

    expect(() => reactEditor.mount(EmptyComponent)).toThrow(/destroyed/);
    expect(() => reactEditor.wrapEditor(EmptyEditorWrapper)).toThrow(/destroyed/);
    expect(() => reactEditor.registerSurface("block", EmptySurface)).toThrow(/destroyed/);
    expect(() => reactEditor.registerBlockWrapper("block", EmptyWrapper)).toThrow(/destroyed/);
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

    contains(candidate: unknown): boolean {
      for (let current = candidate as FakeElement | null; current; current = current.parent) {
        if (current === this) return true;
      }
      return false;
    }

    closest(selector: string): FakeElement | null {
      if (selector.includes("data-block-id") && this.attributes.has("data-block-id")) return this;
      if (selector.includes("data-block-content") && this.attributes.has("data-block-content")) return this;
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
    modifiers: Partial<Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "altKey" | "shiftKey" | "isComposing">> = {},
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

  test("uses one inheritance hierarchy and follows root realms", () => {
    const editor = createRivtoEditor();
    const events = new KeyboardEditorEvents(editor, () => editor.mode.get());
    expect(events).toBeInstanceOf(KeyboardEditorEvents);
    expect(events).toBeInstanceOf(DOMEditorEvents);
    expect(events).toBeInstanceOf(EditorEvent);
    const first = realm();
    const second = realm();
    events.setRoot(first.root as unknown as HTMLElement);
    expect(first.root.count()).toBeGreaterThan(0);
    expect(first.document.count()).toBe(0);
    expect(first.window.count()).toBeGreaterThan(0);

    const disposeDocument = events.on("selectionchange", () => undefined, { target: "document" });
    expect(first.document.count()).toBe(1);
    events.setRoot(second.root as unknown as HTMLElement);
    expect(first.root.count()).toBe(0);
    expect(first.document.count()).toBe(0);
    expect(first.window.count()).toBe(0);
    expect(second.document.count()).toBe(1);
    disposeDocument();
    events.destroy();
    expect(second.root.count()).toBe(0);
    expect(second.document.count()).toBe(0);
    expect(second.window.count()).toBe(0);
    editor.destroy();
  });

  test("orders handlers, claims events, and falls through conditional bindings", () => {
    const editor = createRivtoEditor();
    const events = new KeyboardEditorEvents(editor, () => editor.mode.get());
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    events.bind({ id: "first", keys: ["Tab"], when: () => false }, () => {
      calls.push("skipped");
      return true;
    });
    events.bind({ id: "second", keys: ["Tab"] }, ({ shortcut }) => {
      calls.push(shortcut);
      return true;
    });
    events.bind({ id: "late", keys: ["Tab"] }, () => {
      calls.push("late");
      return true;
    });
    const event = keyboardEvent(root, "Tab");
    root.emit("keydown", event);
    expect(calls).toEqual(["Tab"]);
    expect(event.defaultPrevented).toBe(true);
    events.destroy();
    editor.destroy();
  });

  test("filters DOM modes and never resolves markers outside the active root", () => {
    const editor = createRivtoEditor();
    const events = new KeyboardEditorEvents(editor, () => editor.mode.get());
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
    events.on("pointerdown", ({ insideRoot, blockId }) => {
      seen.push([insideRoot, blockId]);
    }, { target: "document", mode: "block" });

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
    editor.mode.set("edgeless");
    document.emit("pointerdown", {
      type: "pointerdown",
      target: inside,
      defaultPrevented: false,
      cancelable: true,
      preventDefault() {},
    } as unknown as PointerEvent);
    expect(seen).toEqual([[true, "inside"], [false, undefined]]);
    events.destroy();
    editor.destroy();
  });

  test("applies overrides, disabling, exact modifiers, and duplicate IDs", () => {
    const editor = createRivtoEditor();
    const events = new KeyboardEditorEvents(editor, () => editor.mode.get(), {
      remapped: ["Primary+ArrowRight"],
      disabled: [],
      unknown: ["Escape"],
    });
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    events.bind({ id: "remapped", keys: ["Tab"] }, () => { calls.push("remapped"); return true; });
    events.bind({ id: "disabled", keys: ["Escape"] }, () => { calls.push("disabled"); return true; });
    expect(() => events.bind({ id: "remapped", keys: ["Enter"] }, () => true)).toThrow(/already registered/);
    const release = events.bind({ id: "temporary", keys: ["Enter"] }, () => true);
    release();
    expect(() => events.bind({ id: "temporary", keys: ["Enter"] }, () => true)).not.toThrow();
    root.emit("keydown", keyboardEvent(root, "Tab"));
    root.emit("keydown", keyboardEvent(root, "ArrowRight", { ctrlKey: true }));
    root.emit("keydown", keyboardEvent(root, "ArrowRight", { ctrlKey: true, shiftKey: true }));
    root.emit("keydown", keyboardEvent(root, "Escape"));
    expect(calls).toEqual(["remapped"]);
    events.destroy();
    editor.destroy();
  });

  test("supports keyup and all composition policies", () => {
    const editor = createRivtoEditor();
    const events = new KeyboardEditorEvents(editor, () => editor.mode.get());
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    events.bind({ id: "ignored", keys: ["a"] }, () => { calls.push("ignored"); return true; });
    events.bind({ id: "handled", keys: ["b"], composing: "handle" }, () => { calls.push("handled"); return true; });
    events.bind({ id: "prevented", keys: ["c"], composing: "prevent" }, () => { calls.push("prevented"); return true; });
    events.bind({ id: "released", keys: ["d"], phase: "keyup" }, () => { calls.push("released"); return true; });
    const ignored = keyboardEvent(root, "a", { isComposing: true });
    const handled = keyboardEvent(root, "b", { isComposing: true });
    const prevented = keyboardEvent(root, "c", { isComposing: true });
    root.emit("keydown", ignored);
    root.emit("keydown", handled);
    root.emit("keydown", prevented);
    root.emit("keyup", { ...keyboardEvent(root, "d"), type: "keyup" } as KeyboardEvent);
    expect(calls).toEqual(["handled", "released"]);
    expect(ignored.defaultPrevented).toBe(false);
    expect(handled.defaultPrevented).toBe(true);
    expect(prevented.defaultPrevented).toBe(true);
    events.destroy();
    editor.destroy();
  });
});
