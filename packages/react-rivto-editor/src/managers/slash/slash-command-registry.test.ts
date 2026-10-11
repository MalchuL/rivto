import { createTestCoreEditor as createEditor, createTestReactEditor as createReactEditor } from "../../test-utils";


describe("SlashCommandRegistry", () => {
  test("owns storage, execution, revision, and disposal", async () => {
    const editor = await createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const editorView = createReactEditor({ editor });
    const manager = editorView.slashCommands;
    let executed = false;
    const revision = manager.revision;
    const dispose = editorView.runtime.slashCommands.register({
      id: "test.command",
      title: "Test",
      execute: () => { executed = true; },
    });

    expect(manager.revision).toBeGreaterThan(revision);
    expect(manager.getAll({ blockId }).map(({ id }) => id)).toContain("test.command");
    manager.execute("test.command", { blockId });
    expect(executed).toBe(true);
    expect(editorView.runtime.slashCommands.delete("test.command")).toBe(true);
    expect(editorView.runtime.slashCommands.delete("test.command")).toBe(false);
    dispose();
    expect(manager.getAll({ blockId }).map(({ id }) => id)).not.toContain("test.command");
    editorView.runtime.destroy();
    editor.destroy();
  });

  test("validates registrations and command availability", async () => {
    const editor = await createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const editorView = createReactEditor({ editor });
    const manager = editorView.slashCommands;
    expect(() => editorView.runtime.slashCommands.register({ id: "", title: "Missing", execute() {} })).toThrow("ID");
    expect(() => editorView.runtime.slashCommands.register({ id: "missing", title: "", execute() {} })).toThrow("title");
    editorView.runtime.slashCommands.register({
      id: "conditional",
      title: "Conditional",
      isAvailable: ({ blockId: current }) => current === blockId,
      execute() {},
    });
    expect(() => editorView.runtime.slashCommands.register({ id: "conditional", title: "Again", execute() {} })).toThrow("already registered");
    expect(manager.getAll({ blockId: "other" })).toEqual([]);
    expect(() => manager.execute("conditional", { blockId: "other" })).toThrow("unavailable");
    expect(() => manager.execute("unknown", { blockId })).toThrow("Unknown");
    editorView.runtime.destroy();
    editor.destroy();
  });
});
