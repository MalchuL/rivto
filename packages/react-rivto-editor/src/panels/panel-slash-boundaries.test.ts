import { ChildrenPanel } from "@chulane/rivto";
import { createReactEditor } from "../editor/react-editor";
import { createTestCoreEditor } from "../test-utils";
import { registerListShortcuts } from "../extensions/built-ins/page/list/shortcuts/register";
import { registerCollapse } from "../extensions/built-ins/page/collapse/register";
import { ReactPanel } from "./react-panel";

test("list and collapse commands read current panel membership before offering or executing actions", async () => {
  const document = await createTestCoreEditor();
  document.blocks.insertBlock({
    id: "root",
    type: "paragraph",
    children: [{ id: "inside", type: "paragraph", children: [{ id: "child", type: "paragraph" }] }],
  });
  document.blocks.insertBlock({
    id: "outside",
    type: "paragraph",
    children: [{ id: "outside-child", type: "paragraph" }],
  });
  const editor = createReactEditor({
    editor: document,
    extensions: [
      { id: "list", setup: registerListShortcuts },
      { id: "collapse", setup: registerCollapse },
      {
        id: "custom",
        setup: (editor) =>
          editor.blockTypes.register({
            definition: { type: "custom" },
            render: () => null,
            slashCommand: { title: "Custom" },
          }),
      },
    ],
  });
  const reactPanel = new ReactPanel(editor, new ChildrenPanel(document, { rootBlockId: "root" }));
  try {
    const commands = (blockId: string) =>
      reactPanel.slashCommands.getAll({ blockId }).map((command) => command.id);
    expect(commands("inside")).toContain("list.checkbox");
    expect(commands("inside")).toContain("type.custom");
    expect(commands("inside")).toContain("block.collapse");
    for (const blockId of ["outside", "root", "missing"]) {
      expect(commands(blockId)).not.toContain("list.checkbox");
      expect(commands(blockId)).not.toContain("type.custom");
      expect(() => reactPanel.slashCommands.execute("type.custom", { blockId })).toThrow();
      expect(commands(blockId)).not.toContain("block.collapse");
      expect(() => reactPanel.slashCommands.execute("list.checkbox", { blockId })).toThrow();
    }
    reactPanel.slashCommands.execute("list.checkbox", { blockId: "inside" });
    expect(document.blocks.getBlockNode("inside")?.listProps.type).toBe("checkbox");
    document.blocks.moveBlock("inside", "outside", "inside");
    expect(commands("inside")).not.toContain("list.list");
    expect(() =>
      reactPanel.slashCommands.execute("block.collapse", { blockId: "inside" }),
    ).toThrow();
    expect(document.blocks.getBlockNode("inside")?.listProps.collapsed).not.toBe(true);
  } finally {
    editor.destroy();
    await document.destroy();
  }
});
