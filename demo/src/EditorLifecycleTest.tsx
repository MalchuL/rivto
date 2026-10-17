import { Suspense, useId, useMemo, useState } from "react";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import {
  EditorPanel,
  PageSurface,
  standardPreset,
  useReactEditor,
  usePanel,
  useReactPanel,
  type ReactEditorExtension,
} from "@chulane/rivto-react";

/** Browser fixture for committed, abandoned and replayed hook lifetimes; isolated from normal demo routes. */
export function EditorLifecycleTest() {
  const [models] = useState(() =>
    ["first", "second"].map((id) => {
      const document = new DocumentModelImpl(new YjsDoc(id));
      document.blocks.insertBlock({ id: `${id}-block`, type: "paragraph", content: id });
      return document;
    }),
  );
  const [index, setIndex] = useState(0);
  const [mounted, setMounted] = useState(true);
  const [abandon, setAbandon] = useState(false);
  const [fail, setFail] = useState(false);
  const [counts] = useState(() => ({
    setup: 0,
    cleanup: 0,
    panelsCreated: 0,
    panelsDestroyed: 0,
    errors: 0,
    failCleanup: false,
  }));
  const [revision, refresh] = useState(0);
  const extension = useMemo<ReactEditorExtension>(
    () => ({
      id: "lifecycle-observer",
      /**
       * Instruments panel creation and editor destruction for the lifecycle browser fixture.
       *
       * @param editor - Editor that owns this operation and its registrations.
       * @returns Cleanup that increments the extension teardown counter.
       */
      setup(editor) {
        counts.setup++;
        // Expose this isolated fixture's runtime for browser checks without dragging.
        Object.assign(window, { __rivtoLifecycleEditor: editor });
        const maintainBlockCards = editor.blockElements.maintainBlockCards.bind(
          editor.blockElements,
        );
        editor.blockElements.maintainBlockCards = (...args) => {
          const release = maintainBlockCards(...args);
          counts.panelsCreated++;
          let active = true;
          return () => {
            if (!active) {
              return;
            }
            active = false;
            release();
            counts.panelsDestroyed++;
          };
        };
        const destroy = editor.destroy.bind(editor);
        editor.destroy = async () => {
          await destroy();
          if (counts.failCleanup) {
            throw new Error("Expected asynchronous cleanup failure");
          }
        };
        return () => {
          counts.cleanup++;
          const fixture = window as unknown as { __rivtoLifecycleEditor?: typeof editor };
          if (fixture.__rivtoLifecycleEditor === editor) {
            delete fixture.__rivtoLifecycleEditor;
          }
        };
      },
    }),
    [counts],
  );
  const inspect = () => {
    // Reading the models after unmount proves the hook did not dispose borrowed document storage.
    refresh((value) => value + 1);
  };
  return (
    <>
      <button onClick={() => setIndex((value) => 1 - value)}>Replace document</button>
      <button onClick={() => setMounted((value) => !value)}>Toggle mount</button>
      <button onClick={() => setAbandon((value) => !value)}>Toggle suspended</button>
      <button onClick={() => setFail((value) => !value)}>Toggle failure</button>
      <button onClick={inspect}>Inspect</button>
      <button
        onClick={() => {
          counts.failCleanup = true;
        }}
      >
        Fail cleanup
      </button>
      <output data-lifecycle-counts data-development={import.meta.env.DEV}>
        {JSON.stringify({
          ...counts,
          revision,
          models: models.map((model) => model.blocks.getRootIds()),
        })}
      </output>
      <Suspense fallback={<p>Suspended</p>}>
        {mounted && (
          <Consumer
            key={`${abandon}-${fail}`}
            document={models[index]!}
            extension={extension}
            abandon={abandon}
            fail={fail}
            onError={() => {
              counts.errors++;
            }}
          />
        )}
      </Suspense>
    </>
  );
}
const pending = new Promise<never>(() => {});
function Consumer({
  document,
  extension,
  abandon,
  fail,
  onError,
}: {
  document: DocumentModelImpl;
  extension: ReactEditorExtension;
  abandon: boolean;
  fail: boolean;
  onError: () => void;
}) {
  const [suspendPanels, setSuspendPanels] = useState(false);
  const state = useReactEditor({
    document,
    extensions: [
      standardPreset(),
      extension,
      {
        id: "failure",
        /**
         * Throws the fixture's expected setup error while failure injection is enabled.
         */
        setup() {
          if (fail) {
            throw new Error("Expected setup failure");
          }
        },
      },
    ],
    onError,
  });
  if (abandon) {
    throw pending;
  }
  if (state.status !== "ready") {
    return <p data-lifecycle-state={state.status}>{state.status}</p>;
  }
  return (
    <div data-lifecycle-state="ready" data-document={state.editor.getDocument().id}>
      <button onClick={() => setSuspendPanels((value) => !value)}>Toggle suspended panels</button>
      <EditorPanel editor={state.editor}>
        <PageSurface />
        <PanelIdentity />
      </EditorPanel>
      <EditorPanel editor={state.editor}>
        <PageSurface />
        <PanelIdentity />
      </EditorPanel>
      <Suspense fallback={<p>Panels suspended</p>}>
        {suspendPanels && (
          <>
            <EditorPanel editor={state.editor}>
              <PageSurface />
            </EditorPanel>
            <SuspendPanelRender />
          </>
        )}
      </Suspense>
    </div>
  );
}

/** Suspends the initial render after the sibling panel has rendered but before its effect can commit. */
function SuspendPanelRender(): never {
  throw pending;
}

/** Verifies that both public hooks read the same committed panel instance. */
function PanelIdentity() {
  const panel = usePanel();
  const reactPanel = useReactPanel();
  const id = useId();
  return <output data-lifecycle-panel={id} data-same-panel={panel === reactPanel} />;
}
