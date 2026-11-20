/** @jest-environment ./jest-browser-environment.mjs */
import { createCaretSelection } from "@chulane/rivto";
import { useCallback, useRef } from "react";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import type { RegionIdentity } from "@chulane/rivto-root";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { useRestoreBlockFocus } from "../use-block-selection-anchor";
import type { ForeignFocusFixtureProps, RestoreFocusFixtureProps } from "../test-utils/types";

/**
 * Mounts one editable using the same deferred caret restoration as a block renderer.
 *
 * @param props - Block ID selected by the pending command.
 * @param props.blockId - Stable identity of the focused block.
 * @returns A focusable editable containing the fixture text.
 */
function Editable({ blockId }: RestoreFocusFixtureProps) {
  const identity = useRef<RegionIdentity | undefined>(undefined);
  const ref = useCallback((element: HTMLDivElement | null) => {
    identity.current = element ? getBrowserElementIdentity(element) : undefined;
  }, []);
  useRestoreBlockFocus(blockId, identity);
  return (
    <div data-block-content="" ref={ref} contentEditable suppressContentEditableWarning>
      text
    </div>
  );
}

/**
 * Exercises restoration with a ref retained from a different occurrence.
 *
 * @param props - Block identity and stale editable reference.
 * @param props.blockId - Stable ID selected by the pending command.
 * @param props.element - Editable that does not belong to this panel.
 * @returns No visible content; restoration borrows the supplied element identity.
 */
function ForeignEditable({ blockId, element }: ForeignFocusFixtureProps) {
  const identity = useRef(getBrowserElementIdentity(element));
  useRestoreBlockFocus(blockId, identity);
  return null;
}

it("restores the pending caret in the editable that mounted", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const surface = document.createElement("div");
  document.body.append(surface);
  panel.setRoot(surface);
  core.selection.set(createCaretSelection(block.id, 2));
  const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {});
  const renderer = createRoot(surface);
  try {
    flushSync(() =>
      renderer.render(
        <TestPanel panel={panel}>
          <Editable blockId={block.id} />
        </TestPanel>,
      ),
    );
    await Promise.resolve();
    const editable = surface.querySelector("[data-block-content]");
    expect(document.activeElement).toBe(editable);
    expect(document.getSelection()?.focusNode?.textContent).toBe("text");
    expect(document.getSelection()?.focusOffset).toBe(2);
  } finally {
    flushSync(() => renderer.unmount());
    cancel();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("does not restore a caret in a different host focused during the request", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const surface = document.createElement("div");
  document.body.append(surface);
  panel.setRoot(surface);
  core.selection.set(createCaretSelection(block.id, 2));
  const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {});
  const renderer = createRoot(surface);
  try {
    flushSync(() =>
      renderer.render(
        <TestPanel panel={panel}>
          <Editable blockId={block.id} />
        </TestPanel>,
      ),
    );
    const editable = surface.querySelector<HTMLElement>("[data-block-content]")!;
    const other = document.createElement("div");
    other.setAttribute("data-block-content", "");
    other.contentEditable = "true";
    other.tabIndex = 0;
    surface.append(other);
    const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
    const focus = jestApi.spyOn(editable, "focus").mockImplementation(() => other.focus());
    const restore = jestApi.spyOn(document.getSelection()!, "setBaseAndExtent");
    try {
      await Promise.resolve();
      expect(document.activeElement).toBe(other);
      expect(restore).not.toHaveBeenCalled();
    } finally {
      focus.mockRestore();
      restore.mockRestore();
      other.remove();
    }
  } finally {
    flushSync(() => renderer.unmount());
    cancel();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("does not focus an editable belonging to a different occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const surface = document.createElement("div");
  const foreign = document.createElement("div");
  foreign.tabIndex = 0;
  foreign.setAttribute("data-block-content", "");
  document.body.append(surface, foreign);
  panel.setRoot(surface);
  core.selection.set(createCaretSelection(block.id, 2));
  const cancel = panel.selection.scheduleIfSelectionUnchanged(() => {});
  const renderer = createRoot(surface);
  const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
  const focus = jestApi.spyOn(foreign, "focus");
  try {
    flushSync(() =>
      renderer.render(
        <TestPanel panel={panel}>
          <ForeignEditable blockId={block.id} element={foreign} />
        </TestPanel>,
      ),
    );
    await Promise.resolve();
    expect(focus).not.toHaveBeenCalled();
  } finally {
    focus.mockRestore();
    flushSync(() => renderer.unmount());
    cancel();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    foreign.remove();
  }
});
