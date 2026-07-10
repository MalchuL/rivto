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
});
