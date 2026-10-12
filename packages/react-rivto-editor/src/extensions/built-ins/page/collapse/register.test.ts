import { ChildrenPanel } from "../../../../panels/children-panel";
import { YjsDocumentRegistry } from "@chulane/crdt-doc";
import { DocumentStorage } from "@chulane/document-model";
import { createCaretSelection } from "@chulane/rivto";
import { createTestMultiEditor } from "../../../../test-utils";
import { registerCollapse } from "./register";

test.each([
  ["block", 10], ["block", 2000], ["edgeless", 10], ["edgeless", 2000],
] as const)("%s selection repair ignores other documents with %i blocks", async (mode, count) => {
  const storage = new DocumentStorage({ registry: new YjsDocumentRegistry(crypto.randomUUID()) });
  const blocks = [
    { id: "parent", type: "paragraph", children: [{ id: "child", type: "paragraph", content: "Child" }] },
    ...Array.from({ length: count }, (_, index) => ({ id: `extra-${index}`, type: "paragraph", content: "Extra" })),
  ];
  const first = await storage.create("A", blocks);
  const second = await storage.create("B", blocks);
  const core = await createTestMultiEditor([first, second], storage, { extensions: [{ id: "collapse", setup: registerCollapse }] });
  const a = core.getEditor(first.id)!;
  const panel = new ChildrenPanel(a);
  panel.mode.set(mode);
  const b = core.getEditor(second.id)!;
  await Promise.resolve(); // Finish initial block-element projection before measuring commands.
  const reads = { first: 0, second: 0 };
  const readA = first.blocks.getBlocks.bind(first.blocks);
  const readB = second.blocks.getBlocks.bind(second.blocks);
  first.blocks.getBlocks = () => { reads.first += 1; return readA(); };
  second.blocks.getBlocks = () => { reads.second += 1; return readB(); };
  const changes: string[] = [];
  const stops = core.getEditors().map((editor) => editor.document.subscribe(() => changes.push(editor.document.getDocument().id)));
  const unsubscribe = () => stops.forEach((stop) => stop());

  b.document.blocks.updateBlock("child", { content: "Edited without selection" });
  expect(second.blocks.getBlockNode("child")?.content).toBe("Edited without selection");
  expect(reads.first).toBe(0);
  expect(reads.second).toBe(0);

  a.document.selection.set(createCaretSelection("child", 2));
  reads.first = 0; reads.second = 0;
  b.document.blocks.updateBlock("parent", { listProps: { collapsed: true } });
  expect(second.blocks.getBlockNode("parent")?.listProps.collapsed).toBe(true);
  expect(a.document.selection.get()?.focusBlockId).toBe("child");
  expect(b.document.selection.get()).toBeUndefined();
  expect(reads.first).toBe(0);
  expect(reads.second).toBe(0);

  a.document.blocks.updateBlock("parent", { listProps: { collapsed: true } });
  expect(a.document.selection.get()?.focusBlockId).toBe("parent");
  // Only selected blocks and their ancestors are needed, regardless of document size.
  expect(reads.first).toBe(0);
  expect(reads.second).toBe(0);
  expect(changes).toEqual(["B", "B", "A"]);
  expect(core.getDocument("A")).toBe(first);

  unsubscribe(); await core.destroy();
  await storage.destroy();
});
