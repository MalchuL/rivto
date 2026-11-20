/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { PageDragOccurrence } from "../page-drag-occurrence";
import { PageDragBoundary } from "../page-drag-boundary";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not resolve geometry through a replaced receiving occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  document.body.append(root);
  const resolve = jestApi.fn(() => undefined);
  const previous = new PageDragOccurrence(panel, { resolve }, new BrowserInputRoot(root), {
    isCurrent: () => true,
  });
  const current = new PageDragOccurrence(panel, { resolve }, new BrowserInputRoot(root), {
    isCurrent: () => true,
  });
  try {
    const documentId = core.getDocument().id;
    expect(PageDragOccurrence.resolvePlacement(previous, 0, 0, [], documentId)).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
    expect(PageDragOccurrence.resolvePlacement(current, 0, 0, [], documentId)).toBeNull();
    expect(resolve).toHaveBeenCalledTimes(1);
  } finally {
    previous.destroy();
    current.destroy();
    root.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("rejects a Root belonging to a different receiving surface", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  const other = document.createElement("div");
  const view = createRoot(document.createElement("div"));
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  document.body.append(element, other);
  panel.setRoot(other);
  try {
    expect(() =>
      act(() =>
        view.render(
          <TestPanel panel={panel}>
            <EditorRootContext.Provider
              value={{
                identity: element ? getBrowserElementIdentity(element) : undefined,
                ref: panel.setRoot,
              }}
            >
              <PageDragBoundary />
            </EditorRootContext.Provider>
          </TestPanel>,
        ),
      ),
    ).toThrow("Page drag Root does not match the mounted surface");
    expect(element.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
    expect(other.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    element.remove();
    other.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

it("releases the receiver marker when Root region capture fails", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  const root = new BrowserInputRoot(element);
  jestApi.spyOn(root, "captureRegionByIdentity").mockReturnValue(undefined);
  try {
    expect(
      () =>
        new PageDragOccurrence(panel, { resolve: () => undefined }, root, {
          isCurrent: () => true,
        }),
    ).toThrow("Page drag Root ended during registration");
    expect(element.hasAttribute("data-rivto-cross-document-page-root")).toBe(false);
  } finally {
    root.detach();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("rejects a receiver after its registration expires without waiting for effect cleanup", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  element.tabIndex = 0;
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  const registration = { isCurrent: () => current };
  const resolve = jestApi.fn(() => undefined);
  const focus = jestApi.spyOn(root, "focus");
  const occurrence = new PageDragOccurrence(panel, { resolve }, root, registration);
  try {
    expect(occurrence.region.isSame(occurrence.region)).toBe(true);
    current = false;
    expect(root.isAttached()).toBe(true);
    expect(occurrence.region.isSame(occurrence.region)).toBe(false);
    const detached = jestApi.fn();
    const unsubscribe = occurrence.onDetach(detached);
    expect(detached).toHaveBeenCalledTimes(1);
    unsubscribe();
    occurrence.focus();
    expect(focus).not.toHaveBeenCalled();
    expect(
      PageDragOccurrence.resolvePlacement(occurrence, 0, 0, [], core.getDocument().id),
    ).toBeNull();
    expect(resolve).not.toHaveBeenCalled();
  } finally {
    occurrence.destroy();
    focus.mockRestore();
    root.detach();
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("discards a target if its receiving registration expires during geometry resolution", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  document.body.append(element);
  const root = new BrowserInputRoot(element);
  let current = true;
  const registration = { isCurrent: () => current };
  const occurrence: PageDragOccurrence = new PageDragOccurrence(
    panel,
    {
      resolve: () => {
        current = false;
        return { anchor: occurrence.region, destination: { kind: "inside", parentId: null } };
      },
    },
    root,
    registration,
  );
  try {
    expect(
      PageDragOccurrence.resolvePlacement(occurrence, 0, 0, [], core.getDocument().id),
    ).toBeNull();
    expect(root.isAttached()).toBe(true);
  } finally {
    occurrence.destroy();
    root.detach();
    element.remove();
    panel.editor.destroy();
    await core.destroy();
  }
});
