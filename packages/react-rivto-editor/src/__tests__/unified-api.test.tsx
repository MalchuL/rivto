import { TestPanel } from "../test-utils";
const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
import { renderToStaticMarkup } from "react-dom/server";
import { ChildrenPanel, EmbeddingPanel, createStructuralSelection, type DocumentEditorAPI, type PanelAPI } from "@chulane/rivto";
import { EditorPanel } from "../components/editor-panel/editor-panel";
import { createReactEditor } from "../editor/react-editor";
import { usePanel } from "../hooks/editor/use-panel";
import { useReactPanel } from "../hooks/editor/use-react-panel";
import { ReactPanel } from "../panels/react-panel";
import { createTestCoreEditor } from "../test-utils";

it("shares core managers and exposes the same panel through both hooks", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  const documentApi: DocumentEditorAPI = editor;
  try {
    for (const key of ["blocks", "elements", "history", "commands", "selection", "blockRegistry", "elementRegistry"] as const) {
      expect(documentApi[key]).toBe(core[key]);
    }
    expect(editor.getDocument()).toBe(core.getDocument());
    expect(editor).not.toHaveProperty("document");
    const root = editor.blocks.insertBlock({ type: "paragraph", children: [{ type: "paragraph", content: "Child" }] });
    function Probe() {
      const panel: PanelAPI = usePanel();
      const reactPanel = useReactPanel();
      expect(panel).toBe(reactPanel);
      expect(reactPanel).not.toHaveProperty("panel");
      expect(panel.blocks.getRootIds()).toEqual([root.children[0]!.id]);
      expect(panel.blocks.hasBlock(root.id)).toBe(false);
      return null;
    }
    const acquire = jestApi.spyOn(editor, "acquirePanel");
    const markup = renderToStaticMarkup(<EditorPanel editor={editor} rootBlockId={root.id}><Probe /></EditorPanel>);
    expect(markup).toContain("Loading document…");
    expect(acquire).not.toHaveBeenCalled();
    const panel = new ReactPanel(editor, new ChildrenPanel(editor, { rootBlockId: root.id }));
    try { renderToStaticMarkup(<TestPanel panel={panel}><Probe /></TestPanel>); }
    finally { panel.destroy(); }
    await editor.destroy();
    expect(core.blocks.getBlockNode(root.id)).toBeDefined();
    core.blocks.updateBlock(root.id, { content: "Core is still usable" });
    expect(core.blocks.getBlockNode(root.id)?.content).toBe("Core is still usable");
  } finally { await editor.destroy(); await core.destroy(); }
});

it.each([2, 2000])("keeps document notifications separate from panel availability with %i outside blocks", async (count) => {
  const core = await createTestCoreEditor();
  core.blocks.insertBlock({ id: "root", type: "paragraph", children: [{ id: "child", type: "paragraph", content: "Before" }] });
  core.history.batchUpdatesWithoutHistory(() => {
    for (let i = 0; i < count; i++) core.blocks.insertBlock({ id: `outside-${i}`, type: "paragraph" });
  });
  const editor = createReactEditor({ editor: core });
  const bounded = new ChildrenPanel(editor, { rootBlockId: "root" });
  const panel = new ReactPanel(editor, bounded);
  expect("edgeless" in panel).toBe(false);
  const embed = new ReactPanel(editor, new EmbeddingPanel(editor, { rootBlockId: "root" }));
  const close = panel.destroy;
  const revisions: number[] = [];
  const panelRevisions: number[] = [];
  let availability = 0;
  const stopCore = editor.subscribe(() => revisions.push(editor.revision));
  const stopPanel = panel.subscribe(() => panelRevisions.push(editor.revision));
  const stopAvailability = panel.subscribeAvailability(() => { availability++; });
  try {
    expect(panel.blocks).toBe(bounded.blocks);
    expect(panel.elements).toBe(bounded.elements);
    expect(embed.blocks.canRemove("root")).toBe(false);
    core.history.clear();
    expect(panel.batchUpdates(() => {
      panel.blocks.updateBlock("child", { content: "After" });
      return 42;
    })).toBe(42);
    editor.history.undo();
    expect(panel.blocks.getBlockNode("child")?.content).toBe("Before");
    editor.history.redo();
    expect(panel.blocks.getBlockNode("child")?.content).toBe("After");
    editor.blocks.updateBlock("outside-0", { content: "Outside" });
    expect(panel.blocks.getBlockNode("outside-0")).toBeUndefined();
    expect(panelRevisions.length).toBeGreaterThan(0);
    expect(panelRevisions).toEqual(revisions);
    expect(availability).toBe(0);
    const observed = panelRevisions.length;
    stopPanel();
    editor.blocks.removeBlock("root");
    expect(panel.getSnapshot().status).toBe("missing");
    expect(availability).toBe(1);
    expect(panelRevisions).toHaveLength(observed);
  } finally { stopCore(); stopPanel(); stopAvailability(); close(); embed.destroy(); await editor.destroy(); await core.destroy(); }
});

it("uses the React clipboard pipeline without an explicit panel and preserves core policies on cleanup", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  core.blockListProps.register({ id: "host", defaults: { host: true } });
  editor.blockListProps.register({ id: "react", defaults: { custom: true } });
  editor.clipboard.registerBlockConverter("paragraph", { paste: () => ({ props: { converted: true } }) });
  try {
    const block = editor.blocks.insertBlock({ type: "paragraph", content: "Copied" });
    const bundle = editor.clipboard.copy(createStructuralSelection([block.id]))!;
    editor.history.clear();
    editor.clipboard.paste({ bundle, placement: { mergeText: false } });
    const pasted = editor.blocks.getBlocks().find(candidate => candidate.id !== block.id)!;
    expect(pasted.content).toBe("Copied");
    expect(pasted.props.converted).toBe(true);
    editor.history.undo();
    expect(editor.blocks.hasBlock(pasted.id)).toBe(false);
    editor.blockListProps.destroy();
    expect(core.blockListProps.has("react")).toBe(false);
    expect(core.blockListProps.has("host")).toBe(true);
  } finally { await editor.destroy(); await core.destroy(); }
});
