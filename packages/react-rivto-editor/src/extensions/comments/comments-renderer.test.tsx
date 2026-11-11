/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { commentsExtension, createCommentSideBlockRenderer, createCommentThread } from "./comments";
import type { SideBlockRendererProps } from "../side-blocks/side-blocks";
import { edgelessSelectionExtension } from "../edgeless";

/**
 * Renders a replacement thread and its persisted identity for the test.
 *
 * @param props - Side-block record and operations supplied by the host view.
 * @returns A marker and a control using the supplied removal operation.
 */
function CustomComment({ block, remove }: SideBlockRendererProps) {
  return <button onClick={remove}>Custom {block.id}</button>;
}

test("uses the supplied comment component in page registration and canvas", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({
    editor: core,
    extensions: [edgelessSelectionExtension(), commentsExtension({ component: CustomComment })],
  });
  const block = core.blocks.insertBlock({ type: "paragraph" });
  const thread = createCommentThread(core.getDocument(), block.id, "block");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    expect(createCommentSideBlockRenderer({ component: CustomComment })).toBe(CustomComment);
    expect(createCommentSideBlockRenderer()).not.toBe(CustomComment);
    const Canvas = panel.editor.surfaces.getEditorWrappers("edgeless")[0]!;
    act(() =>
      root.render(
        <TestPanel panel={panel}>
          <Canvas />
        </TestPanel>,
      ),
    );
    expect(container.textContent).toContain(`Custom ${thread.id}`);
    const customButton = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes(thread.id),
    );
    expect(customButton).toBeDefined();
    act(() => customButton!.click());
    expect(container.textContent).not.toContain(`Custom ${thread.id}`);
  } finally {
    act(() => root.unmount());
    await panel.editor.destroy();
    await core.destroy();
    container.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
