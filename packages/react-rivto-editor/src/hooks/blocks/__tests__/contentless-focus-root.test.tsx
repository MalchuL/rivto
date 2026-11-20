/** @jest-environment ./jest-browser-environment.mjs */
import { createCaretSelection } from "@chulane/rivto";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { useBlockSelectionAnchor } from "../use-block-selection-anchor";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Mounts the same contentless selection hook used by block renderers.
 *
 * @param props - Block whose pending caret is being restored.
 * @param props.blockId - Stable ID selected by the pending command.
 * @returns An inert element carrying the structural selection marker.
 */
function Anchor(props: { blockId: string }) {
  const attributes = useBlockSelectionAnchor(props.blockId);
  return <div {...attributes} />;
}

it("restores contentless focus and clears selection through the originating Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const surface = document.createElement("div");
  surface.tabIndex = 0;
  surface.textContent = "selected";
  const container = document.createElement("div");
  document.body.append(surface, container);
  panel.setRoot(surface);
  core.selection.set(createCaretSelection(block.id, 0));
  const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {});
  const inputRoot = panel.inputRoot!;
  const focus = jestApi.spyOn(inputRoot, "focus");
  const clear = jestApi.spyOn(inputRoot, "clearSelection");
  const reactRoot = createRoot(container);
  try {
    const range = document.createRange();
    range.selectNodeContents(surface);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    flushSync(() =>
      reactRoot.render(
        <TestPanel panel={panel}>
          <Anchor blockId={block.id} />
        </TestPanel>,
      ),
    );
    await Promise.resolve();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(surface);
    expect(document.getSelection()?.rangeCount).toBe(0);
  } finally {
    flushSync(() => reactRoot.unmount());
    cancel();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    container.remove();
  }
});

it("does not focus a replacement occurrence for an old pending restoration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const first = document.createElement("div");
  const second = document.createElement("div");
  first.tabIndex = 0;
  second.tabIndex = 0;
  const container = document.createElement("div");
  document.body.append(first, second, container);
  panel.setRoot(first);
  core.selection.set(createCaretSelection(block.id, 0));
  const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {});
  const reactRoot = createRoot(container);
  const firstFocus = jestApi.spyOn(first, "focus");
  const secondFocus = jestApi.spyOn(second, "focus");
  try {
    flushSync(() =>
      reactRoot.render(
        <TestPanel panel={panel}>
          <Anchor blockId={block.id} />
        </TestPanel>,
      ),
    );
    panel.setRoot(second);
    await Promise.resolve();
    expect(firstFocus).not.toHaveBeenCalled();
    expect(secondFocus).not.toHaveBeenCalled();
  } finally {
    flushSync(() => reactRoot.unmount());
    cancel();
    panel.editor.destroy();
    await core.destroy();
    first.remove();
    second.remove();
    container.remove();
  }
});

it("does not clear selection after focus synchronously replaces the occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const first = document.createElement("div");
  const second = document.createElement("div");
  const container = document.createElement("div");
  document.body.append(first, second, container);
  panel.setRoot(first);
  core.selection.set(createCaretSelection(block.id, 0));
  const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {});
  const inputRoot = panel.inputRoot!;
  const clear = jestApi.spyOn(inputRoot, "clearSelection");
  jestApi.spyOn(inputRoot, "focus").mockImplementation(() => panel.setRoot(second));
  const reactRoot = createRoot(container);
  try {
    flushSync(() => {
      reactRoot.render(
        <TestPanel panel={panel}>
          <Anchor blockId={block.id} />
        </TestPanel>,
      );
    });
    await Promise.resolve();
    expect(clear).not.toHaveBeenCalled();
    expect(panel.mountedRoot?.isForElement(second)).toBe(true);
  } finally {
    flushSync(() => reactRoot.unmount());
    cancel();
    panel.editor.destroy();
    await core.destroy();
    first.remove();
    second.remove();
    container.remove();
  }
});
