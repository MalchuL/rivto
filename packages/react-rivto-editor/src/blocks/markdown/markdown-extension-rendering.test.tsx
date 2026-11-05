/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../test-utils";
import { createTestViewFixture } from "../../test-view-fixture";
import { MarkdownContent } from "./markdown";

test("installed Markdown contributions update existing plain-text previews and clean up", async () => {
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
    let remove: () => void = () => {};
    await act(async () => {
      remove = panel.editor.extensions.install({
        id: "test.markdown",
        setup: (editor) => {
          editor.markdown.register({
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
