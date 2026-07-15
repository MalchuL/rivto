import { createDefaultBlockRendererRegistry } from "../../react/blocks/default-renderers";
import { createRivtoEditor } from "../../../editor";
import type { FunctionComponent, ReactElement } from "react";
import type { BlockRenderProps } from "../../react/blocks/types";
import { BlockShell } from "../../react/blocks/block-shell";

describe("default block renderers", () => {
  it("registers built-in block renderers for both surfaces", () => {
    const registry = createDefaultBlockRendererRegistry();

    expect(registry.get("paragraph", "block")).toBeDefined();
    expect(registry.get("paragraph", "edgeless")).toBeDefined();
    expect(registry.get("bulletListItem", "block")).toBeDefined();
    expect(registry.get("checkListItem", "edgeless")).toBeDefined();
  });

  it("keeps default renderers content-only", () => {
    const editor = createRivtoEditor();
    const registry = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Text" });
    const block = editor.getBlock(id)!;
    const component = registry.get("paragraph", "block")!.component as FunctionComponent<BlockRenderProps>;
    const element = component({ block, editor, surface: "block" }) as ReactElement<{ "data-rivto-block-id"?: string }>;

    expect(element.props["data-rivto-block-id"]).toBeUndefined();
    editor.destroy();
  });

  it("selects a block from the generic shell", () => {
    const editor = createRivtoEditor();
    const renderers = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Text" });
    const block = editor.getBlock(id)!;
    const element = BlockShell({
      block,
      editor,
      surface: "block",
      renderProps: { editor, renderers },
      selected: false,
    }) as ReactElement<{
      onClick(event: { target: null; stopPropagation(): void; defaultPrevented: boolean }): void;
      "data-rivto-selected"?: string;
    }>;
    const event = { target: null, stopPropagation: jest.fn(), defaultPrevented: false };

    element.props.onClick(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(editor.selection.get()).toEqual({
      type: "block",
      blockIds: [id],
      anchorBlockId: id,
      focusBlockId: id,
    });
    expect(element.props["data-rivto-selected"]).toBeUndefined();
    editor.destroy();
  });

  it("updates editable block content on input", () => {
    const editor = createRivtoEditor();
    const registry = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Before" });
    const block = editor.getBlock(id)!;
    const component = registry.get("paragraph", "block")!.component as FunctionComponent<BlockRenderProps>;
    const element = component({ block, editor, surface: "block" }) as ReactElement<{
      children?: string;
      onFocus(): void;
      onBlur(): void;
      onInput(event: { currentTarget: { textContent: string } }): void;
    }>;
    const contentElement = element;

    expect(contentElement.props.children).toBeUndefined();

    contentElement.props.onInput({ currentTarget: { textContent: "After" } });

    expect(editor.getBlock(id)?.content).toBe("After");
    editor.destroy();
  });

  it("creates history boundaries around editable focus", () => {
    const editor = createRivtoEditor();
    const registry = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });
    const block = editor.getBlock(id)!;
    const stopCapturing = jest.spyOn(editor.history, "stopCapturing");
    const component = registry.get("paragraph", "block")!.component as FunctionComponent<BlockRenderProps>;
    const element = component({ block, editor, surface: "block" }) as ReactElement<{
      onFocus(): void;
      onBlur(): void;
    }>;
    const contentElement = element;

    contentElement.props.onFocus();
    editor.updateBlock(id, { content: "Changed" });
    contentElement.props.onBlur();

    expect(stopCapturing).toHaveBeenCalledTimes(2);
    expect(editor.getBlock(id)?.content).toBe("Changed");
    editor.destroy();
  });

  it("undoes edits from another surface after mode switch", () => {
    const editor = createRivtoEditor();
    const registry = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Initial" });
    const render = (surface: "block" | "edgeless") => {
      const block = editor.getBlock(id)!;
      const component = registry.get("paragraph", surface)!.component as FunctionComponent<BlockRenderProps>;
      return component({ block, editor, surface }) as ReactElement<{
        onFocus(): void;
        onBlur(): void;
        onInput(event: { currentTarget: { textContent: string } }): void;
      }>;
    };

    const blockContent = render("block");
    blockContent.props.onFocus();
    blockContent.props.onInput({ currentTarget: { textContent: "Block edit" } });
    blockContent.props.onBlur();

    editor.mode.set("edgeless");

    const edgelessContent = render("edgeless");
    edgelessContent.props.onFocus();
    edgelessContent.props.onInput({ currentTarget: { textContent: "Edgeless edit" } });
    edgelessContent.props.onBlur();

    editor.undo();
    expect(editor.getBlock(id)?.content).toBe("Block edit");

    editor.mode.set("block");
    editor.undo();
    expect(editor.getBlock(id)?.content).toBe("Initial");
    editor.destroy();
  });
});
