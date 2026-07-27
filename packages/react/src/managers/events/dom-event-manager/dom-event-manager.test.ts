import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../../react-editor";
import { EditorEventManager } from "../editor-event-manager";
import { DOMEventManager } from "./dom-event-manager";

describe("DOMEventManager", () => {
  test("extends the base lifecycle and accepts registrations before a root exists", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = new DOMEventManager(reactEditor);
    const dispose = manager.on("pointerdown", () => false);

    expect(manager).toBeInstanceOf(EditorEventManager);
    expect(manager.getRoot()).toBeNull();
    dispose();
    manager.destroy();
    expect(() => manager.on("pointerdown", () => false)).toThrow(/destroyed/);
    reactEditor.destroy();
    editor.destroy();
  });
});
