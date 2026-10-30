import { renderToStaticMarkup } from "react-dom/server";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../test-utils";
import { BlockHandle, BlockHandleContext } from "./block-handle";

test("an independent collapsed handle renders host artwork without drag installation", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const inserted = core.blocks.insertBlock({ type: "paragraph", content: "Independent" });
  const block = { ...core.blocks.getBlockNode(inserted.id)!, listProps: { collapsed: true } };
  const markup = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockHandleContext.Provider
        value={{
          /**
           * Exposes the host icon inputs in server-rendered markup for assertions.
           *
           * @param current - Block snapshot passed to the custom renderer.
           * @param collapsed - Collapse state derived by the handle.
           * @returns Text identifying the block and its collapse state.
           */
          renderIcon: (current, collapsed) => (
            <span>
              {current.id}:{String(collapsed)}
            </span>
          ),
        }}
      >
        <BlockHandle block={block} mode="block" selected={false} />
      </BlockHandleContext.Provider>
    </TestPanel>,
  );
  expect(markup).toContain(`${block.id}:true`);
  expect(markup).toContain('data-collapsed="true"');
  expect(markup).not.toContain("data-draggable");
  expect(markup).not.toContain('role="menu"');
  panel.editor.destroy();
  await core.destroy();
});
