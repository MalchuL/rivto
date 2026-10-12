import { ChildrenPanel } from "../../../panels/children-panel";
import { createTestReactEditor as createReactEditor } from "../../../test-utils";
/** Element paste recreates visual-only clipboard bundles in edgeless mode. */

import { createTestCoreEditor } from "../../../test-utils";
import { findEdgelessRuntime, installEdgelessRuntime } from "../selection/edgeless-runtime";
import { ElementPasteStrategy } from "./element-paste-strategy";

describe("ElementPasteStrategy", () => {
  it("clones selected visual elements with fresh IDs and offset geometry", async () => {
    const editor = await createTestCoreEditor({ mode: "edgeless" });
    editor.elements.insertElement({ id: "source",
      type: "text",
      frame: { x: 10, y: 20, width: 100, height: 40 },
      zIndex: 2,
      props: { text: "Copied" },
    });
    const panel = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(panel);
    const created = new ElementPasteStrategy(panel).paste({
      bundle: {
        version: 4,
        blocks: [],
        elements: [{ childIds: [], id: "source",
          type: "text",
          frame: { x: 10, y: 20, width: 100, height: 40 },
          zIndex: 2,
          props: { text: "Copied" },
        }, { childIds: [], id: "not-selected",
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
    expect(editor.elements.getElementNode(elementIds![0]!)).toMatchObject({
      type: "text",
      frame: { x: 34, y: 44, width: 100, height: 40 },
      props: { text: "Copied" },
    });
    expect(findEdgelessRuntime(panel)?.get().items).toEqual([]);
    uninstall();
    panel.editor.destroy();
    editor.destroy();
  });

  it("restores a cut element's ID when it is free", async () => {
    const editor = await createTestCoreEditor({ mode: "edgeless" });
    const source = { childIds: [], id: "cut-element",
      type: "text",
      frame: { x: 10, y: 20, width: 100, height: 40 },
      zIndex: 2,
      props: { text: "Cut" },
    };
    editor.elements.insertElement(source);
    editor.elements.removeElement(source.id);
    const panel = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(panel);

    const created = new ElementPasteStrategy(panel).paste({
      bundle: { version: 4, blocks: [], elements: [source], selectedElementIds: [source.id] },
      selection: undefined,
    }, {});

    expect(created?.proposedSelection.elements).toEqual([source.id]);
    expect([...(created?.elementIdMap ?? [])]).toEqual([[source.id, source.id]]);
    expect(editor.elements.getElementNode(source.id)?.props).toEqual({ text: "Cut" });
    uninstall();
    panel.editor.destroy();
    editor.destroy();
  });

  it("uses the block import map without reading block selection order", async () => {
    const editor = await createTestCoreEditor({ mode: "edgeless" });
    const destinationId = editor.blocks.insertBlock({ type: "paragraph", content: "Pasted" }).id;
    const panel = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(panel);

    const created = new ElementPasteStrategy(panel).paste({
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
        elements: [{ childIds: [], id: "source-element",
          type: "block",
          frame: { x: 10, y: 20, width: 100, height: 40 },
          zIndex: 2,
          props: { startBlockId: "source-block", endBlockId: "source-block", rootBlockId: "source-parent", rootElementId: "source-group", rotation: 30, autoHeight: false, custom: { color: "blue" } },
        }],
      },
      blockIdMap: new Map([["source-block", destinationId]]),
      selection: undefined,
    }, {});

    const elementId = created?.proposedSelection.elements?.[0];
    // Reconciliation must extend the range without resetting copied presentation settings.
    const following = editor.blocks.insertBlock({ type: "paragraph", content: "Following" }, editor.blocks.getInsertionDestinationAfter(destinationId));
    panel.editor.blockElements.reconcile();
    expect(editor.elements.getElementNode(elementId ?? "")?.props).toEqual({
      rotation: 30, autoHeight: false, custom: { color: "blue" },
      startBlockId: destinationId,
      endBlockId: following.id,
    });
    uninstall();
    panel.editor.destroy();
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
  const runtime = multi.getEditor("B")!;
  const panel = new ChildrenPanel(runtime);
  panel.mode.set("edgeless");
  const a = (await multi.acquireEditor("A")).editor.document; const b = (await multi.acquireEditor("B")).editor.document;
  const block = a.blocks.insertBlock({ id: "source-block", type: "paragraph", content: "Copied card" });
  const card = a.elements.insertElement({ id: "source-card", type: "block", frame: { x: 10, y: 20, width: 100, height: 40 }, zIndex: 0, props: { startBlockId: block.id, endBlockId: block.id } });
  await panel.clipboard.paste( { bundle: { version: 4, blocks: [block], elements: [a.elements.getElementNode(card.id)!] }, placement: { mergeText: false } });
  const pasted = b.blocks.getBlocks()[0]!;
  expect(pasted.id).toBe(block.id); expect(pasted.content).toBe("Copied card");
  expect(b.elements.getElementNode("source-card")?.props).toMatchObject({ startBlockId: pasted.id, endBlockId: pasted.id });
  expect(a.elements.getElementNode(card.id)?.props).toMatchObject({ startBlockId: block.id, endBlockId: block.id });
  expect(a.blocks.getBlockNode(block.id)?.content).toBe("Copied card");
  b.history.undo(); expect(b.blocks.getRootIds()).toEqual([]); expect(b.elements.hasElement("source-card")).toBe(false);
  runtime.destroy(); await multi.destroy();
});
