import { createTestCoreEditor as createEditor } from "../../test-utils";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  BLOCK_CONTENT_ATTRIBUTE,
  BLOCK_SELECTION_ANCHOR_ATTRIBUTE,
} from "../../constants";
import { EditorView } from "../../editor-view";
import { createReactEditor } from "../../react-editor";
import {
  useBlockEditing,
  type UseBlockEditingResult,
} from "./use-block-editing";

interface TestProps extends Record<string, unknown> {
  count: number;
  label?: string;
}

describe("useBlockEditing", () => {
  test("returns mode-specific attributes and latest validated property methods", () => {
    const editor = createEditor();
    editor.blocksRegistry.defineBlock({
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
    const blockId = editor.blocks.insertBlock({ type: "test.editing", content: "Text" });
    let structural: UseBlockEditingResult<TestProps, false> | undefined;
    let text: UseBlockEditingResult<TestProps, true> | undefined;

    const Surface = () => {
      structural = useBlockEditing<TestProps>(blockId, { textEdit: false });
      text = useBlockEditing<TestProps>(blockId);
      return createElement(
        "div",
        null,
        createElement("button", structural.attributes),
        createElement("div", text.attributes),
      );
    };
    const reactEditor = createReactEditor({ editor });
    reactEditor.surfaces.register("block", Surface);

    renderToStaticMarkup(createElement(EditorView, { editor: reactEditor }));

    expect(structural?.attributes[BLOCK_SELECTION_ANCHOR_ATTRIBUTE]).toBe("");
    expect(text?.attributes[BLOCK_SELECTION_ANCHOR_ATTRIBUTE]).toBe("");
    expect(text?.attributes[BLOCK_CONTENT_ATTRIBUTE]).toBe("");
    expect(text?.attributes.contentEditable).toBe("plaintext-only");
    expect(structural?.block?.listProps.collapsed).toBeUndefined();
    expect(structural && "getters" in structural).toBe(false);
    expect(structural && "setCollapsed" in structural.operations).toBe(false);
    structural?.operations.update({ listProps: { collapsed: true } });
    expect(editor.blocks.getBlock(blockId)?.listProps.collapsed).toBe(true);
    expect(structural?.getProps()).toEqual({ count: 1, label: "Initial" });
    expect(structural?.getProp("count")).toBe(1);

    structural?.setProps({ count: 2, label: "Patched" });
    expect(structural?.getProps()).toEqual({ count: 2, label: "Patched" });
    structural?.setProp("count", 3);
    expect(structural?.getProp("count")).toBe(3);
    structural?.setProp("label", undefined);
    expect(structural?.getProp("label")).toBeUndefined();
    expect(structural?.getProps()).toEqual({ count: 3 });
    expect(() => structural?.setProp("count", -1)).toThrow("count must be non-negative");

    editor.blocks.removeBlock(blockId);
    expect(structural?.getProps()).toBeUndefined();
    expect(structural?.getProp("count")).toBeUndefined();
    expect(() => structural?.setProp("count", 4)).toThrow(/not found/);

    reactEditor.destroy();
    editor.destroy();
  });
});
