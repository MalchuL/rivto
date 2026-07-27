import { createRivtoEditor } from "@chulane/rivto";
import type { ReactEditor } from "../../../react-editor";
import { createReactEditor } from "../../../react-editor";
import { EditorEventManager } from "./editor-event-manager";

class TestEventManager extends EditorEventManager {
  readonly items: string[] = [];

  constructor(reactEditor: ReactEditor) {
    super(reactEditor);
  }

  add(value: string): () => void {
    return this.register(this.items, value, () => undefined);
  }
}

describe("EditorEventManager", () => {
  test("keeps registration order and returns idempotent disposers", () => {
    const editor = createRivtoEditor();
    const reactEditor = createReactEditor({ editor });
    const manager = new TestEventManager(reactEditor);
    const dispose = manager.add("first");
    manager.add("second");
    dispose();
    dispose();
    expect(manager.items).toEqual(["second"]);
    manager.destroy();
    expect(() => manager.add("third")).toThrow(/destroyed/);
    reactEditor.destroy();
    editor.destroy();
  });
});
