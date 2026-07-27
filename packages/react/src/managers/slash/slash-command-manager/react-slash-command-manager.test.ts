import { createRivtoEditor } from "@chulane/rivto";
import { createReactEditor } from "../../../react-editor";

describe("ReactSlashCommandManager", () => {
  test("delegates storage, execution, revision, and disposal to core", () => {
    const editor = createRivtoEditor();
    const blockId = editor.insertBlock({ type: "paragraph" });
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
});
