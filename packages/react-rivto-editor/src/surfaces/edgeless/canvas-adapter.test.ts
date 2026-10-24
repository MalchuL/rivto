import { EdgelessCanvasAdapter } from "./canvas-adapter";

/**
 * Rejects document reads in a selection query that does not contain any blocks.
 *
 * @returns Never returns: a call means an unnecessary document traversal occurred.
 * @throws For any attempted read or subscription in the empty-selection query.
 */
function unexpectedRead(): never {
  throw new Error("Empty block selection must not traverse the document");
}

test("object-only selection does not read roots, ancestors or element lists for card pinning", () => {
  const adapter = new EdgelessCanvasAdapter({
    blocks: { getRootIds: unexpectedRead, getParentId: unexpectedRead },
    elements: { getElementNode: unexpectedRead, getElementNodes: unexpectedRead },
    selection: { get: unexpectedRead, subscribe: unexpectedRead },
    editor: {
      subscribe: unexpectedRead,
      elementTypes: { get: unexpectedRead, subscribe: unexpectedRead },
    },
  });
  expect(adapter.getCardIdsForBlocks([])).toEqual([]);
});

test("marquee queries exclude hidden subtree cards and their groups after returning to the document", async () => {
  const { createTestCoreEditor, createTestReactEditor } = await import("../../test-utils");
  const { Canvas } = await import("@chulane/rivto-edgeless");
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  try {
    const root = core.blocks.insertBlock({
      type: "paragraph",
      children: [{ type: "paragraph", content: "Nested card" }],
    });
    const group = core.elements.insertElement({
      type: "group",
      frame: { x: 0, y: 0, width: 1, height: 1 },
      zIndex: 0,
    });
    const projection = panel.editor.blockElements.createPanelProjection(root.id, group.id);
    projection.reconcile();
    const hidden = core.elements
      .getElementNodes()
      .find(
        (element) =>
          element.type === "block" && element.props.startBlockId === root.children[0]!.id,
      )!;
    core.elements.updateElement(hidden.id, { frame: { x: 700, y: 200 } });
    projection.destroy();
    const visible = core.elements.insertElement({
      type: "rectangle",
      frame: { x: 700, y: 200, width: 100, height: 80 },
      zIndex: 1,
    });
    const visibleGroup = core.elements.insertElement({
      type: "group",
      frame: { x: 700, y: 200, width: 100, height: 80 },
      childIds: [visible.id],
      zIndex: 1,
    });
    const canvas = new Canvas();
    canvas.setElements(new EdgelessCanvasAdapter(panel).getElements());
    const hits = canvas.query({ x: 690, y: 190, width: 300, height: 200 });
    expect(hits).toContain(visible.id);
    expect(hits).toContain(visibleGroup.id);
    expect(hits).not.toContain(hidden.id);
    expect(hits).not.toContain(group.id);
  } finally {
    await panel.editor.destroy();
    await core.destroy();
  }
});
