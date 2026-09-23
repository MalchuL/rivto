/**
 * Covers the full useBlock and node-level useBlockNode contracts used by
 * BlockTree. Identity stability of those snapshots belongs to document-model
 * reactivity tests; this file checks the hook-facing shape and updates.
 *
 * @module
 */
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorView } from "../../editor-view";
import { createReactEditor } from "../../react-editor";
import { BlockCollapseSlot } from "../../blocks/block-slot-controls/block-slot-controls";
import { useBlock, useBlockNode, type UseBlockResult, type UseBlockNodeResult } from "./use-block";

describe("useBlock", () => {
  test("returns full blocks and node child IDs", () => {
    const editor = createEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }).id;
    editor.blocks.moveBlock(childId, parentId, "inside");
    let blockResult: UseBlockResult | undefined;
    let nodeResult: UseBlockNodeResult | undefined;

    const Surface = () => {
      blockResult = useBlock(parentId);
      nodeResult = useBlockNode(parentId);
      return null;
    };
    const reactEditor = createReactEditor({ editor });
    reactEditor.surfaces.register("block", Surface);

    renderToStaticMarkup(createElement(EditorView, { reactEditor }));
    expect(blockResult?.block).toMatchObject({ id: parentId, type: "paragraph", content: "Parent" });
    expect(blockResult?.block?.children.map((child) => child.id)).toEqual([childId]);
    expect(nodeResult?.block?.childIds).toEqual([childId]);
    expect(nodeResult?.block && "children" in nodeResult.block).toBe(false);

    editor.blocks.updateBlock(childId, { content: "After" });
    renderToStaticMarkup(createElement(EditorView, { reactEditor }));
    expect(blockResult?.block?.children[0]?.content).toBe("After");
    expect(nodeResult?.block?.childIds).toEqual([childId]);

    const extraId = editor.blocks.insertBlock({ type: "paragraph", content: "Extra" }, childId).id;
    renderToStaticMarkup(createElement(EditorView, { reactEditor }));
    expect(nodeResult?.block?.childIds).toEqual([childId, extraId]);

    reactEditor.destroy();
    editor.destroy();
  });

  test("collapse slot follows node child IDs", () => {
    const editor = createEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    editor.blocks.moveBlock(childId, parentId, "inside");
    const Surface = () => {
      const { block } = useBlockNode(parentId);
      return block ? createElement(BlockCollapseSlot, { block, mode: "block", selected: false }) : null;
    };
    const reactEditor = createReactEditor({ editor });
    reactEditor.surfaces.register("block", Surface);

    expect(renderToStaticMarkup(createElement(EditorView, { reactEditor }))).toContain("Collapse block");
    editor.blocks.removeBlock(childId);
    expect(renderToStaticMarkup(createElement(EditorView, { reactEditor }))).not.toContain("Collapse block");

    reactEditor.destroy();
    editor.destroy();
  });
});
