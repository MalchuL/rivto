import {
  ClipboardPlugin,
  createRivtoEditor,
  DEFAULT_BLOCK_TYPE,
  EditorView,
  HistoryPlugin,
  RIVTO_VERSION,
  TextSelectionPlugin,
  useEditor,
  useEditorMode,
} from "@chulane/rivto";
import { useEffect, useState } from "react";
import {
  COUNTER_BLOCK_TYPE,
  installCustomBlocks,
  SLIDER_BLOCK_TYPE,
} from "./blocks/custom-blocks";
import {
  EdgelessSelectionPlugin,
  EdgelessTransformPlugin,
  PageBackspacePlugin,
  PageArrowPlugin,
  PageBlockSelectionPlugin,
  PageCollapsePlugin,
  PageDeletePlugin,
  PageDragPlugin,
  PageEnterPlugin,
  PageSlashCommandPlugin,
  PageTabPlugin,
} from "./plugins";
import { PageSurface } from "./surfaces/page";
import { EdgelessSurface } from "./surfaces/edgeless";

/**
 * Creates demo content for manual editing and selection checks.
 *
 * Adjacent Markdown blocks, nested branches, and two custom block types make
 * selection and extension behavior directly testable from the demo page.
 */
function createDemoEditor() {
  const editor = createRivtoEditor();
  const disposeCustomBlocks = installCustomBlocks(editor);
  const introId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "**Rivto editor**",
  });
  const paragraphId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "This paragraph renders *Markdown*, ~~old text~~, and `inline code` when it is not edited.",
  }, introId);

  const selectionStartId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Start a selection in the middle of this sentence and drag downward. See [Rivto](https://example.com).",
  }, paragraphId);
  const middleParagraphId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "This complete **Markdown paragraph** should be included between partial selections.",
  }, selectionStartId);
  const listId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Nested branch one owns several Markdown children.",
  }, middleParagraphId);
  const childId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 2: this child owns another nested branch.",
  }, listId);
  editor.indentBlock(childId);
  const grandchildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 3: selection now crosses two indentation boundaries.",
  }, childId);
  editor.indentBlock(grandchildId);
  const greatGrandchildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 4: deepest item for recursive rendering and outdent checks.",
  }, grandchildId);
  editor.indentBlock(greatGrandchildId);
  editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Level 2: sibling after the deep branch.",
  }, childId);

  const reverseSelectionId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Reverse selection should preserve the browser's anchor and focus direction.",
  }, listId);
  const secondBranchId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Nested branch two is a second independent structure.",
  }, reverseSelectionId);
  const numberedChildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 2 child.",
  }, secondBranchId);
  editor.indentBlock(numberedChildId);
  const numberedGrandchildId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 3 descendant.",
  }, numberedChildId);
  editor.indentBlock(numberedGrandchildId);
  editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Second branch level 2 sibling.",
  }, numberedChildId);

  const sliderId = editor.insertBlock({
    type: SLIDER_BLOCK_TYPE,
    content: "const selectedBlocks = selection.filter(item => item.type === 'block');",
    props: { value: 35 },
  }, secondBranchId);
  const selectionEndId = editor.insertBlock({
    type: COUNTER_BLOCK_TYPE,
    props: { count: 2 },
  }, sliderId);
  const finalId = editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Finish the selection in the middle of this sentence, then try copy or cut.",
  }, selectionEndId);
  editor.insertBlock({
    type: DEFAULT_BLOCK_TYPE,
    content: "Type `/` anywhere here to open searchable slash commands.",
  }, finalId);

  // The core gives every new block the same safe geometry. Spread demo roots
  // into a small persisted grid so the first edgeless view is immediately
  // usable while still exercising the normal layout API.
  editor.document.transact(() => editor.getBlocks().forEach((block, index) => {
    editor.setBlockLayout(block.id, {
      x: 60 + (index % 4) * 380,
      y: 60 + Math.floor(index / 4) * 270,
      width: 340,
      height: 220,
    });
  }));
  editor.history.clear();

  return { editor, disposeCustomBlocks };
}

/** Demo toolbar for switching the local presentation of one shared document. */
function DemoToolbar() {
  const editor = useEditor();
  const mode = useEditorMode();
  const setMode = (next: "block" | "edgeless") => {
    if (next === mode) return;
    editor.execute("selection.clear");
    editor.mode.set(next);
  };

  return (
    <header className="demo-header">
      <span>Rivto v{RIVTO_VERSION}</span>
      <div className="demo-mode-switch" role="group" aria-label="Editor mode">
        <button type="button" data-editor-mode="block" aria-pressed={mode === "block"} onClick={() => setMode("block")}>Page</button>
        <button type="button" data-editor-mode="edgeless" aria-pressed={mode === "edgeless"} onClick={() => setMode("edgeless")}>Edgeless</button>
      </div>
    </header>
  );
}

/** Installs plugins that are meaningful only for the ordered page surface. */
function PageMode() {
  return (
    <>
      <PageBlockSelectionPlugin />
      <PageCollapsePlugin />
      <PageArrowPlugin />
      <PageTabPlugin />
      <PageEnterPlugin />
      <PageBackspacePlugin />
      <PageDeletePlugin />
      <PageDragPlugin>
        <PageSurface />
      </PageDragPlugin>
    </>
  );
}

/** Installs root-object behavior around the demo's positioned canvas surface. */
function EdgelessMode() {
  return (
    <>
      <EdgelessSelectionPlugin />
      <EdgelessTransformPlugin />
      <PageEnterPlugin />
      <PageTabPlugin />
      <PageDragPlugin>
        <EdgelessSurface />
      </PageDragPlugin>
    </>
  );
}

/** Selects one concrete surface without changing the persisted document. */
function DemoEditor() {
  const mode = useEditorMode();
  return (
    <>
      <DemoToolbar />
      <HistoryPlugin />
      <TextSelectionPlugin />
      <PageSlashCommandPlugin />
      <ClipboardPlugin />
      {mode === "block" ? <PageMode /> : <EdgelessMode />}
    </>
  );
}

/** Hosts the editor runtime and explicitly selects the active demo surface. */
export function App() {
  const [{ editor, disposeCustomBlocks }] = useState(createDemoEditor);

  // EditorView consumes but does not own the runtime, so the application that
  // created it also releases its subscriptions and command registrations.
  useEffect(() => () => {
    disposeCustomBlocks();
    editor.destroy();
  }, [disposeCustomBlocks, editor]);

  return (
    <EditorView editor={editor}>
      <DemoEditor />
    </EditorView>
  );
}
