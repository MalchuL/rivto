import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createReactEditor } from "../../react-editor";

describe("ReactSlashCommandManager", () => {
  test("owns storage, execution, revision, and disposal", () => {
    const editor = createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" });
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.slashCommands;
    let executed = false;
    const revision = manager.revision;
    const dispose = manager.register({
      id: "test.command",
      title: "Test",
      execute: () => { executed = true; },
    });

    expect(manager.revision).toBeGreaterThan(revision);
    expect(manager.getAll({ blockId }).map(({ id }) => id)).toContain("test.command");
    manager.execute("test.command", { blockId });
    expect(executed).toBe(true);
    expect(manager.delete("test.command")).toBe(true);
    expect(manager.delete("test.command")).toBe(false);
    dispose();
    expect(manager.getAll({ blockId }).map(({ id }) => id)).not.toContain("test.command");
    reactEditor.destroy();
    editor.destroy();
  });

  test("validates registrations and command availability", () => {
    const editor = createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" });
    const reactEditor = createReactEditor({ editor });
    const manager = reactEditor.slashCommands;
    expect(() => manager.register({ id: "", title: "Missing", execute() {} })).toThrow("ID");
    expect(() => manager.register({ id: "missing", title: "", execute() {} })).toThrow("title");
    manager.register({
      id: "conditional",
      title: "Conditional",
      isAvailable: ({ blockId: current }) => current === blockId,
      execute() {},
    });
    expect(() => manager.register({ id: "conditional", title: "Again", execute() {} })).toThrow("already registered");
    expect(manager.getAll({ blockId: "other" })).toEqual([]);
    expect(() => manager.execute("conditional", { blockId: "other" })).toThrow("unavailable");
    expect(() => manager.execute("unknown", { blockId })).toThrow("Unknown");
    reactEditor.destroy();
    editor.destroy();
  });
});
