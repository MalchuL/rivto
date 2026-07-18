import {
  createRivtoEditor,
  EditorView,
  RIVTO_VERSION,
} from "@chulane/rivto";
import { useEffect, useState } from "react";
import { PageSurface } from "./surfaces/page";

/** Creates the demo-owned runtime and a small document that exercises nesting. */
function createDemoEditor() {
  const editor = createRivtoEditor();
  const headingId = editor.insertBlock({
    type: "heading",
    content: "Rivto editor",
  });
  const paragraphId = editor.insertBlock({
    type: "paragraph",
    content: "This page is rendered by the demo-owned PageSurface.",
  }, headingId);
  const childId = editor.insertBlock({
    type: "bulletListItem",
    content: "Edit this text directly in the browser.",
  }, paragraphId);
  editor.indentBlock(childId);
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
        <PageSurface />
      </EditorView>
    </>
  );
}
