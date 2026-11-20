/** @jest-environment ./jest-browser-environment.mjs */
import { YjsDoc } from "@chulane/crdt-doc";
import { DocumentModelImpl } from "@chulane/document-model";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useReactEditor } from "../use-react-editor";
import type { ReactEditorState } from "../types";
import type { TestEditorEvents, TestHostProps } from "../test-utils/types";

/**
 * Creates the editor through its public hook and installs a borrowed observer.
 *
 * @param props - Model and test-owned state and event collectors.
 * @param props.model - Borrowed model for the hook.
 * @param props.onState - Captures each hook state as it renders.
 * @param props.values - Collects document IDs observed during event delivery.
 * @returns No UI; the test captures the host state and observed events.
 */
function Host({ model, onState, values }: TestHostProps) {
  const state = useReactEditor<TestEditorEvents>({
    document: model,
    extensions: [
      {
        id: "save-feedback",
        /**
         * Observes saves through the extension's borrowed event interface.
         *
         * @param editor - Editor whose lifecycle remains managed by the hook.
         * @returns The event registration is owned by the extension.
         */
        setup(editor) {
          const checkBorrowedType = () => {
            // @ts-expect-error Borrowed extension interfaces cannot publish events.
            editor.events.publish("document-saved", { documentId: "forbidden" });
          };
          void checkBorrowedType;
          editor.events.observe(
            { kind: "custom", id: "saved", type: "document-saved" },
            (event) => {
              values.push(event.documentId);
            },
          );
        },
      },
    ],
  });
  onState(state);
  return null;
}

it("lets the hook host publish typed custom events without granting extensions publishing", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const model = new DocumentModelImpl(new YjsDoc("hook-custom-events"));
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const values: string[] = [];
  let state: ReactEditorState<TestEditorEvents> | undefined;
  let unmounted = false;

  try {
    await act(async () => {
      root.render(<Host model={model} onState={(next) => (state = next)} values={values} />);
    });
    if (!state || state.status !== "ready") {
      throw new Error("Editor did not become ready");
    }
    const editor = state.editor;
    expect(editor.events.publish("document-saved", { documentId: "first" })).toBe("continue");
    expect(values).toEqual(["first"]);
    const checkPayloadType = () => {
      // @ts-expect-error Custom event payloads must match the host's event map.
      editor.events.publish("document-saved", { documentId: 1 });
    };
    void checkPayloadType;
    await act(async () => {
      root.unmount();
    });
    unmounted = true;
    expect(() =>
      editor.events.publish("document-saved", { documentId: "after-unmount" }),
    ).toThrow();
  } finally {
    if (!unmounted) {
      await act(async () => root.unmount());
    }
    container.remove();
    await model.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
