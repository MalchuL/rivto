/**
 * Covers the node-level useBlock contract and the child-id split used by
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
import { useBlock, type UseBlockResult } from "./use-block";
import { useBlockChildren, type UseBlockChildrenResult } from "./use-block-children";

describe("useBlock", () => {
  test("returns a node snapshot and child identifiers without a recursive tree", () => {
    const editor = createEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph", content: "Parent" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph", content: "Child" }).id;
    editor.blocks.moveBlock(childId, parentId, "inside");
    let blockResult: UseBlockResult | undefined;
    let childResult: UseBlockChildrenResult | undefined;

    const Surface = () => {
      blockResult = useBlock(parentId);
      childResult = useBlockChildren(parentId);
      return null;
    };
    const reactEditor = createReactEditor({ editor });
    reactEditor.surfaces.register("block", Surface);

    renderToStaticMarkup(createElement(EditorView, { reactEditor }));
    expect(blockResult?.block).toMatchObject({ id: parentId, type: "paragraph", content: "Parent" });
    expect(blockResult?.block && "children" in blockResult.block).toBe(false);
    expect(childResult?.children).toEqual([childId]);

    editor.blocks.updateBlock(childId, { content: "After" });
    renderToStaticMarkup(createElement(EditorView, { reactEditor }));
    expect(blockResult?.block && "children" in blockResult.block).toBe(false);
    expect(childResult?.children).toEqual([childId]);

    const extraId = editor.blocks.insertBlock({ type: "paragraph", content: "Extra" }, childId).id;
    renderToStaticMarkup(createElement(EditorView, { reactEditor }));
    expect(childResult?.children).toEqual([childId, extraId]);

    reactEditor.destroy();
    editor.destroy();
  });
});
