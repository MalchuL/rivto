/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { ReactPanel } from "../../../panels/react-panel";
import type { PanelInputRoot } from "../../../panels/types";
import { EditorPortalHostContext, EditorRootContext } from "../editor-root-context";
import { EditorPortal } from "../editor-portal";

it("renders only for the registration and surface that own the portal", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  const other = document.createElement("div");
  const view = createRoot(document.createElement("div"));
  document.body.append(surface, other);
  try {
    panel.setRoot(surface);
    const initial = panel.inputRoot!;
    const registration = panel.inputRegistration!;
    renderPortal(view, panel, surface, initial, registration);
    expect(document.querySelector("[data-test-editor-portal]")).not.toBeNull();
    act(() => {
      panel.setEnabled(false);
      panel.setEnabled(true);
    });
    renderPortal(view, panel, surface, initial, registration);
    expect(document.querySelector("[data-test-editor-portal]")).toBeNull();
    renderPortal(view, panel, surface, panel.inputRoot!);
    expect(document.querySelector("[data-test-editor-portal]")).not.toBeNull();
    renderPortal(view, panel, other, panel.inputRoot!);
    expect(document.querySelector("[data-test-editor-portal]")).toBeNull();
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    other.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

/**
 * Renders a portal under the supplied panel and surface context.
 *
 * @param view - React root that owns the test subtree.
 * @param panel - Panel supplying the current registration.
 * @param surface - Surface exposed by the mounting context.
 * @param inputRoot - Root captured by the portal.
 * @param inputRegistration - Routing lifetime supplied when rendering the portal.
 * @returns React has committed the portal subtree.
 */
function renderPortal(
  view: Root,
  panel: ReactPanel,
  surface: HTMLElement,
  inputRoot: PanelInputRoot,
  inputRegistration = panel.inputRegistration!,
): void {
  act(() => {
    view.render(
      <TestPanel panel={panel}>
        <EditorRootContext.Provider
          value={{ identity: getBrowserElementIdentity(surface), ref: panel.setRoot }}
        >
          <EditorPortalHostContext.Provider value={surface}>
            <EditorPortal inputRoot={inputRoot} inputRegistration={inputRegistration}>
              <div data-test-editor-portal />
            </EditorPortal>
          </EditorPortalHostContext.Provider>
        </EditorRootContext.Provider>
      </TestPanel>,
    );
  });
}
