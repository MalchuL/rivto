import { useMemo, useRef, useState } from "react";
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import {
  EditorPanel,
  EdgelessSurface,
  edgelessPreset,
  standardPreset,
  useReactEditor,
  usePanel,
  useReactPanel,
  useElements,
  type ReactEditorExtension,
} from "@chulane/rivto-react";

/** Demonstrates a host-defined canvas type using only the public registration and panel APIs. */
export function ElementRegistrationTest() {
  const [document] = useState(() => {
    const model = new DocumentModelImpl(new YjsDoc("registered-elements"));
    for (const id of ["first", "second"]) {
      model.elements.insertElement({
        id,
        type: "group",
        frame: { x: 0, y: 0, width: 10, height: 10 },
        zIndex: 0,
      });
    }
    return model;
  });
  const [mounted, setMounted] = useState(true);
  const registerGroup = useRef<(() => void) | undefined>(undefined);
  const unregisterGroup = useRef<(() => void) | undefined>(undefined);
  const unregister = useRef<(() => void) | undefined>(undefined);
  const extension = useMemo<ReactEditorExtension>(
    () => ({
      id: "demo.badge",
      /**
       * Registers the badge element and optional custom toolbar group for the browser fixture.
       *
       * @param editor - Editor that owns this operation and its registrations.
       * @returns The badge registration's cleanup function.
       */
      setup(editor) {
        const group = new URLSearchParams(window.location.search).get("toolbarGroup") ?? undefined;
        registerGroup.current = () => {
          if (editor.edgelessToolbar.getGroup("custom")) {
            return;
          }
          unregisterGroup.current = editor.edgelessToolbar.registerGroup({
            id: "custom",
            title: "Custom tools",
            icon: "rectangle",
            render: ({ items, renderTool }) => (
              <div data-custom-tools style={{ display: "grid", gap: 8 }}>
                <strong>Custom group layout</strong>
                {items.map((item) => renderTool(item))}
              </div>
            ),
          });
        };
        const dispose = editor.elementTypes.register({
          definition: {
            type: "badge",
            defaults: { title: "Badge", units: 1 },
            /**
             * Checks that a badge has a string title and a positive finite unit count.
             *
             * @param props - Element properties to validate.
             * @returns The unchanged properties.
             * @throws If the badge properties are invalid.
             */
            validate(props) {
              if (
                typeof props.title !== "string" ||
                typeof props.units !== "number" ||
                !Number.isFinite(props.units) ||
                props.units <= 0
              ) {
                throw new Error("Invalid badge");
              }
              return props;
            },
          },
          render: ({ element }) => (
            <div
              data-custom-badge
              style={{
                width: "100%",
                height: "100%",
                background: "#c7d2fe",
                border: "2px solid #4338ca",
              }}
            >
              {String(element.props.title)}
            </div>
          ),
          behavior: {
            resize: (element, frame) => ({
              units: (Number(element.props.units) * frame.width) / element.frame.width,
            }),
          },
          creation: {
            title: "Badge",
            group,
            create: () => ({
              type: "badge",
              frame: { x: 0, y: 0, width: 160, height: 120 },
              zIndex: 1,
            }),
          },
          title: "Badge",
          properties: ({ common, preview }) => (
            <label>
              Badge text
              <input
                aria-label="Badge text"
                value={String(common("title") ?? "")}
                onChange={(event) => preview({ title: event.target.value })}
              />
            </label>
          ),
          clipboard: { copy: (element) => ({ props: { ...element.props, copied: true } }) },
        });
        unregister.current = dispose;
        return dispose;
      },
    }),
    [],
  );
  const state = useReactEditor({
    document,
    extensions: [
      standardPreset(),
      ...edgelessPreset({
        visuals: { toolbar: !new URLSearchParams(window.location.search).has("hideToolbar") },
      }),
      extension,
    ],
  });
  if (state.status !== "ready") {
    return <p>{state.status}</p>;
  }
  return (
    <>
      <button onClick={() => setMounted((value) => !value)}>Toggle canvases</button>
      <button onClick={() => unregister.current?.()}>Unregister badge</button>
      {new URLSearchParams(window.location.search).get("toolbarGroup") === "custom" && (
        <>
          <button onClick={() => registerGroup.current?.()}>Register badge group</button>
          <button onClick={() => unregisterGroup.current?.()}>Unregister badge group</button>
        </>
      )}
      <button onClick={() => state.editor.history.undo()}>Undo</button>
      <button onClick={() => state.editor.history.redo()}>Redo</button>
      {mounted && (
        <div style={{ display: "flex", gap: 16 }}>
          {["first", "second"].map((id) => (
            <section key={id} data-canvas={id} style={{ width: 600, height: 500 }}>
              <EditorPanel editor={state.editor} rootElementId={id}>
                <EdgelessSurface />
                <Inspect />
              </EditorPanel>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

/** Reads the core panel and performs canvas actions through its separate React counterpart. */
function Inspect() {
  const panel = usePanel();
  const reactPanel = useReactPanel();
  const elements = useElements();
  return (
    <>
      <button
        onClick={() => {
          const node = panel.elements.insertElement({
            type: "badge",
            frame: { x: 120, y: 120, width: 160, height: 120 },
            zIndex: 1,
          });
          reactPanel.editor.commands.execute("edgeless.selection.set", {
            reactPanel,
            payload: [node.id],
          });
        }}
      >
        Create badge
      </button>
      <output data-custom-state>
        {JSON.stringify(elements.filter((element) => element.type === "badge"))}
      </output>
      <button
        onClick={() => {
          const node = panel.elements.getElementNodes().find((element) => element.type === "badge");
          if (!node) {
            return;
          }
          panel.document.history.stopCapturing();
          panel.elements.updateElement(node.id, { frame: { width: node.frame.width * 2 } });
        }}
      >
        Double width
      </button>
      <button
        onClick={() =>
          reactPanel.editor.commands.execute("edgeless.visual.duplicate", {
            reactPanel,
            payload: undefined,
          })
        }
      >
        Duplicate
      </button>
    </>
  );
}
