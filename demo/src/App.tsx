import {
  createRivtoEditor,
  DEFAULT_BLOCK_TYPE,
  RIVTO_VERSION,
} from "@chulane/rivto";
import {
  blockCreationPlugin,
  blockMergePlugin,
  blockOutdentPlugin,
  blockSelectionNavigationPlugin,
  caretNavigationPlugin,
  clipboardPlugin,
  collapsePlugin,
  createReactEditor,
  edgelessDeletionPlugin,
  edgelessMovementPlugin,
  edgelessSelectionPlugin,
  edgelessSurfacePlugin,
  edgelessTransformPlugin,
  EditorView,
  historyPlugin,
  indentPlugin,
  KEYBOARD_BINDING_IDS,
  keyboardBlockMovePlugin,
  pageDragPlugin,
  pageSelectionPlugin,
  pageSurfacePlugin,
  selectionDeletionPlugin,
  slashCommandPlugin,
  textSelectionPlugin,
  emptyBlockResetPlugin,
  useEditor,
  useEditorMode,
} from "@chulane/rivto-react";
import { useEffect, useState } from "react";
import {
  COUNTER_BLOCK_TYPE,
  installCustomBlocks,
  SLIDER_BLOCK_TYPE,
} from "./blocks/custom-blocks";

/**
 * Creates demo content for manual editing and selection checks.
 *
 * Adjacent Markdown blocks, nested branches, and two custom block types make
 * selection and extension behavior directly testable from the demo page.
 */
function createDemoEditor() {
  const editor = createRivtoEditor();
  // This named demo preset gives browser tests and documentation examples a
  // real host-level keymap without adding test-only editor APIs.
  const alternateKeymap = new URLSearchParams(window.location.search).get("keymap") === "alternate"
    ? {
        [KEYBOARD_BINDING_IDS.blockIndent]: ["Primary+ArrowRight"],
        [KEYBOARD_BINDING_IDS.blockOutdent]: [],
      }
    : undefined;
  const reactEditor = createReactEditor({
    editor,
    keymap: alternateKeymap,
    plugins: [
      pageSurfacePlugin(),
      edgelessSurfacePlugin(),
      historyPlugin(),
      textSelectionPlugin(),
      slashCommandPlugin(),
      clipboardPlugin(),
      pageSelectionPlugin(),
      collapsePlugin(),
      caretNavigationPlugin(),
      blockSelectionNavigationPlugin(),
      keyboardBlockMovePlugin(),
      indentPlugin(),
      blockCreationPlugin(),
      selectionDeletionPlugin(),
      blockOutdentPlugin(),
      blockMergePlugin(),
      emptyBlockResetPlugin(),
      pageDragPlugin(),
      edgelessSelectionPlugin(),
      edgelessTransformPlugin(),
      edgelessDeletionPlugin(),
      edgelessMovementPlugin(),
    ],
  });
  installCustomBlocks(reactEditor);
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

  return { editor, reactEditor };
}

/** Demo toolbar for switching the local presentation of one shared document. */
function DemoToolbar() {
  const editor = useEditor();
  const { mode, setMode } = useEditorMode();
  const switchMode = (next: "block" | "edgeless") => {
    if (next === mode) return;
    editor.execute("selection.clear");
    setMode(next);
  };

  return (
    <header className="demo-header">
      <span>Rivto v{RIVTO_VERSION}</span>
      <div className="demo-mode-switch" role="group" aria-label="Editor mode">
        <button type="button" data-editor-mode="block" aria-pressed={mode === "block"} onClick={() => switchMode("block")}>Page</button>
        <button type="button" data-editor-mode="edgeless" aria-pressed={mode === "edgeless"} onClick={() => switchMode("edgeless")}>Edgeless</button>
      </div>
    </header>
  );
}

/** Hosts the editor runtime and explicitly selects the active demo surface. */
export function App() {
  const [{ editor, reactEditor }] = useState(createDemoEditor);

  // EditorView consumes but does not own the runtime, so the application that
  // created it also releases its subscriptions and command registrations.
  // This useEffect returns a cleanup function that destroys the editor.
  useEffect(() => () => {
    reactEditor.destroy();
    editor.destroy();
  }, [editor, reactEditor]);

  return (
    <EditorView editor={reactEditor}>
      <DemoToolbar />
    </EditorView>
  );
}
