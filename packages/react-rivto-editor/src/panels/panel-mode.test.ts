import { ModeManager } from "@chulane/rivto";
import { createReactEditor } from "../editor/react-editor";
import { createTestCoreEditor } from "../test-utils";
import { ChildrenPanel } from "./children-panel";
  it("separates undo captures across a mode change", async () => {
    const core = await createTestCoreEditor();
    const editor = new ChildrenPanel(createReactEditor({ editor: core }));
    const close = editor.mount();
    const block = editor.blocks.insertBlock({ type: "paragraph", content: "Initial" });
    editor.document.history.clear();
    editor.blocks.updateBlock(block.id, { content: "Before switch" });
    editor.mode.set("edgeless");
    editor.blocks.updateBlock(block.id, { content: "After switch" });
    editor.document.history.undo();
    expect(editor.blocks.getBlockNode(block.id)?.content).toBe("Before switch");
    editor.document.history.undo();
    expect(editor.blocks.getBlockNode(block.id)?.content).toBe("Initial");
    expect(editor.mode.get()).toBe("edgeless");
    close(); editor.editor.destroy(); await core.destroy();
  });

  it("keeps mode local to panels and leaves persisted state unchanged", async () => {
    const core = await createTestCoreEditor();
    const shared = createReactEditor({ editor: core });
    const first = new ChildrenPanel(shared, { mode: new ModeManager("edgeless") });
    const second = new ChildrenPanel(shared);
    const closeFirst = first.mount(); const closeSecond = second.mount();
    first.blocks.insertBlock({ type: "paragraph", content: "Shared document" });
    const before = core.dump(); const revision = core.revision;
    first.mode.set("block");
    expect(core.revision).toBe(revision);
    first.mode.set("edgeless");
    expect(second.mode.get()).toBe("block");
    expect(core.dump()).toEqual(before);
    closeFirst(); closeSecond(); shared.destroy(); await core.destroy();
  });
