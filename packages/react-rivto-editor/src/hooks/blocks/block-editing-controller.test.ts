import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { BlockEditingController } from "./block-editing-controller";

test("composition keeps DOM ownership and commits the final text through bound operations", async () => {
  const core = await createTestCoreEditor();
  const editor = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "Before" });
  const controller = new BlockEditingController((content) => {
    editor.runtime.blocks.updateBlock(block.id, { content });
  });
  const element = { textContent: "", ownerDocument: { getSelection: () => null } } as unknown as HTMLDivElement;
  controller.elementRef.current = element;
  controller.synchronize("Before");
  expect(element.textContent).toBe("Before");
  controller.onCompositionStart();
  element.textContent = "入力";
  controller.synchronize("Remote");
  controller.onInput({ currentTarget: element } as Parameters<typeof controller.onInput>[0]);
  expect(element.textContent).toBe("入力");
  expect(editor.runtime.blocks.getBlockNode(block.id)?.content).toBe("Before");
  controller.onCompositionEnd({ currentTarget: element } as Parameters<typeof controller.onCompositionEnd>[0]);
  expect(editor.runtime.blocks.getBlockNode(block.id)?.content).toBe("入力");
  controller.synchronize("After");
  expect(element.textContent).toBe("After");
  editor.runtime.destroy();
  core.destroy();
});
