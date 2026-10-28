import {
  BlockEditor,
  BlockChildren,
  BlockContent,
  type BlockRendererProps,
} from "@chulane/rivto-page";
import { renderToStaticMarkup } from "react-dom/server";
import { useBlockNode } from "../../hooks/blocks/use-block";
import { useBlockChildrenId } from "../../hooks/blocks/use-block-children-id";
import type { BlockSlotProps } from "../../managers/surfaces/types";
import type { BlockWrapperProps } from "../../blocks/block-wrapper/block-wrapper";
import { kanbanExtension, createKanbanBlockInput } from "../../extensions/containers/kanban/kanban";
import { registerCollapse } from "../../extensions/built-ins/page/collapse/register";
import {
  columnsExtension,
  createColumnsBlockInput,
} from "../../extensions/containers/columns/columns";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../test-utils";

/**
 * Reads concrete text from the host while Page owns structural descendants.
 *
 * @param props - Persisted block identity supplied by Page.
 * @returns Text from the addressed host snapshot, including empty text.
 */
function TextContent({ blockId }: BlockRendererProps) {
  const { block } = useBlockNode(blockId);
  return <span>{block?.content}</span>;
}

/**
 * Exercises host-controlled child placement through Page primitives.
 *
 * @returns Children before content, each rendered once by the Page context.
 */
function ChildrenFirst() {
  return (
    <section data-layout="children-first">
      <BlockChildren />
      <BlockContent />
    </section>
  );
}

/**
 * Reads the occurrence's actual child container identity from a host slot.
 *
 * @param props - Host block metadata supplied by the translated slot.
 * @returns A control linked to the Page-owned child region.
 */
function ChildRegionControl({ block }: BlockSlotProps) {
  const childrenId = useBlockChildrenId(block.id);
  return <button aria-controls={childrenId}>Toggle children</button>;
}

/**
 * Exposes the concrete host content received by a translated decorator.
 *
 * @param props - Host snapshot and the already-rendered Page shell.
 * @returns A decorator retaining the supplied shell exactly once.
 */
function ContentWrapper({ block, children }: BlockWrapperProps) {
  return <section data-host-content={block.content}>{children}</section>;
}

it("retains independent duplicate wrappers and removes only the disposed registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  panel.blocks.insertBlock({ type: "paragraph", content: "Wrapped text" });
  const remove = panel.editor.surfaces.registerBlockWrapper("block", ContentWrapper);
  panel.editor.surfaces.registerBlockWrapper("block", ContentWrapper);
  const second = panel.page.wrappers.getSnapshot()[1];
  remove();
  expect(panel.page.wrappers.getSnapshot()).toEqual([second]);
  const markup = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  expect(markup.match(/data-host-content="Wrapped text"/g)).toHaveLength(1);
  expect(markup.match(/data-block-id=/g)).toHaveLength(1);
  panel.editor.destroy();
  core.destroy();
});

it("renders Kanban lanes once and retains empty Page child hosts", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [kanbanExtension()] });
  panel.blocks.insertBlock(createKanbanBlockInput());
  const markup = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  expect(markup.match(/data-block-id=/g)).toHaveLength(4);
  const childHosts = [...markup.matchAll(/class="([^"]*)"/g)].filter((match) =>
    match[1]?.split(" ").includes("rivto-block-children"),
  );
  expect(childHosts).toHaveLength(4);
  expect(markup.match(/aria-label="Kanban column title"/g)).toHaveLength(3);
  panel.editor.destroy();
  core.destroy();
});

it("renders Columns lanes through Page exactly once and preserves collapsed summaries", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core, extensions: [columnsExtension()] });
  const releaseCollapse = registerCollapse(panel.editor);
  panel.editor.renderers.register("paragraph", TextContent);
  const board = panel.blocks.insertBlock(
    createColumnsBlockInput(2, { type: "paragraph", content: "Lane text" }),
  );
  const markup = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  expect(markup.match(/data-block-id=/g)).toHaveLength(5);
  expect(markup.match(/Lane text/g)).toHaveLength(2);
  expect(markup).toContain("rivto-columns-children");
  panel.blocks.updateBlock(board.id, { listProps: { collapsed: true } });
  const collapsed = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  expect(collapsed.match(/data-block-id=/g)).toHaveLength(1);
  expect(collapsed).toContain("Columns");
  expect(collapsed).not.toContain("Lane text");
  releaseCollapse();
  panel.editor.destroy();
  core.destroy();
});

it("preserves live slot identities, priorities, mode filters and child-region links", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const parent = panel.blocks.insertBlock({ type: "paragraph" });
  const child = panel.blocks.insertBlock({ type: "paragraph" });
  panel.blocks.moveBlock(child.id, parent.id, "inside");
  const slots = panel.editor.surfaces;
  const remove = slots.registerBlockSlot({
    position: "start",
    component: ChildRegionControl,
    priority: 5,
    when: ({ block }) => block.id === parent.id,
  });
  const first = panel.page.slots.getSnapshot()[0];
  const removeSecond = slots.registerBlockSlot({
    position: "end",
    component: ChildRegionControl,
    priority: 10,
  });
  expect(panel.page.slots.getSnapshot().map((entry) => entry.priority)).toEqual([10, 5]);
  expect(panel.page.slots.getSnapshot()[1]).toBe(first);
  removeSecond();
  slots.registerBlockSlot({ position: "body", component: ChildRegionControl, mode: "edgeless" });
  expect(panel.page.slots.getSnapshot()).toEqual([first]);
  const markup = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  const controlledId = markup.match(/aria-controls="([^"]+)"/)?.[1];
  expect(controlledId).toBeDefined();
  expect(markup).toContain(`id="${controlledId}"`);
  expect(markup.match(/Toggle children/g)).toHaveLength(1);
  panel.mode.set("edgeless");
  expect(panel.page.slots.getSnapshot()).toHaveLength(2);
  panel.mode.set("block");
  expect(panel.page.slots.getSnapshot()).toHaveLength(1);
  remove();
  expect(panel.page.slots.getSnapshot()).toEqual([]);
  panel.destroy();
  slots.registerBlockSlot({ position: "body", component: ChildRegionControl });
  panel.editor.destroy();
  core.destroy();
});

it("uses live host renderers and layouts without a second recursive tree", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const parent = panel.blocks.insertBlock({ type: "paragraph", content: "Parent text" });
  const child = panel.blocks.insertBlock({ type: "paragraph", content: "Child text" });
  panel.blocks.moveBlock(child.id, parent.id, "inside");
  const release = panel.editor.renderers.register("paragraph", TextContent, ChildrenFirst);
  expect(panel.page.renderers.get("paragraph")?.content).toBe(TextContent);
  expect(panel.page.renderers.get("paragraph")?.layout).toBe(ChildrenFirst);
  const markup = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  expect(markup.match(/data-block-id=/g)).toHaveLength(2);
  expect(markup.match(/Parent text/g)).toHaveLength(1);
  expect(markup.match(/Child text/g)).toHaveLength(1);
  expect(markup.indexOf("Child text")).toBeLessThan(markup.indexOf("Parent text"));
  release();
  panel.editor.renderers.register("paragraph", TextContent);
  const next = renderToStaticMarkup(
    <TestPanel panel={panel}>
      <BlockEditor editor={panel.page} />
    </TestPanel>,
  );
  expect(next).not.toContain("children-first");
  expect(next.indexOf("Parent text")).toBeLessThan(next.indexOf("Child text"));
  panel.destroy();
  expect(() => panel.page.getNode(parent.id)).toThrow(/destroyed/);
  panel.editor.destroy();
  core.destroy();
});
