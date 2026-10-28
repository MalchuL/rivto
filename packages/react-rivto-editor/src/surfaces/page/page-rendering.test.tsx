/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockEditor } from "@chulane/rivto-page";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { useBlockNode } from "../../hooks/blocks/use-block";
import type { BlockRendererProps } from "../../managers/blocks/renderer-types";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

/**
 * Displays concrete host text using only its own addressed subscription.
 *
 * @param props - Persisted identity supplied directly by Page.
 * @returns Live text, including edits after the initial mount.
 */
function Text({ blockId }: BlockRendererProps) {
  const { block } = useBlockNode(blockId);
  return <span>{block?.content}</span>;
}

test.each([5, 2000])(
  "mounts %i blocks without per-block host registry subscriptions",
  async (count) => {
    const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const previous = environment.IS_REACT_ACT_ENVIRONMENT;
    environment.IS_REACT_ACT_ENVIRONMENT = true;
    const core = await createTestCoreEditor();
    const panel = createTestReactEditor({ editor: core });
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    try {
      panel.batchUpdates(() => {
        for (let index = 0; index < count; index += 1) {
          core.blocks.insertBlock({
            id: `text-${index}`,
            type: "paragraph",
            content: `Text ${index}`,
          });
        }
      });
      const release = panel.editor.renderers.register("paragraph", Text);
      const subscribe = jestApi.spyOn(panel.editor.renderers, "subscribe");
      act(() =>
        root.render(
          <TestPanel panel={panel}>
            <BlockEditor editor={panel.page} />
          </TestPanel>,
        ),
      );
      expect(container.querySelectorAll("[data-block-id]")).toHaveLength(count);
      expect(subscribe).not.toHaveBeenCalled();
      act(() => panel.blocks.updateBlock("text-0", { content: "Updated content" }));
      expect(container.querySelector('[data-block-id="text-0"]')?.textContent).toBe(
        "Updated content",
      );
      act(() => release());
      expect(container.querySelector('[data-block-id="text-0"]')?.textContent).not.toBe(
        "Updated content",
      );
      act(() => panel.editor.renderers.register("paragraph", Text));
      expect(container.querySelector('[data-block-id="text-0"]')?.textContent).toBe(
        "Updated content",
      );
    } finally {
      act(() => root.unmount());
      panel.editor.destroy();
      await core.destroy();
      container.remove();
      environment.IS_REACT_ACT_ENVIRONMENT = previous;
    }
  },
);
