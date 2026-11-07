/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { TestPanel } from "../../test-utils";
import { createTestViewFixture } from "../../test-view-fixture";
import {
  PAGE_BLOCK_DECORATIONS_KEY,
  type PageBlockDecorationAdapter,
} from "../../blocks/page-block-decorations";
import { useBlockNode } from "./use-block";
import { useBlockCollapsed } from "./use-block-collapsed";

/**
 * Displays the shared collapse presentation for the fixture block.
 *
 * @param props - Addressed block identity.
 * @param props.blockId - Stable ID whose current state is observed.
 * @returns A marker containing the resolved collapse state.
 */
function CollapseMarker({ blockId }: { readonly blockId: string }) {
  const { block } = useBlockNode(blockId);
  const collapsed = useBlockCollapsed(block);
  return <span>{collapsed ? "collapsed" : "expanded"}</span>;
}

test("updates mounted collapse presentation when the shared adapter changes", async () => {
  const fixture = await createTestViewFixture();
  const { panel, container, root } = fixture;
  const node = panel.editor.blocks.insertBlock({ type: "paragraph", content: "A" });
  const value = panel.editor.extensions.shared.getValue<PageBlockDecorationAdapter>(
    PAGE_BLOCK_DECORATIONS_KEY,
  )!;
  const original = value.get()!;
  try {
    await act(async () => {
      root.render(
        <TestPanel panel={panel}>
          <CollapseMarker blockId={node.id} />
        </TestPanel>,
      );
    });
    expect(container.textContent).toBe("expanded");
    await act(async () => {
      value.set({
        read: (block) => ({ ...original.read(block), collapsed: true }),
        prepare: (patch) => original.prepare(patch),
      });
    });
    expect(container.textContent).toBe("collapsed");
    await act(async () => value.set(original));
    expect(container.textContent).toBe("expanded");
  } finally {
    await fixture.dispose();
  }
});
