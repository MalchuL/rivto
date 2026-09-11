/** Element paste recreates visual-only clipboard bundles in edgeless mode. */
import { createReactEditor } from "../../react-editor";
import { createTestCoreEditor } from "../../test-utils";
import { findEdgelessRuntime, installEdgelessRuntime } from "../edgeless/edgeless-runtime";
import { ElementPasteStrategy } from "./element-paste-strategy";

describe("ElementPasteStrategy", () => {
  it("clones selected visual elements with fresh IDs and offset geometry", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    editor.document.elements.generateId = () => "generated-element";
    editor.elements.insertElement({
      id: "source",
      type: "text",
      frame: { x: 10, y: 20, width: 100, height: 40 },
      zIndex: 2,
      props: { text: "Copied" },
    });
    const reactEditor = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(reactEditor);
    const created = new ElementPasteStrategy(reactEditor).paste({
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
    expect(elementIds).toEqual(["generated-element"]);
    expect([...(created?.elementIdMap ?? [])]).toEqual([["source", "generated-element"]]);
    expect(editor.elements.getElement(elementIds![0]!)).toMatchObject({
      type: "text",
      frame: { x: 34, y: 44, width: 100, height: 40 },
      props: { text: "Copied" },
    });
    expect(findEdgelessRuntime(reactEditor)?.get().items).toEqual([]);
    uninstall();
    reactEditor.destroy();
    editor.destroy();
  });

  it("restores a cut element's ID when it is free", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    const source = {
      id: "cut-element",
      type: "text",
      frame: { x: 10, y: 20, width: 100, height: 40 },
      zIndex: 2,
      props: { text: "Cut" },
    };
    editor.elements.insertElement(source);
    editor.elements.removeElement(source.id);
    const reactEditor = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(reactEditor);

    const created = new ElementPasteStrategy(reactEditor).paste({
      bundle: { version: 4, blocks: [], elements: [source], selectedElementIds: [source.id] },
      selection: undefined,
    }, {});

    expect(created?.proposedSelection.elements).toEqual([source.id]);
    expect([...(created?.elementIdMap ?? [])]).toEqual([[source.id, source.id]]);
    expect(editor.elements.getElement(source.id)?.props).toEqual({ text: "Cut" });
    uninstall();
    reactEditor.destroy();
    editor.destroy();
  });

  it("uses the block import map without reading block selection order", () => {
    const editor = createTestCoreEditor({ mode: "edgeless" });
    const destinationId = editor.blocks.insertBlock({ type: "paragraph", content: "Pasted" });
    const reactEditor = createReactEditor({ editor });
    const uninstall = installEdgelessRuntime(reactEditor);

    const created = new ElementPasteStrategy(reactEditor).paste({
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

    const elementId = created?.proposedSelection.elements?.[0]!;
    expect(editor.elements.getElement(elementId)?.props).toMatchObject({
      startBlockId: destinationId,
      endBlockId: destinationId,
    });
    uninstall();
    reactEditor.destroy();
    editor.destroy();
  });
});
