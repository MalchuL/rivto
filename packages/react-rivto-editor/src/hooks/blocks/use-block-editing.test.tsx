import { createTestReactEditor as createReactEditor } from "../../test-utils";
import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
} from "../../constants";
import { useBlockNode, type UseBlockNodeResult } from "./use-block";
import { useBlockSelectionAnchor } from "./use-block-selection-anchor";
import { EditorView } from "../../editor-view";

import {
  useBlockEditing,
  type UseBlockEditingResult,
} from "./use-block-editing";

interface TestProps extends Record<string, unknown> {
  count: number;
  label?: string;
}

describe("useBlockEditing", () => {
  test("composes text editing and structural anchors with validated property commands", async () => {
    const editor = await createEditor();
    editor.blockRegistry.defineBlock({
      type: "test.editing",
      defaultProps: { count: 1, label: "Initial" },
      propSchema: {
        parse(value: unknown) {
          const props = value as TestProps;
          if (!Number.isInteger(props.count) || props.count < 0) throw new Error("count must be non-negative");
          if (props.label !== undefined && typeof props.label !== "string") {
            throw new Error("label must be a string");
          }
          return props;
        },
      } as never,
    });
    const blockId = editor.blocks.insertBlock({ type: "test.editing", content: "Text" }).id;
    let structural: UseBlockNodeResult<TestProps> | undefined;
    let text: UseBlockEditingResult<TestProps> | undefined;

    const Surface = () => {
      structural = useBlockNode<TestProps>(blockId);
      const attributes = useBlockSelectionAnchor(blockId);
      expect(attributes[BLOCK_SELECTION_ANCHOR_ATTRIBUTE]).toBe("");
      expect("contentEditable" in attributes).toBe(false);
      text = useBlockEditing<TestProps>(blockId);
      return createElement(
        "div",
        null,
        createElement("button", attributes),
        createElement("div", text.attributes),
      );
    };
    const editorView = createReactEditor({ editor });
    editorView.surfaces.register("block", Surface);

    renderToStaticMarkup(createElement(EditorView, { runtime: editorView.runtime }, createElement(Surface)));

    expect(text?.attributes[BLOCK_SELECTION_ANCHOR_ATTRIBUTE]).toBe("");
    expect(text?.attributes[BLOCK_CONTENT_ATTRIBUTE]).toBe("");
    expect(text?.attributes.contentEditable).toBe("plaintext-only");
    expect(structural?.block?.listProps.collapsed).toBeUndefined();
    expect(structural && "getters" in structural).toBe(false);
    expect(structural && "setCollapsed" in structural.operations).toBe(false);
    structural?.operations.update({ listProps: { collapsed: true } });
    expect(editor.blocks.getBlockNode(blockId)?.listProps.collapsed).toBe(true);
    expect(editor.blocks.getBlockNode(blockId)?.props).toEqual({ count: 1, label: "Initial" });
    expect(editor.blocks.getBlockNode(blockId)?.props.count).toBe(1);

    expect(editor.blocks.getBlockNode(blockId)?.content).toBe("Text");
    editor.blocks.updateBlock(blockId, { content: "Updated without rerendering" });
    expect(text?.block?.content).toBe("Text");
    expect(editor.blocks.getBlockNode(blockId)?.content).toBe("Updated without rerendering");
    text?.operations.setContent("");
    expect(editor.blocks.getBlockNode(blockId)?.content).toBe("");

    structural?.operations.setProps({ count: 2, label: "Patched" });
    expect(editor.blocks.getBlockNode(blockId)?.props).toEqual({ count: 2, label: "Patched" });
    structural?.operations.setProp("count", 3);
    expect(editor.blocks.getBlockNode(blockId)?.props.count).toBe(3);
    structural?.operations.setProp("label", undefined);
    expect(editor.blocks.getBlockNode(blockId)?.props.label).toBeUndefined();
    expect(editor.blocks.getBlockNode(blockId)?.props).toEqual({ count: 3 });
    expect(() => structural?.operations.setProp("count", -1)).toThrow("count must be non-negative");
    expect(editor.blocks.getBlockNode(blockId)?.props.count).toBe(3);

    editor.blocks.removeBlock(blockId);
    expect(editor.blocks.getBlockNode(blockId)?.content).toBeUndefined();
    expect(editor.blocks.getBlockNode(blockId)?.props).toBeUndefined();
    expect(editor.blocks.getBlockNode(blockId)?.props.count).toBeUndefined();
    expect(() => structural?.operations.setProp("count", 4)).toThrow(/not found/);

    editorView.destroy();
    editor.destroy();
  });
});
