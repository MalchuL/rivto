import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../../react-editor";
import { DOMEventManager } from "../dom-event-manager";
import { EditorEventManager } from "../editor-event-manager";
import { KeyboardEventManager } from "./keyboard-event-manager";
import { shortcutFromKeyboardEvent } from "./utils/shortcut";

describe("KeyboardEventManager", () => {
  test("extends the DOM/base managers and normalizes Primary shortcuts", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.events;
    expect(manager).toBeInstanceOf(DOMEventManager);
    expect(manager).toBeInstanceOf(EditorEventManager);
    expect(shortcutFromKeyboardEvent({
      key: "z",
      ctrlKey: true,
      metaKey: false,
      altKey: false,
      shiftKey: true,
    } as KeyboardEvent)).toBe("Primary+Shift+z");
    reactEditor.destroy();
    editor.destroy();
  });

  test("deletes and releases a stable binding ID for reuse", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.events;
    const bind = () => manager.bind({
      id: "test.delete",
      keys: ["Primary+K"],
    }, () => false);

    const oldDispose = bind();
    expect(manager.delete("test.delete")).toBe(true);
    expect(manager.delete("test.delete")).toBe(false);
    expect(bind).not.toThrow();
    oldDispose();
    expect(bind).toThrow(/already registered/);
    reactEditor.destroy();
    editor.destroy();
  });
});
