import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl, type DocumentModel } from "@chulane/document-model";
import { useEffect, useRef, useState } from "react";
import { EditorPanel } from "../components/editor-panel/editor-panel";
import { useReactEditor } from "../hooks/editor/use-react-editor";
import { standardPreset } from "../extensions/built-ins/built-ins";
import { bentoExtension } from "../extensions/containers/bento/bento";
import { columnsExtension } from "../extensions/containers/columns/columns";
import { kanbanExtension } from "../extensions/containers/kanban/kanban";
import { tableExtension } from "../extensions/containers/table/table";
import { todoItemExtension } from "../extensions/todo-item/todo-item";
import { PageSurface } from "../surfaces/page/page-surface";
import { seedResizeDocument } from "./block-resize-document";

const FRAME_CLASS = "rivto-block-resize-frame";
const FRAME_STYLE = `
.${FRAME_CLASS} { box-sizing: border-box; }
.${FRAME_CLASS} .markdown-content,
.${FRAME_CLASS} .rivto-todo-name,
.${FRAME_CLASS} .rivto-todo-description { content-visibility: visible; }
`;

const EXTENSIONS = [
  standardPreset(),
  columnsExtension(),
  kanbanExtension(),
  bentoExtension(),
  tableExtension(),
  todoItemExtension(),
];

/**
 * Creates an empty document owned by one story mount.
 *
 * @returns A model the story hook borrows and does not destroy.
 */
function createStoryDocument(): DocumentModel {
  return new DocumentModelImpl(new YjsDoc(`rivto-block-resize-${crypto.randomUUID()}`));
}

/**
 * Renders the current blocks in a page column whose width stories can change.
 *
 * The frame is the only width constraint. Stories set its pixel width and then
 * measure whether blocks, gutters, and internal scrollports stay inside the
 * page surface. Content visibility is forced on so offscreen samples keep
 * their real size during measurement.
 *
 * @returns The seeded page surface, or a loading or error status.
 */
export function BlockResizeFrame() {
  const [document] = useState(createStoryDocument);
  const state = useReactEditor({ document, extensions: EXTENSIONS });
  const seeded = useRef(false);
  useEffect(() => {
    if (state.status !== "ready" || seeded.current) {
      return;
    }
    seeded.current = true;
    seedResizeDocument(state.editor);
  }, [state]);

  if (state.status === "error") {
    const message = state.error instanceof Error ? state.error.message : "Editor failed";
    return <p role="alert">{message}</p>;
  }

  return (
    <div data-block-resize-frame="" className={FRAME_CLASS} style={{ width: "960px" }}>
      <style>{FRAME_STYLE}</style>
      {state.status === "ready" ? (
        <EditorPanel editor={state.editor}>
          <PageSurface />
        </EditorPanel>
      ) : (
        <p>Loading editor</p>
      )}
    </div>
  );
}
