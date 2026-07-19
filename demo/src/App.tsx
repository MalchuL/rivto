import {
  ClipboardPlugin,
  createRivtoEditor,
  EditorView,
  RIVTO_VERSION,
  TextSelectionPlugin,
} from "@chulane/rivto";
import { useEffect, useState } from "react";
import {
  PageBackspacePlugin,
  PageDeletePlugin,
  PageDragPlugin,
  PageEnterPlugin,
  PageTabPlugin,
} from "./plugins";
import { PageSurface } from "./surfaces/page";

/**
 * Creates demo content for manual editing and selection checks.
 *
 * The document deliberately contains adjacent text blocks and two nested list
 * trees. This makes it easy to drag a selection across different depths and
 * verify that complete blocks between partial text boundaries remain selected.
 */
function createDemoEditor() {
  const editor = createRivtoEditor();
  const headingId = editor.insertBlock({
    type: "heading",
    content: "Rivto editor",
  });
  const paragraphId = editor.insertBlock({
    type: "paragraph",
    content: "This page is rendered by the demo-owned PageSurface. Every line below is editable.",
  }, headingId);

  const selectionStartId = editor.insertBlock({
    type: "paragraph",
    content: "Start a selection in the middle of this sentence and drag downward.",
  }, paragraphId);
  const middleParagraphId = editor.insertBlock({
    type: "paragraph",
    content: "This complete paragraph should be included between partial text selections.",
  }, selectionStartId);
  const listId = editor.insertBlock({
    type: "bulletListItem",
    content: "A complete list block can also sit inside the selected range.",
  }, middleParagraphId);
  const childId = editor.insertBlock({
    type: "bulletListItem",
    content: "Bullet level 2: this child owns another nested branch.",
  }, listId);
  editor.indentBlock(childId);
  const grandchildId = editor.insertBlock({
    type: "bulletListItem",
    content: "Bullet level 3: selection now crosses two indentation boundaries.",
  }, childId);
  editor.indentBlock(grandchildId);
  const greatGrandchildId = editor.insertBlock({
    type: "bulletListItem",
    content: "Bullet level 4: deepest item for recursive rendering and outdent checks.",
  }, grandchildId);
  editor.indentBlock(greatGrandchildId);
  editor.insertBlock({
    type: "bulletListItem",
    content: "Bullet level 2: sibling after the deep branch.",
  }, childId);

  const quoteId = editor.insertBlock({
    type: "quote",
    content: "Reverse selection should preserve the browser's anchor and focus direction.",
  }, listId);
  const numberedListId = editor.insertBlock({
    type: "numberedListItem",
    content: "Numbered level 1: a second independent nested structure.",
  }, quoteId);
  const numberedChildId = editor.insertBlock({
    type: "numberedListItem",
    content: "Numbered level 2: child of the numbered root.",
  }, numberedListId);
  editor.indentBlock(numberedChildId);
  const numberedGrandchildId = editor.insertBlock({
    type: "numberedListItem",
    content: "Numbered level 3: deepest numbered descendant.",
  }, numberedChildId);
  editor.indentBlock(numberedGrandchildId);
  editor.insertBlock({
    type: "numberedListItem",
    content: "Numbered level 2: sibling after the nested numbered branch.",
  }, numberedChildId);

  const codeId = editor.insertBlock({
    type: "code",
    content: "const selectedBlocks = selection.filter(item => item.type === 'block');",
  }, numberedListId);
  const selectionEndId = editor.insertBlock({
    type: "paragraph",
    content: "Finish the selection in the middle of this sentence, then try copy or cut.",
  }, codeId);
  editor.insertBlock({
    type: "paragraph",
    content: "This final line stays outside the suggested selection and makes the boundary visible.",
  }, selectionEndId);

  return editor;
}

/** Hosts the editor runtime and explicitly selects the active demo surface. */
export function App() {
  const [editor] = useState(createDemoEditor);

  // EditorView consumes but does not own the runtime, so the application that
  // created it also releases its subscriptions and command registrations.
  useEffect(() => () => editor.destroy(), [editor]);

  return (
    <>
      <header className="demo-header">Rivto v{RIVTO_VERSION}</header>
      <EditorView editor={editor}>
        <TextSelectionPlugin />
        <ClipboardPlugin />
        <PageTabPlugin />
        <PageEnterPlugin />
        <PageBackspacePlugin />
        <PageDeletePlugin />
        <PageDragPlugin>
          <PageSurface />
        </PageDragPlugin>
      </EditorView>
    </>
  );
}
