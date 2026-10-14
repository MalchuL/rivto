import {
  createTestCoreEditor as createEditor,
  createTestReactEditor as createReactEditor,
} from "../../test-utils";

describe("SlashCommandRegistry", () => {
  test("owns storage, execution, revision, and disposal", async () => {
    const editor = await createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const reactPanel = createReactEditor({ editor });
    const manager = reactPanel.slashCommands;
    let executed = false;
    const revision = manager.revision;
    const dispose = reactPanel.editor.slashCommands.register({
      id: "test.command",
      title: "Test",
      execute: () => {
        executed = true;
      },
    });

    expect(manager.revision).toBeGreaterThan(revision);
    expect(manager.getAll({ blockId }).map(({ id }) => id)).toContain("test.command");
    manager.execute("test.command", { blockId });
    expect(executed).toBe(true);
    expect(reactPanel.editor.slashCommands.delete("test.command")).toBe(true);
    expect(reactPanel.editor.slashCommands.delete("test.command")).toBe(false);
    dispose();
    expect(manager.getAll({ blockId }).map(({ id }) => id)).not.toContain("test.command");
    reactPanel.editor.destroy();
    editor.destroy();
  });

  test("validates registrations and command availability", async () => {
    const editor = await createEditor();
    const blockId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const reactPanel = createReactEditor({ editor });
    const manager = reactPanel.slashCommands;
    expect(() =>
      reactPanel.editor.slashCommands.register({
        id: "",
        title: "Missing",
        /**
         * Provides a no-op executor for slash-command registration validation.
         */
        execute() {},
      }),
    ).toThrow("ID");
    expect(() =>
      reactPanel.editor.slashCommands.register({
        id: "missing",
        title: "",
        /**
         * Provides a no-op executor for slash-command registration validation.
         */
        execute() {},
      }),
    ).toThrow("title");
    reactPanel.editor.slashCommands.register({
      id: "conditional",
      title: "Conditional",
      isAvailable: ({ blockId: current }) => current === blockId,
      /**
       * Provides a no-op executor because this fixture tests command lookup only.
       */
      execute() {},
    });
    expect(() =>
      reactPanel.editor.slashCommands.register({
        id: "conditional",
        title: "Again",
        /**
         * Provides a no-op executor for the duplicate slash-command registration fixture.
         */
        execute() {},
      }),
    ).toThrow("already registered");
    expect(manager.getAll({ blockId: "other" })).toEqual([]);
    expect(() => manager.execute("conditional", { blockId: "other" })).toThrow("unavailable");
    expect(() => manager.execute("unknown", { blockId })).toThrow("Unknown");
    reactPanel.editor.destroy();
    editor.destroy();
  });
});
