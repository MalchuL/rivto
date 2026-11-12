/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../test-utils";
import { createTestViewFixture } from "../../test-view-fixture";
import { MarkdownContent } from "./markdown";
import { registerMarkdownExtension } from "./markdown-extensions";

test("updates an existing preview when an independent contribution is installed and removed", async () => {
  const fixture = await createTestViewFixture();
  const { panel, container, root } = fixture;
  const block = panel.editor.blocks.insertBlock({ type: "paragraph", content: "Hello world" });
  try {
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <MarkdownContent blockId={block.id} />
        </TestPanel>,
      );
    });
    expect(container.querySelector(".markdown-preview p")).not.toBeNull();
    let remove = () => {};
    await act(async () => {
      remove = panel.editor.extensions.install({
        id: "test.markdown",
        setup: (editor) => {
          registerMarkdownExtension(editor.extensions, {
            components: (components) => ({
              ...components,
              p: ({ children }) => (
                <p>
                  <strong>{children}</strong>
                </p>
              ),
            }),
          });
        },
      });
    });
    expect(container.querySelector(".markdown-preview p")).toBeNull();
    await act(async () => remove());
    expect(container.querySelector(".markdown-preview p")).not.toBeNull();
    expect(container.querySelector(".markdown-preview")?.textContent).toBe("Hello world");
  } finally {
    await fixture.dispose();
  }
});
