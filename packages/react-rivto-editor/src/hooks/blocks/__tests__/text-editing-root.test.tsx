/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useSyncExternalStore } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { useBlockTextEditing } from "../use-block-text-editing";
import type { TextEditingFixtureProps, TextEditingScopeProps } from "../test-utils/types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Renders an editable using the public block text binding.
 *
 * @param props - Block identity, current text, and input transaction.
 * @param props.blockId - Stable document block identity.
 * @param props.content - Current document content.
 * @param props.hostKey - Optional key forcing editable host replacement.
 * @param props.runTextInput - Synchronous transaction for each input delivery.
 * @returns The single editable bound to the owning occurrence.
 */
function Editable({ blockId, content, hostKey, runTextInput }: TextEditingFixtureProps) {
  const attributes = useBlockTextEditing(blockId, content, runTextInput);
  expect(typeof attributes.ref).toBe("function");
  return <div key={hostKey} {...attributes} />;
}

/**
 * Observes occurrence replacement for a fixed mounted test surface.
 *
 * @param props - Test panel, surface, and editable content.
 * @param props.panel - Panel owning the current Root.
 * @param props.surface - Surface retained across Root replacement.
 * @param props.children - Editable rendered into the occurrence.
 * @returns A root context updated when the panel replaces its Root.
 */
function TextEditingScope({ panel, surface, children }: TextEditingScopeProps) {
  const mountedRoot = useSyncExternalStore(
    panel.subscribeAvailability,
    () => panel.mountedRoot,
    () => undefined,
  );
  return (
    <EditorRootContext.Provider
      value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot, mountedRoot }}
    >
      {children}
    </EditorRootContext.Provider>
  );
}

it("synchronizes text and batches input through the mounted Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "Before" });
  const surface = document.createElement("div");
  document.body.append(surface);
  panel.setRoot(surface);
  const renderer = createRoot(surface);
  const runTextInput = jestApi.fn((apply: () => void) => apply());
  try {
    flushSync(() =>
      renderer.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <Editable blockId={block.id} content="Before" runTextInput={runTextInput} />
          </EditorRootContext.Provider>
        </TestPanel>,
      ),
    );
    const editable = surface.querySelector<HTMLElement>("[data-block-content]")!;
    expect(editable.textContent).toBe("Before");
    editable.textContent = "Edited";
    flushSync(() => editable.dispatchEvent(new Event("input", { bubbles: true })));
    expect(runTextInput).toHaveBeenCalledTimes(1);
    expect(core.blocks.getBlockNode(block.id)?.content).toBe("Edited");
    panel.setRoot(null);
    editable.textContent = "Stale";
    flushSync(() => editable.dispatchEvent(new Event("input", { bubbles: true })));
    expect(core.blocks.getBlockNode(block.id)?.content).toBe("Edited");
    expect(runTextInput).toHaveBeenCalledTimes(1);
  } finally {
    flushSync(() => renderer.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it.each([true, false])(
  "rebinds text input after same-surface Root replacement while enabled=%s",
  async (enabled) => {
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const block = core.blocks.insertBlock({ type: "paragraph", content: "Before" });
    const surface = document.createElement("div");
    document.body.append(surface);
    panel.setRoot(surface);
    const renderer = createRoot(surface);
    const runTextInput = jestApi.fn((apply: () => void) => apply());
    try {
      flushSync(() =>
        renderer.render(
          <TestPanel panel={panel}>
            <TextEditingScope panel={panel} surface={surface}>
              <Editable blockId={block.id} content="Before" runTextInput={runTextInput} />
            </TextEditingScope>
          </TestPanel>,
        ),
      );
      const editable = surface.querySelector<HTMLElement>("[data-block-content]")!;
      flushSync(() => panel.setEnabled(enabled));
      const previous = panel.mountedRoot;
      flushSync(() => {
        panel.setRoot(null);
        panel.setRoot(surface);
      });
      expect(panel.mountedRoot).not.toBe(previous);
      editable.textContent = "After remount";
      flushSync(() => editable.dispatchEvent(new Event("input", { bubbles: true })));
      expect(core.blocks.getBlockNode(block.id)?.content).toBe("After remount");
    } finally {
      flushSync(() => renderer.unmount());
      panel.editor.destroy();
      await core.destroy();
      surface.remove();
    }
  },
);

it("synchronizes an already mounted editable when its Root becomes available", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "Before" });
  const surface = document.createElement("div");
  document.body.append(surface);
  const renderer = createRoot(surface);
  const runTextInput = jestApi.fn((apply: () => void) => apply());
  try {
    flushSync(() =>
      renderer.render(
        <TestPanel panel={panel}>
          <TextEditingScope panel={panel} surface={surface}>
            <Editable blockId={block.id} content="Before" runTextInput={runTextInput} />
          </TextEditingScope>
        </TestPanel>,
      ),
    );
    const editable = surface.querySelector<HTMLElement>("[data-block-content]")!;
    expect(editable.textContent).toBe("");
    flushSync(() => panel.setRoot(surface));
    expect(editable.textContent).toBe("Before");
  } finally {
    flushSync(() => renderer.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("rebinds when React replaces the editable within the same Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "Before" });
  const surface = document.createElement("div");
  document.body.append(surface);
  panel.setRoot(surface);
  const renderer = createRoot(surface);
  const runTextInput = jestApi.fn((apply: () => void) => apply());
  try {
    for (const hostKey of ["first", "second"]) {
      flushSync(() =>
        renderer.render(
          <TestPanel panel={panel}>
            <TextEditingScope panel={panel} surface={surface}>
              <Editable
                blockId={block.id}
                content="Before"
                hostKey={hostKey}
                runTextInput={runTextInput}
              />
            </TextEditingScope>
          </TestPanel>,
        ),
      );
      expect(surface.querySelector("[data-block-content]")?.textContent).toBe("Before");
    }
    const editable = surface.querySelector<HTMLElement>("[data-block-content]")!;
    editable.textContent = "Edited";
    flushSync(() => editable.dispatchEvent(new Event("input", { bubbles: true })));
    expect(core.blocks.getBlockNode(block.id)?.content).toBe("Edited");
  } finally {
    flushSync(() => renderer.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});
