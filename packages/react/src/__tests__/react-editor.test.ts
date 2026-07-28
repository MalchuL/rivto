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
  EditorEvent,
  EventManager,
  KeyboardEditorEvent,
  type ReactEditorPlugin,
} from "../managers";
import {
  createReactEditor,
  type ReactEditor,
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
    const dispose = reactEditor.blocks.register({
      definition: { type: "test.card", title: "Card" },
      render: Empty,
      slashCommand: { title: "Card" },
    });
    expect(editor.blocks.has("test.card")).toBe(true);
    expect(reactEditor.renderers.get("test.card")).toBe(Empty);
    const paragraphId = editor.insertBlock({ type: "paragraph" });
    expect(editor.slashCommands.getAll({ blockId: paragraphId }).some(({ id }) => id === "type.test.card")).toBe(true);
    dispose();
    expect(editor.blocks.has("test.card")).toBe(false);
    expect(reactEditor.renderers.get("test.card")).toBeUndefined();
    reactEditor.destroy();
    editor.destroy();
  });

  test("rolls block registration back when its slash command conflicts", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const releaseConflict = editor.slashCommands.register({ id: "type.test.conflict", title: "Conflict", execute() {} });
    expect(() => reactEditor.blocks.register({
      definition: { type: "test.conflict" },
      render: Empty,
      slashCommand: { title: "Conflict" },
    })).toThrow(/already registered/);
    expect(editor.blocks.has("test.conflict")).toBe(false);
    expect(reactEditor.renderers.get("test.conflict")).toBeUndefined();
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
          runtime.surfaces.registerBlockWrapper("block", EmptyWrapper);
          runtime.surfaces.registerBlockWrapper("block", SecondWrapper);
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
      isSelected: false,
      content: null,
    });
    const reactEditor = createReactEditor({
      editor,
      plugins: [{
        id: "ordered-wrappers",
        setup: (runtime) => {
          runtime.surfaces.register("block", Surface);
          runtime.surfaces.registerBlockWrapper("block", Outer);
          runtime.surfaces.registerBlockWrapper("block", Inner);
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
    const disposeComponent = reactEditor.plugins.mount(EmptyComponent);
    const disposeEditorWrapper = reactEditor.surfaces.registerEditorWrapper(EmptyEditorWrapper, "block");
    const disposeSurface = reactEditor.surfaces.register("block", EmptySurface);
    const disposeBlockWrapper = reactEditor.surfaces.registerBlockWrapper("block", EmptyWrapper);

    expect(reactEditor.plugins.getComponents()).toEqual([EmptyComponent]);
    expect(reactEditor.surfaces.getEditorWrappers("block")).toEqual([EmptyEditorWrapper]);
    expect(reactEditor.surfaces.get("block")).toBe(EmptySurface);
    expect(reactEditor.surfaces.getBlockWrappers("block")).toEqual([EmptyWrapper]);

    disposeBlockWrapper();
    disposeSurface();
    disposeEditorWrapper();
    disposeComponent();
    expect(reactEditor.plugins.getComponents()).toEqual([]);
    expect(reactEditor.surfaces.getEditorWrappers("block")).toEqual([]);
    expect(reactEditor.surfaces.get("block")).toBeUndefined();
    expect(reactEditor.surfaces.getBlockWrappers("block")).toEqual([]);

    reactEditor.destroy();
    editor.destroy();
  });

  test("makes public presentation disposers idempotent", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const dispose = reactEditor.plugins.mount(EmptyComponent);

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
          runtime.plugins.mount(EmptyComponent);
          return () => {
            sawMountedComponent = runtime.plugins.getComponents().includes(EmptyComponent);
          };
        },
      }],
    });

    reactEditor.destroy();
    expect(sawMountedComponent).toBe(true);
    expect(reactEditor.plugins.getComponents()).toEqual([]);
    editor.destroy();
  });

  test("removes dynamic presentation registrations in reverse order on destroy", () => {
    const editor = createRivtoEditor();
    const First: ComponentType = () => null;
    const Second: ComponentType = () => null;
    const reactEditor = createReactEditor({ editor });
    reactEditor.plugins.mount(First);
    reactEditor.plugins.mount(Second);
    const snapshots: ComponentType[][] = [];
    reactEditor.subscribe(() => {
      snapshots.push([...reactEditor.plugins.getComponents()]);
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
          runtime.plugins.mount(EmptyComponent);
          runtime.surfaces.registerEditorWrapper(EmptyEditorWrapper);
          runtime.surfaces.register("block", EmptySurface);
          runtime.surfaces.registerBlockWrapper("block", EmptyWrapper);
          throw new Error("setup failed");
        },
      }],
    })).toThrow("setup failed");

    expect(failedRuntime?.plugins.getComponents()).toEqual([]);
    expect(failedRuntime?.surfaces.getEditorWrappers("block")).toEqual([]);
    expect(failedRuntime?.surfaces.get("block")).toBeUndefined();
    expect(failedRuntime?.surfaces.getBlockWrappers("block")).toEqual([]);
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
          runtime.plugins.mount(EmptyComponent);
          runtime.surfaces.register("block", EmptySurface);
          runtime.surfaces.register("block", EmptySurface);
        },
      }],
    })).toThrow(/already registered/);

    expect(failedRuntime?.plugins.getComponents()).toEqual([]);
    expect(failedRuntime?.surfaces.get("block")).toBeUndefined();
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
          runtime.events.register({
            id: "test.duplicate",
            keys: ["Primary+K"],
          }, () => false);
          runtime.events.register({
            id: "test.duplicate",
            keys: ["Primary+L"],
          }, () => false);
        },
      }],
    })).toThrow(/already registered/);

    expect(() => failedRuntime?.events.register({
      id: "test.after-destroy",
      keys: ["Primary+J"],
    }, () => false)).toThrow(/destroyed/);
    editor.destroy();
  });

  test("rejects presentation registration after destruction", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    reactEditor.destroy();

    expect(() => reactEditor.plugins.mount(EmptyComponent)).toThrow(/destroyed/);
    expect(() => reactEditor.blocks.delete("paragraph")).toThrow(/destroyed/);
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

  test("uses one event registry and follows surface realms", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    expect(events).toBeInstanceOf(EventManager);
    const first = realm();
    const second = realm();
    const disposeDocument = events.register({
      id: "test.selection-change",
      type: "selectionchange",
      target: "document",
    }, () => undefined);
    events.register({
      id: "test.surface-key",
      keys: "Enter",
    }, () => false);
    events.register({
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

  test("orders handlers, claims events, and falls through conditional bindings", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    let predicateEvent: KeyboardEditorEvent | undefined;
    let handlerEvent: KeyboardEditorEvent | undefined;
    events.register({ id: "first", keys: ["Tab"], when: (event) => {
      predicateEvent = event;
      return false;
    } }, () => {
      calls.push("skipped");
      return true;
    });
    events.register({ id: "second", keys: ["Tab"] }, (event) => {
      handlerEvent = event;
      calls.push(event.shortcut);
      return true;
    });
    events.register({ id: "late", keys: ["Tab"] }, () => {
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

  test("filters DOM modes and never resolves markers outside the active surface", () => {
    const editor = createRivtoEditor();
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
    editor.mode.set("edgeless");
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

  test("filters delegated events by surface, block, and content scope", () => {
    const editor = createRivtoEditor();
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

  test("deletes DOM registrations and releases their stable IDs", () => {
    const editor = createRivtoEditor();
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

  test("dispatches keyboard actions before ordinary DOM key handlers", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const { root } = realm();
    reactEditor.events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    reactEditor.events.register({
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

  test("orders DOM handlers, applies when, and stops after a claim", () => {
    const editor = createRivtoEditor();
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

  test("constructs exported editor event values directly", () => {
    const editor = createRivtoEditor();
    const { root } = realm();
    const surface = root as unknown as HTMLElement;
    const raw = keyboardEvent(root, "Enter");
    const selection = editor.selection.get();
    const base = {
      raw,
      editor,
      root: surface,
      mode: editor.mode.get(),
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
    editor.destroy();
  });

  test("applies overrides, disabling, exact modifiers, and duplicate IDs", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({
      editor,
      keymap: {
        remapped: ["Primary+ArrowRight"],
        disabled: [],
        unknown: ["Escape"],
      },
    });
    const events = reactEditor.events;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    events.register({ id: "remapped", keys: ["Tab"] }, () => { calls.push("remapped"); return true; });
    events.register({ id: "disabled", keys: ["Escape"] }, () => { calls.push("disabled"); return true; });
    expect(() => events.register({ id: "remapped", keys: ["Enter"] }, () => true)).toThrow(/already registered/);
    expect(() => events.register({
      id: "remapped",
      type: "click",
    }, () => false)).toThrow(/already registered/);
    const release = events.register({ id: "temporary", keys: ["Enter"] }, () => true);
    release();
    expect(() => events.register({ id: "temporary", keys: ["Enter"] }, () => true)).not.toThrow();
    root.emit("keydown", keyboardEvent(root, "Tab"));
    root.emit("keydown", keyboardEvent(root, "ArrowRight", { ctrlKey: true }));
    root.emit("keydown", keyboardEvent(root, "ArrowRight", { ctrlKey: true, shiftKey: true }));
    root.emit("keydown", keyboardEvent(root, "Escape"));
    expect(calls).toEqual(["remapped"]);
    reactEditor.destroy();
    editor.destroy();
  });

  test("supports keyup and all composition policies", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const events = reactEditor.events;
    const { root } = realm();
    events.setRoot(root as unknown as HTMLElement);
    const calls: string[] = [];
    events.register({ id: "ignored", keys: ["a"] }, () => { calls.push("ignored"); return true; });
    events.register({ id: "handled", keys: ["b"], composing: "handle" }, () => { calls.push("handled"); return true; });
    events.register({ id: "prevented", keys: ["c"], composing: "prevent" }, () => { calls.push("prevented"); return true; });
    events.register({ id: "released", keys: ["d"], phase: "keyup" }, () => { calls.push("released"); return true; });
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
    reactEditor.destroy();
    editor.destroy();
  });
});
