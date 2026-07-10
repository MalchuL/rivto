import { createDefaultBlockRendererRegistry } from "../default-renderers";
import { createRivtoEditor } from "../../../editor";
import type { FunctionComponent, ReactElement } from "react";
import type { BlockRenderProps } from "../types";

describe("default block renderers", () => {
  it("registers built-in block renderers for both surfaces", () => {
    const registry = createDefaultBlockRendererRegistry();

    expect(registry.get("paragraph", "block")).toBeDefined();
    expect(registry.get("paragraph", "edgeless")).toBeDefined();
    expect(registry.get("bulletListItem", "block")).toBeDefined();
    expect(registry.get("checkListItem", "edgeless")).toBeDefined();
  });

  it("selects a block when its default renderer is clicked", () => {
    const editor = createRivtoEditor();
    const registry = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Text" });
    const block = editor.getBlock(id)!;
    const component = registry.get("paragraph", "block")!.component as FunctionComponent<BlockRenderProps>;
    const element = component({ block, editor, surface: "block" }) as ReactElement<{
      onClick(event: { stopPropagation(): void }): void;
    }>;
    const event = { stopPropagation: jest.fn() };

    element.props.onClick(event);

    expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    expect(editor.selection.get()).toEqual({
      type: "block",
      blockIds: [id],
      anchorBlockId: id,
      focusBlockId: id,
    });
    editor.destroy();
  });

  it("updates editable block content on input", () => {
    const editor = createRivtoEditor();
    const registry = createDefaultBlockRendererRegistry();
    const id = editor.insertBlock({ type: "paragraph", content: "Before" });
    const block = editor.getBlock(id)!;
    const component = registry.get("paragraph", "block")!.component as FunctionComponent<BlockRenderProps>;
    const element = component({ block, editor, surface: "block" }) as ReactElement<{
      children: Array<ReactElement<{
        children?: string;
        onFocus(): void;
        onBlur(): void;
        onInput(event: { currentTarget: { textContent: string } }): void;
        onKeyDown(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; preventDefault(): void }): void;
      }>>;
    }>;
    const contentElement = element.props.children[0]!;

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
      children: Array<ReactElement<{
        onFocus(): void;
        onBlur(): void;
        onKeyDown(event: { key: string; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean; preventDefault(): void }): void;
      }>>;
    }>;
    const event = { key: "z", ctrlKey: true, preventDefault: jest.fn() };
    const contentElement = element.props.children[0]!;

    contentElement.props.onFocus();
    editor.updateBlock(id, { content: "Changed" });
    contentElement.props.onBlur();
    contentElement.props.onKeyDown(event);

    expect(stopCapturing).toHaveBeenCalledTimes(2);
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(editor.getBlock(id)?.content).toBe("Initial");
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
        children: Array<ReactElement<{
          onFocus(): void;
          onBlur(): void;
          onInput(event: { currentTarget: { textContent: string } }): void;
        }>>;
      }>;
    };

    const blockContent = render("block").props.children[0]!;
    blockContent.props.onFocus();
    blockContent.props.onInput({ currentTarget: { textContent: "Block edit" } });
    blockContent.props.onBlur();

    editor.mode.set("edgeless");

    const edgelessContent = render("edgeless").props.children[0]!;
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
