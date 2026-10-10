import { ModeManager } from "./mode-manager";
import { createTestEditor } from "../../editor/test-utils";
import { createRivtoEditor } from "../../editor/rivto-editor";

describe("ModeManager", () => {
  it("notifies once per effective change and supports independent subscriptions", () => {
    const mode = new ModeManager();
    const first = jest.fn(() => expect(mode.get()).toBe("edgeless"));
    const second = jest.fn();
    const unsubscribe = mode.subscribe(first);
    mode.subscribe(second);
    expect(mode.get()).toBe("block");
    mode.set("block");
    expect(second).not.toHaveBeenCalled();
    mode.set("edgeless");
    mode.set("edgeless");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    unsubscribe();
    unsubscribe();
    mode.set("block");
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(2);
  });

  it("separates undo captures across a mode change", async () => {
    const editor = await createTestEditor();
    const block = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });
    editor.history.clear();
    editor.blocks.updateBlock(block.id, { content: "Before switch" });
    editor.mode.set("edgeless");
    editor.blocks.updateBlock(block.id, { content: "After switch" });
    editor.history.undo();
    expect(editor.blocks.getBlockNode(block.id)?.content).toBe("Before switch");
    editor.history.undo();
    expect(editor.blocks.getBlockNode(block.id)?.content).toBe("Initial");
    expect(editor.mode.get()).toBe("edgeless");
    await editor.destroy();
  });

  it("keeps mode local to each editor and leaves persisted state unchanged", async () => {
    const first = await createTestEditor({ mode: "edgeless" });
    const second = createRivtoEditor({ document: first.getDocument() });
    first.blocks.insertBlock({ type: "paragraph", content: "Shared document" });
    const before = first.dump();
    const revision = first.revision;
    const secondRevision = second.revision;
    const changed = jest.fn();
    first.subscribe(changed);
    first.mode.set("block");
    expect(first.revision).toBe(revision + 1);
    expect(changed).toHaveBeenCalledTimes(1);
    expect(second.revision).toBe(secondRevision);
    expect(second.mode.get()).toBe("block");
    first.mode.set("edgeless");
    expect(second.mode.get()).toBe("block");
    expect(first.dump()).toEqual(before);
    await first.destroy();
    first.mode.set("block");
    expect(changed).toHaveBeenCalledTimes(2);
    await second.destroy();
  });
});
