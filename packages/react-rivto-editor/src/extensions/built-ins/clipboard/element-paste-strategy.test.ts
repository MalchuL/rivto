import { createTestReactEditor as createReactEditor } from "../../../test-utils";
/** Element paste recreates visual-only clipboard bundles in edgeless mode. */

import { createTestCoreEditor } from "../../../test-utils";
import { findEdgelessRuntime, installEdgelessRuntime } from "../selection/edgeless-runtime";
import { ElementPasteStrategy } from "./element-paste-strategy";

describe("ElementPasteStrategy", () => {
  it("clones selected visual elements with fresh IDs and offset geometry", async () => {
    const editor = await createTestCoreEditor({ mode: "edgeless" });
    editor.elements.insertElement({
      id: "source",
      type: "text",
      frame: { x: 10, y: 20, width: 100, height: 40 },
      zIndex: 2,
      props: { text: "Copied" },
    });
    const editorView = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(editorView);
    const created = new ElementPasteStrategy(editorView).paste({
      bundle: {
        version: 4,
        blocks: [],
        elements: [{
          id: "source",
          type: "text",
          frame: { x: 10, y: 20, width: 100, height: 40 },
          zIndex: 2,
          props: { text: "Copied" },
        }, {
          id: "not-selected",
          type: "text",
          frame: { x: 0, y: 0, width: 10, height: 10 },
          zIndex: 1,
          props: { text: "Skipped" },
        }],
        selectedElementIds: ["source"],
      },
      selection: undefined,
    }, {});

    const elementIds = created?.proposedSelection.elements;
    expect(elementIds).toHaveLength(1);
    expect(elementIds?.[0]).not.toBe("source");
    expect([...(created?.elementIdMap ?? [])]).toEqual([["source", elementIds?.[0]]]);
    expect(editor.elements.getElement(elementIds![0]!)).toMatchObject({
      type: "text",
      frame: { x: 34, y: 44, width: 100, height: 40 },
      props: { text: "Copied" },
    });
    expect(findEdgelessRuntime(editorView)?.get().items).toEqual([]);
    uninstall();
    editorView.runtime.destroy();
    editor.destroy();
  });

  it("restores a cut element's ID when it is free", async () => {
    const editor = await createTestCoreEditor({ mode: "edgeless" });
    const source = {
      id: "cut-element",
      type: "text",
      frame: { x: 10, y: 20, width: 100, height: 40 },
      zIndex: 2,
      props: { text: "Cut" },
    };
    editor.elements.insertElement(source);
    editor.elements.removeElement(source.id);
    const editorView = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(editorView);

    const created = new ElementPasteStrategy(editorView).paste({
      bundle: { version: 4, blocks: [], elements: [source], selectedElementIds: [source.id] },
      selection: undefined,
    }, {});

    expect(created?.proposedSelection.elements).toEqual([source.id]);
    expect([...(created?.elementIdMap ?? [])]).toEqual([[source.id, source.id]]);
    expect(editor.elements.getElement(source.id)?.props).toEqual({ text: "Cut" });
    uninstall();
    editorView.runtime.destroy();
    editor.destroy();
  });

  it("uses the block import map without reading block selection order", async () => {
    const editor = await createTestCoreEditor({ mode: "edgeless" });
    const destinationId = editor.blocks.insertBlock({ type: "paragraph", content: "Pasted" }).id;
    const editorView = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(editorView);

    const created = new ElementPasteStrategy(editorView).paste({
      bundle: {
        version: 4,
        blocks: [{
          id: "source-block",
          type: "paragraph",
          content: "Pasted",
          listProps: {},
          props: {},
          pluginData: {},
          children: [],
        }],
        elements: [{
          id: "source-element",
          type: "block",
          frame: { x: 10, y: 20, width: 100, height: 40 },
          zIndex: 2,
          props: { startBlockId: "source-block", endBlockId: "source-block" },
        }],
      },
      blockIdMap: new Map([["source-block", destinationId]]),
      selection: undefined,
    }, {});

    const elementId = created?.proposedSelection.elements?.[0];
    expect(editor.elements.getElement(elementId ?? "")?.props).toMatchObject({
      startBlockId: destinationId,
      endBlockId: destinationId,
    });
    uninstall();
    editorView.runtime.destroy();
    editor.destroy();
  });
});

it("pastes cards into an explicit second document and remaps their block references consistently", async () => {
  const { DocumentModelImpl } = await import("@chulane/document-model");
  const { YjsDoc } = await import("@chulane/crdt-doc");
  const { createTestMultiEditor } = await import("../../../test-utils");
  const { createTestReactEditor: createRuntime } = await import("../../../test-utils");
  const { standardPreset } = await import("../built-ins");
  const multi = await createTestMultiEditor([new DocumentModelImpl(new YjsDoc("A")), new DocumentModelImpl(new YjsDoc("B"))], undefined, { extensions: [standardPreset()] });
  const runtime = multi.getRuntime("B")!;
  runtime.mode.set("edgeless");
  const a = await multi.openCoreEditor("A"); const b = await multi.openCoreEditor("B");
  const block = a.blocks.insertBlock({ id: "source-block", type: "paragraph", content: "Copied card" });
  const card = a.elements.insertElement({ id: "source-card", type: "block", frame: { x: 10, y: 20, width: 100, height: 40 }, zIndex: 0, props: { startBlockId: block.id, endBlockId: block.id } });
  await b.clipboard.paste( { bundle: { version: 4, blocks: [block], elements: [card] }, placement: { mergeText: false } });
  const pasted = b.blocks.getBlocks()[0]!;
  expect(pasted.id).toBe(block.id); expect(pasted.content).toBe("Copied card");
  expect(b.elements.getElement("source-card")?.props).toMatchObject({ startBlockId: pasted.id, endBlockId: pasted.id });
  expect(a.elements.getElement(card.id)?.props).toMatchObject({ startBlockId: block.id, endBlockId: block.id });
  expect(a.blocks.getBlockNode(block.id)?.content).toBe("Copied card");
  b.history.undo(); expect(b.blocks.getRootIds()).toEqual([]); expect(b.elements.hasElement("source-card")).toBe(false);
  runtime.destroy(); await multi.destroy();
});
