/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";
import { crossDocumentPageRootControllers } from "../../../extensions/block-drag/cross-document/target";
import { PageDragBoundary } from "../page-drag-boundary";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("reconnects the drag receiver when the same surface gets a new input registration", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  const view = createRoot(document.createElement("div"));
  const register = jestApi.spyOn(crossDocumentPageRootControllers, "register");
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <PageDragBoundary />
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    expect(register).toHaveBeenCalledTimes(1);
    const original = panel.inputRoot;
    act(() => {
      panel.setEnabled(false);
    });
    expect(surface.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
    act(() => {
      panel.setEnabled(true);
    });
    expect(panel.inputRoot).toBe(original);
    expect(register).toHaveBeenCalledTimes(2);
    expect(register.mock.calls[1]?.[0]).toBe(panel.inputRoot);
    expect(surface.hasAttribute("data-rivto-cross-document-page-root")).toBe(true);
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    expect(register).toHaveBeenCalledTimes(3);
    expect(register.mock.calls[2]?.[0]).toBe(panel.inputRoot);
  } finally {
    act(() => view.unmount());
    register.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("releases the drag receiver synchronously when routing is disabled", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  const view = createRoot(document.createElement("div"));
  const register = jestApi.spyOn(crossDocumentPageRootControllers, "register");
  const detached = jestApi.fn();
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <PageDragBoundary />
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    expect(surface.hasAttribute("data-rivto-cross-document-page-root")).toBe(true);
    register.mock.calls[0]![1].onDetach(detached);
    act(() => {
      panel.setEnabled(false);
      expect(surface.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
      expect(detached).toHaveBeenCalledTimes(1);
    });
  } finally {
    act(() => view.unmount());
    register.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("releases the drag receiver if its registration check fails during notification", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  const view = createRoot(document.createElement("div"));
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    act(() => {
      view.render(
        <TestPanel panel={panel}>
          <EditorRootContext.Provider
            value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
          >
            <PageDragBoundary />
          </EditorRootContext.Provider>
        </TestPanel>,
      );
    });
    const check = jestApi.spyOn(panel.inputRegistration!, "isCurrent").mockImplementation(() => {
      throw new Error("registration check failed");
    });
    expect(() => act(() => panel.setEnabled(false))).toThrow("registration check failed");
    expect(surface.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
    check.mockRestore();
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
