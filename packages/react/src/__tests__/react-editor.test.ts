import { createRivtoEditor } from "@chulane/rivto";
import type { ComponentType } from "react";
import { EditorEvents } from "../events";
import { KeyboardEvents } from "../keyboard-events";
import { createReactEditor, type ReactEditorPlugin } from "../react-editor";

const Empty: ComponentType<{ blockId: string }> = () => null;

describe("ReactEditor", () => {
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
});

describe("delegated events", () => {
  test("orders handlers, stops after preventDefault, and matches exact shortcuts", () => {
    const editor = createRivtoEditor();
    const events = new EditorEvents(editor, () => editor.mode.get());
    const keyboard = new KeyboardEvents(events);
    const listeners = new Map<string, EventListener>();
    const root = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => listeners.set(type, listener as EventListener),
      removeEventListener: (type: string) => listeners.delete(type),
    } as unknown as HTMLElement;
    events.setRoot(root);
    const replacementListeners = new Map<string, EventListener>();
    const replacement = {
      addEventListener: (type: string, listener: EventListenerOrEventListenerObject) => replacementListeners.set(type, listener as EventListener),
      removeEventListener: (type: string) => replacementListeners.delete(type),
    } as unknown as HTMLElement;
    events.setRoot(replacement);
    expect(listeners.size).toBe(0);
    expect(replacementListeners.has("keydown")).toBe(true);
    events.setRoot(root);

    const calls: string[] = [];
    keyboard.bind("Tab", ({ event }) => { calls.push("tab"); event.preventDefault(); });
    keyboard.bind("Tab", () => calls.push("late"));
    keyboard.bind("Shift+Tab", () => calls.push("outdent"));
    const nativeEvent = {
      type: "keydown",
      key: "Tab",
      ctrlKey: false,
      metaKey: false,
      altKey: false,
      shiftKey: false,
      defaultPrevented: false,
      target: null,
      preventDefault() { nativeEvent.defaultPrevented = true; },
    };
    const event = nativeEvent as unknown as KeyboardEvent;
    listeners.get("keydown")?.(event);
    expect(calls).toEqual(["tab"]);

    keyboard.destroy();
    events.destroy();
    editor.destroy();
    expect(listeners.size).toBe(0);
    expect(replacementListeners.size).toBe(0);
  });
});
