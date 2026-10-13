import { Suspense, useMemo, useState } from "react";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { EditorPanel, PageSurface, standardPreset, useReactEditor, type ReactEditorExtension } from "@chulane/rivto-react";

/** Browser fixture for committed, abandoned and replayed hook lifetimes; isolated from normal demo routes. */
export function EditorLifecycleTest() {
  const [models] = useState(() => ["first", "second"].map(id => {
    const document = new DocumentModelImpl(new YjsDoc(id));
    document.blocks.insertBlock({ id: `${id}-block`, type: "paragraph", content: id });
    return document;
  }));
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [abandon, setAbandon] = useState(false);
  const [fail, setFail] = useState(false);
  const [counts] = useState(() => ({ setup: 0, cleanup: 0, errors: 0, failCleanup: false }));
  const [revision, refresh] = useState(0);
  const extension = useMemo<ReactEditorExtension>(() => ({
    id: "lifecycle-observer",
    setup(editor) {
      counts.setup++;
      const destroy = editor.destroy.bind(editor);
      editor.destroy = async () => {
        await destroy();
        if (counts.failCleanup) throw new Error("Expected asynchronous cleanup failure");
      };
      return () => { counts.cleanup++; };
    },
  }), [counts]);
  const inspect = () => {
    // Reading the models after unmount proves the hook did not dispose borrowed document storage.
    refresh(value => value + 1);
  };
  return <>
    <button onClick={() => setIndex(value => 1 - value)}>Replace document</button>
    <button onClick={() => setMounted(value => !value)}>Toggle mount</button>
    <button onClick={() => setAbandon(value => !value)}>Toggle suspended</button>
    <button onClick={() => setFail(value => !value)}>Toggle failure</button>
    <button onClick={inspect}>Inspect</button>
    <button onClick={() => { counts.failCleanup = true; }}>Fail cleanup</button>
    <output data-lifecycle-counts data-development={import.meta.env.DEV}>{JSON.stringify({ ...counts, revision, models: models.map(model => model.blocks.getRootIds()) })}</output>
    <Suspense fallback={<p>Suspended</p>}>
      {mounted && <Consumer key={`${abandon}-${fail}`} document={models[index]!} extension={extension} abandon={abandon} fail={fail} onError={() => { counts.errors++; }} />}
    </Suspense>
  </>;
}
const pending = new Promise<never>(() => {});
function Consumer({ document, extension, abandon, fail, onError }: {
  document: DocumentModelImpl; extension: ReactEditorExtension; abandon: boolean; fail: boolean; onError: () => void;
}) {
  const state = useReactEditor({ document, extensions: [standardPreset(), extension, {
    id: "failure", setup() { if (fail) throw new Error("Expected setup failure"); },
  }], onError });
  if (abandon) throw pending;
  if (state.status !== "ready") return <p data-lifecycle-state={state.status}>{state.status}</p>;
  return <div data-lifecycle-state="ready" data-document={state.editor.getDocument().id}>
    <EditorPanel editor={state.editor}><PageSurface /></EditorPanel>
    <EditorPanel editor={state.editor}><PageSurface /></EditorPanel>
  </div>;
}
