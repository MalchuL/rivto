/**
 * Generic view fallback and dispatcher wiring for unregistered block types.
 *
 * @module
 */
import { createTestCoreEditor } from "../test-utils";
import { createReactEditor } from "../react-editor";
import { defaultWritingBlockExtension } from "../extensions/page/default-writing-block";
import { BaseBlockView } from "./base-view";
import type { BlockViewDropContext } from "./types";

class RejectingBlockView extends BaseBlockView {
  /**
   * Rejects every drop so the registry path can be checked.
   *
   * @param _context - Unused candidate destination.
   * @returns Always `false`.
   */
  override acceptsDrop(_context: BlockViewDropContext): boolean {
    return false;
  }
}

test("resolve falls back to BaseBlockView and indent stays free at the root", () => {
  const editor = createTestCoreEditor();
  const runtime = createReactEditor({
    editor,
    extensions: [defaultWritingBlockExtension()],
  });
  const first = editor.blocks.insertBlock({ type: "paragraph", content: "First" });
  const second = editor.blocks.insertBlock({ type: "paragraph", content: "Second" }, first);
  expect(runtime.views.resolve(second)).toBeInstanceOf(BaseBlockView);
  expect(runtime.views.has("paragraph")).toBe(false);
  editor.blocks.indentBlock(second);
  expect(editor.blocks.getParentId(second)).toBe(first);
  editor.blocks.outdentBlock(second);
  expect(editor.blocks.getParentId(second)).toBeNull();
  runtime.destroy();
  editor.destroy();
});

test("asks the resolved view whether a drop is accepted", () => {
  const editor = createTestCoreEditor();
  const rejectingView = new RejectingBlockView();
  const runtime = createReactEditor({
    editor,
    extensions: [
      defaultWritingBlockExtension(),
      {
        id: "test.reject-drop",
        setup: (reactEditor) => reactEditor.views.register("paragraph", rejectingView),
      },
    ],
  });
  const targetId = editor.blocks.insertBlock({ type: "paragraph" });

  expect(runtime.views.acceptsDrop(targetId, ["source"])).toBe(false);

  runtime.destroy();
  editor.destroy();
});
