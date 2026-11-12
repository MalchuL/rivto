import { createTestEditor } from "../editor/test-utils";

test("a stale block processor disposer cannot remove its replacement", async () => {
  const editor = await createTestEditor();
  const calls: string[] = [];
  try {
    const old = editor.blocks.registerProcessor({
      id: "probe",
      priority: 0,
      processor: (value) => {
        calls.push("old");
        return value;
      },
    });
    const current = editor.blocks.registerProcessor({
      id: "probe",
      priority: 0,
      processor: (value) => {
        calls.push("new");
        return value;
      },
    });
    old();
    editor.blocks.insertBlock({ type: "paragraph", content: "test" });
    expect(calls).toEqual(["new"]);
    current();
    old();
  } finally {
    await editor.destroy();
  }
});

test("a stale element processor disposer cannot remove its replacement", async () => {
  const editor = await createTestEditor();
  const calls: string[] = [];
  try {
    const old = editor.elements.registerProcessor({
      id: "probe",
      priority: 0,
      processor: (value) => {
        calls.push("old");
        return value;
      },
    });
    const current = editor.elements.registerProcessor({
      id: "probe",
      priority: 0,
      processor: (value) => {
        calls.push("new");
        return value;
      },
    });
    old();
    editor.elements.insertElement({
      type: "rectangle",
      frame: { x: 0, y: 0, width: 10, height: 10 },
      zIndex: 0,
      props: {},
    });
    expect(calls).toEqual(["new"]);
    current();
    old();
  } finally {
    await editor.destroy();
  }
});
