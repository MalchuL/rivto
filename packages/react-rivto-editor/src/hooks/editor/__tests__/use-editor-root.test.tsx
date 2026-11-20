/** @jest-environment jsdom */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  EditorPortalHostContext,
  EditorRootContext,
} from "../../../components/editor-panel/editor-root-context";
import { EditorSurfacePortal } from "../../../components/editor-panel/editor-surface-portal";
import { useEditorRoot } from "../use-editor-root";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;
const received: string[][] = [];

/**
 * Records the public surface hook contract and renders a mounting ref.
 *
 * @returns A surface node using the returned registration callback.
 */
function Surface() {
  const result = useEditorRoot();
  received.push(Object.keys(result));
  return <main ref={result.ref} />;
}

test("exposes only the mounting ref while the internal portal follows the surface", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const container = document.createElement("div");
  const surface = document.createElement("div");
  document.body.append(container, surface);
  const renderer = createRoot(container);
  const ref = jestApi.fn();
  try {
    act(() =>
      renderer.render(
        <EditorRootContext.Provider value={{ identity: getBrowserElementIdentity(surface), ref }}>
          <EditorPortalHostContext.Provider value={surface}>
            <Surface />
            <EditorSurfacePortal>
              <span>Surface overlay</span>
            </EditorSurfacePortal>
          </EditorPortalHostContext.Provider>
        </EditorRootContext.Provider>,
      ),
    );
    expect(received.at(-1)).toEqual(["ref"]);
    expect(ref).toHaveBeenCalledWith(container.querySelector("main"));
    expect(surface.textContent).toBe("Surface overlay");
    act(() =>
      renderer.render(
        <EditorRootContext.Provider value={{ identity: undefined, ref }}>
          <EditorPortalHostContext.Provider value={null}>
            <Surface />
            <EditorSurfacePortal>
              <span>Surface overlay</span>
            </EditorSurfacePortal>
          </EditorPortalHostContext.Provider>
        </EditorRootContext.Provider>,
      ),
    );
    expect(surface.textContent).toBe("");
    expect(received.at(-1)).toEqual(["ref"]);
  } finally {
    act(() => renderer.unmount());
    received.length = 0;
    container.remove();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

test("moves surface portal content to a replacement host", () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const renderer = createRoot(document.createElement("div"));
  const first = document.createElement("div");
  const second = document.createElement("div");
  const ref = jestApi.fn();
  try {
    act(() =>
      renderer.render(
        <EditorRootContext.Provider value={{ identity: getBrowserElementIdentity(first), ref }}>
          <EditorPortalHostContext.Provider value={first}>
            <EditorSurfacePortal>Overlay</EditorSurfacePortal>
          </EditorPortalHostContext.Provider>
        </EditorRootContext.Provider>,
      ),
    );
    expect(first.textContent).toBe("Overlay");
    act(() =>
      renderer.render(
        <EditorRootContext.Provider value={{ identity: getBrowserElementIdentity(first), ref }}>
          <EditorPortalHostContext.Provider value={second}>
            <EditorSurfacePortal>Overlay</EditorSurfacePortal>
          </EditorPortalHostContext.Provider>
        </EditorRootContext.Provider>,
      ),
    );
    expect(first.textContent).toBe("");
    expect(second.textContent).toBe("");
    act(() =>
      renderer.render(
        <EditorRootContext.Provider value={{ identity: getBrowserElementIdentity(second), ref }}>
          <EditorPortalHostContext.Provider value={second}>
            <EditorSurfacePortal>Overlay</EditorSurfacePortal>
          </EditorPortalHostContext.Provider>
        </EditorRootContext.Provider>,
      ),
    );
    expect(first.textContent).toBe("");
    expect(second.textContent).toBe("Overlay");
  } finally {
    act(() => renderer.unmount());
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
