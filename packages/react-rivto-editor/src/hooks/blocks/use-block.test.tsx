import { createTestReactEditor as createReactEditor } from "../../test-utils";
/**
 * Covers the full useBlock and node-level useBlockNode contracts used by
 * BlockTree. Identity stability of those snapshots belongs to document-model
 * reactivity tests; this file checks the hook-facing shape and updates.
 *
 * @module
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EditorView } from "../../editor-view/editor-view";
import { PageSurface } from "../../surfaces/page/page-surface";
import { createTestCoreEditor as createEditor, createTestMultiEditor } from "../../test-utils";

import { BlockCollapseSlot } from "../../blocks/block-slot-controls/block-slot-controls";
import { bentoExtension, createBentoBlockInput } from "../../extensions/containers/bento/bento";
import { columnsExtension, createColumnsBlockInput } from "../../extensions/containers/columns/columns";
import { createKanbanBlockInput, kanbanExtension } from "../../extensions/containers/kanban/kanban";
import { createTableBlockInput, tableExtension } from "../../extensions/containers/table/table";
import { useBlock, useBlockNode, type UseBlockNodeResult, type UseBlockResult } from "./use-block";

describe("useBlock", () => {
  test("returns full blocks and node child IDs", async () => {
    const editor = await createEditor();
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
    const editorView = createReactEditor({ editor });
    editorView.runtime.surfaces.register("block", Surface);

    renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime }, createElement(Surface)));
    expect(blockResult?.block).toMatchObject({ id: parentId, type: "paragraph", content: "Parent" });
    expect(blockResult?.block?.children.map((child) => child.id)).toEqual([childId]);
    expect(nodeResult?.block?.childIds).toEqual([childId]);
    expect(nodeResult?.block && "children" in nodeResult.block).toBe(false);

    editor.blocks.updateBlock(childId, { content: "After" });
    renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime }, createElement(Surface)));
    expect(blockResult?.block?.children[0]?.content).toBe("After");
    expect(nodeResult?.block?.childIds).toEqual([childId]);

    const extraId = editor.blocks.insertBlock({ type: "paragraph", content: "Extra" }, childId).id;
    renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime }, createElement(Surface)));
    expect(nodeResult?.block?.childIds).toEqual([childId, extraId]);

    editorView.runtime.destroy();
    editor.destroy();
  });

  test("collapse slot follows node child IDs", async () => {
    const editor = await createEditor();
    const parentId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    const childId = editor.blocks.insertBlock({ type: "paragraph" }).id;
    editor.blocks.moveBlock(childId, parentId, "inside");
    const Surface = () => {
      const { block } = useBlockNode(parentId);
      return block ? createElement(BlockCollapseSlot, { block, mode: "block", selected: false }) : null;
    };
    const editorView = createReactEditor({ editor });
    editorView.runtime.surfaces.register("block", Surface);

    expect(renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime }, createElement(Surface)))).toContain("Collapse block");
    editor.blocks.removeBlock(childId);
    expect(renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime }, createElement(Surface)))).not.toContain("Collapse block");

    editorView.runtime.destroy();
    editor.destroy();
  });
});

test("native source views reuse renderers and bind ordinary editor calls without a custom provider", async () => {
  const { DocumentStorage } = await import("@chulane/document-model");
  const { YjsDocumentRegistry } = await import("@chulane/crdt-doc");
  const { standardPreset } = await import("../../extensions/built-ins/built-ins");
  const { useEditorView } = await import("../../editor-view/use-editor-view");
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
  const source = await storage.create("source", [
    { id: "source", type: "custom", content: "Source" },
    { id: "hidden-sibling", type: "paragraph", content: "Outside displayed subtree" },
  ]);
  const host = await storage.create("host");
  const runtime = await createTestMultiEditor([host, source], storage, { extensions: [standardPreset()] });
  const editor = await runtime.openCoreEditor(host.id);
  editor.blocks.insertBlock({ id: "host", type: "paragraph", content: "Host" });
  const editorRuntime = runtime.getRuntime(source.id)!;
  let result: UseBlockNodeResult | undefined;
  let directWrite: (() => void) | undefined;
  editorRuntime.blockTypes.register({ definition: { type: "custom" }, render: ({ blockId }) => {
    const view = useEditorView();
    expect(view.runtime.renderers).toBe(editorRuntime.renderers);
    expect(view.runtime.getDocument()).toBe(source);
    directWrite = () => view.runtime.blocks.updateBlock(blockId, { content: "Direct renderer edit" });
    result = useBlockNode(blockId);
    return createElement("span", { "data-custom": "true" }, result.block?.content);
  } });
  const markup = renderToStaticMarkup(createElement(EditorView, { runtime: editorRuntime, rootBlockId: "source" }, createElement(PageSurface)));
  expect(markup).toContain('data-custom="true">Source');
  expect(markup).not.toContain("Outside displayed subtree");
  directWrite!();
  expect(source.blocks.getBlockNode("source")?.content).toBe("Direct renderer edit");
  result!.operations.setProp("checked", true);
  expect(source.blocks.getBlockNode("source")?.props.checked).toBe(true);
  expect(editor.blocks.getBlocks()).toMatchObject([{ id: "host", content: "Host" }]);
  await runtime.destroy(); await storage.destroy();
});

test.each([
  ["Bento", bentoExtension, createBentoBlockInput],
  ["Columns", columnsExtension, createColumnsBlockInput],
  ["Kanban", kanbanExtension, createKanbanBlockInput],
  ["Table", tableExtension, createTableBlockInput],
] as const)("%s source subtrees use the host container renderer and display their own summary", async (title, extension, input) => {
  const editor = await createEditor();
  editor.blocks.insertBlock({ id: "host", type: "paragraph", content: "Host" });
  const sourceCore = await createEditor();
  const { standardPreset } = await import("../../extensions/built-ins/built-ins");
  const editorView = createReactEditor({ editor: sourceCore, extensions: [standardPreset(), extension()] });
  editorView.runtime.blocks.insertBlock({ ...input(), id: "container", listProps: { collapsed: true } });
  const markup = renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime, rootBlockId: "container" }, createElement(PageSurface)));
  expect(markup).toContain(title);
  expect(markup).toContain('data-block-id="container"');
  if (title === "Kanban") expect(markup).toContain("3 columns");
  if (title === "Table") expect(markup).toContain("3 × 3");
  expect(editor.blocks.getRootIds()).toEqual(["host"]);
  editorView.runtime.destroy(); await sourceCore.destroy(); await editor.destroy();
});
