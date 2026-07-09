import { createRivtoEditor } from "../rivto-editor";

describe("EditorRuntime block commands", () => {
  const expectOneUpdate = (editor: ReturnType<typeof createRivtoEditor>, action: () => void): void => {
    const calls: number[] = [];
    const unsubscribe = editor.subscribe(() => calls.push(editor.revision));
    const before = editor.revision;

    action();

    expect(calls).toHaveLength(1);
    expect(editor.revision).toBe(before + 1);
    expect(calls[0]).toBe(editor.revision);
    unsubscribe();
  };

  it("mutates blocks through registered commands", () => {
    const editor = createRivtoEditor();

    const firstId = editor.execute("block.insert", {
      block: { type: "paragraph", content: "First" },
    });
    const secondId = editor.execute("block.insert", {
      block: { type: "paragraph", content: "Second" },
      afterId: firstId,
    });

    editor.execute("block.prop.set", { id: firstId, key: "tone", value: "info" });
    editor.execute("block.layout.set", { id: firstId, layout: { x: 120, y: 80 } });
    editor.execute("block.indent", { id: secondId });

    expect(editor.document.document).toMatchObject([
      {
        id: firstId,
        props: { tone: "info" },
        layout: { x: 120, y: 80 },
        children: [{ id: secondId, content: "Second" }],
      },
    ]);

    editor.execute("block.remove", { id: firstId });

    expect(editor.document.document).toEqual([]);
    editor.destroy();
  });

  it("registers and removes runtime commands through the editor api", () => {
    const editor = createRivtoEditor();

    editor.register("test.echo", (payload) => payload);

    expect(editor.execute("test.echo", "ok")).toBe("ok");

    editor.removeCommand("test.echo");

    expect(() => editor.execute("test.echo")).toThrow("Unknown command test.echo");
    editor.destroy();
  });

  it("notifies subscribers once for every successful block command", () => {
    const editor = createRivtoEditor();
    let firstId = "";
    let secondId = "";

    expectOneUpdate(editor, () => {
      firstId = editor.execute("block.insert", { block: { type: "paragraph", content: "First" } }) as string;
    });
    expectOneUpdate(editor, () => {
      secondId = editor.execute("block.insert", { block: { type: "paragraph", content: "Second" }, afterId: firstId }) as string;
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.update", { id: firstId, patch: { content: "First updated" } });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.prop.set", { id: firstId, key: "tone", value: "info" });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.pluginData.set", { id: firstId, pluginId: "test", value: { seen: true } });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.layout.set", { id: firstId, layout: { x: 20 } });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.indent", { id: secondId });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.outdent", { id: secondId });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.move", { id: secondId, afterId: null });
    });
    expectOneUpdate(editor, () => {
      editor.execute("block.remove", { id: secondId });
    });

    editor.destroy();
  });

  it("stops notifying after unsubscribe", () => {
    const editor = createRivtoEditor();
    const listener = jest.fn();
    const unsubscribe = editor.subscribe(listener);

    unsubscribe();
    editor.execute("block.insert", { block: { type: "paragraph" } });

    expect(listener).not.toHaveBeenCalled();
    editor.destroy();
  });

  it("does not notify when a command fails", () => {
    const editor = createRivtoEditor();
    const listener = jest.fn();
    editor.subscribe(listener);
    const before = editor.revision;

    expect(() => editor.execute("block.insert", { block: { type: "missing" } })).toThrow("unavailable");

    expect(listener).not.toHaveBeenCalled();
    expect(editor.revision).toBe(before);
    editor.destroy();
  });
});
