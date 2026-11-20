/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import {
  EditorPortalHostContext,
  EditorRootContext,
} from "../../../../components/editor-panel/editor-root-context";
import { SlashMenu } from "../slash-menu";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not refresh a slash input after its registration is disabled and replaced", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "/" });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "true";
  surface.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>/</span></div>`;
  document.body.append(surface);
  const view = createRoot(document.createElement("div"));
  const selection = jestApi.spyOn(document, "getSelection");
  try {
    panel.setRoot(surface);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <EditorPortalHostContext.Provider value={surface}>
              <SlashMenu />
            </EditorPortalHostContext.Provider>
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    const content = surface.querySelector<HTMLElement>("[data-block-content]")!;
    await act(async () => {
      content.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: "/" }),
      );
      selection.mockClear();
      await Promise.resolve();
      expect(selection).toHaveBeenCalled();
    });
    await act(async () => {
      content.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: "/" }),
      );
      panel.setEnabled(false);
      panel.setEnabled(true);
      selection.mockClear();
      await Promise.resolve();
      expect(selection).not.toHaveBeenCalled();
    });
  } finally {
    act(() => view.unmount());
    selection.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("does not refresh a deferred slash input after its registration expires while the Root stays attached", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = panel.blocks.insertBlock({ type: "paragraph", content: "/" });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "true";
  surface.innerHTML = `<div data-block-id="${block.id}"><span data-block-content>/</span></div>`;
  document.body.append(surface);
  const view = createRoot(document.createElement("div"));
  const selection = jestApi.spyOn(document, "getSelection");
  try {
    panel.setRoot(surface);
    const attached = jestApi.spyOn(panel.inputRoot!, "isAttached").mockReturnValue(true);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <EditorPortalHostContext.Provider value={surface}>
              <SlashMenu />
            </EditorPortalHostContext.Provider>
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    const content = surface.querySelector<HTMLElement>("[data-block-content]")!;
    await act(async () => {
      content.dispatchEvent(
        new InputEvent("input", { bubbles: true, inputType: "insertText", data: "/" }),
      );
      panel.setEnabled(false);
      panel.setEnabled(true);
      selection.mockClear();
      await Promise.resolve();
      expect(selection).not.toHaveBeenCalled();
    });
    attached.mockRestore();
  } finally {
    act(() => view.unmount());
    selection.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
