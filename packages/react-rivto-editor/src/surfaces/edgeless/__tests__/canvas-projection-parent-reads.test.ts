import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessCanvasAdapter } from "../canvas-adapter";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("projects root cards during a transaction without a parent search per card", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const source = new EdgelessCanvasAdapter(panel);
  try {
    for (let index = 0; index < 24; index += 1) {
      const block = core.blocks.insertBlock({ id: `block-${index}`, type: "paragraph" });
      core.elements.insertElement({
        id: `card-${index}`,
        type: "block",
        frame: { x: index * 10, y: 0, width: 200, height: 100 },
        zIndex: index,
        props: { startBlockId: block.id, endBlockId: "unused-end" },
      });
    }
    const parentReads = jestApi.spyOn(panel.blocks, "getParentId");
    const batches = jestApi.spyOn(panel.document.blocks, "getParentIds");
    let rendered = 0;
    core.history.batchUpdates(() => {
      rendered = source.getElements().filter((element) => element.render).length;
    });
    expect(rendered).toBe(24);
    expect(parentReads).toHaveBeenCalledTimes(0);
    expect(batches).toHaveBeenCalledTimes(1);
    expect(batches.mock.calls[0]![0]).not.toContain("unused-end");
    parentReads.mockRestore();
    batches.mockRestore();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("retains boundary precedence and hides cards without a surviving root boundary", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const source = new EdgelessCanvasAdapter(panel);
  try {
    const root = core.blocks.insertBlock({
      id: "root",
      type: "paragraph",
      children: [{ id: "nested", type: "paragraph" }],
    });
    for (const [id, startBlockId, endBlockId] of [
      ["fallback", "missing", root.id],
      ["nested-first", "nested", root.id],
      ["missing", "missing", "also-missing"],
    ]) {
      core.elements.insertElement({
        id,
        type: "block",
        frame: { x: 0, y: 0, width: 200, height: 100 },
        zIndex: 0,
        props: { startBlockId, endBlockId },
      });
    }
    const verify = () => {
      const projection = source.getElements();
      expect(projection.find((element) => element.id === "fallback")?.render).toBe(true);
      expect(projection.find((element) => element.id === "nested-first")?.render).toBe(false);
      expect(projection.find((element) => element.id === "missing")?.render).toBe(false);
    };
    verify();
    core.history.batchUpdates(verify);
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("keeps parent resolution relative to a subtree panel", async () => {
  const { ChildrenPanel } = await import("@chulane/rivto");
  const { ReactPanel } = await import("../../../panels/react-panel");
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  core.blocks.insertBlock({ id: "outside", type: "paragraph" });
  core.blocks.insertBlock({
    id: "parent",
    type: "paragraph",
    children: [{ id: "inside", type: "paragraph" }],
  });
  for (const id of ["inside", "outside"]) {
    core.elements.insertElement({
      id: `card-${id}`,
      type: "block",
      frame: { x: 0, y: 0, width: 200, height: 100 },
      zIndex: 0,
      props: { startBlockId: id, endBlockId: id },
    });
  }
  const scoped = new ReactPanel(
    panel.editor,
    new ChildrenPanel(core, { rootBlockId: "parent" }),
    {},
  );
  try {
    const projection = new EdgelessCanvasAdapter(scoped).getElements();
    expect(projection.find((element) => element.id === "card-inside")?.render).toBe(true);
    expect(projection.find((element) => element.id === "card-outside")?.render).toBe(false);
  } finally {
    scoped.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});
