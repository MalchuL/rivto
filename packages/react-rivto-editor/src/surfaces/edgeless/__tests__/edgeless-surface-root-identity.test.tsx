/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { act, useCallback, useState } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@chulane/rivto-edgeless";
import { EditorRootContext } from "../../../components/editor-panel/editor-root-context";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessGridSpotlight } from "../edgeless-grid-spotlight";
import { EdgelessSurfaceController } from "../edgeless-surface-controller";
import { useEdgelessSurfaceRoots } from "../use-edgeless-surface-roots";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

test("reattaches pan and spotlight to the replacement viewport and releases the old Root", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const canvas = new Canvas();
  const controller = new EdgelessSurfaceController(panel, canvas, false, 400);
  const spotlight = new EdgelessGridSpotlight();
  const releasePan = jestApi.fn();
  const releaseSpotlight = jestApi.fn();
  const attachPan = controller.attachPanRoot.bind(controller);
  const attachSpotlight = spotlight.attach.bind(spotlight);
  const pan = jestApi.spyOn(controller, "attachPanRoot");
  const observe = jestApi.spyOn(spotlight, "attach");
  pan.mockImplementation((root) => {
    const release = attachPan(root);
    return () => {
      releasePan();
      release();
    };
  });
  observe.mockImplementation((...args) => {
    const release = attachSpotlight(...args);
    return () => {
      releaseSpotlight();
      release();
    };
  });
  const host = document.createElement("div");
  document.body.append(host);
  const view = createRoot(host);
  /**
   * Mounts a viewport using the same panel registration as the surface.
   *
   * @returns A viewport with its spotlight overlay.
   */
  function Surface() {
    const bindings = useEdgelessSurfaceRoots(panel, controller, spotlight);
    return (
      <div ref={bindings.viewportRef}>
        <div ref={bindings.spotlightRef} />
      </div>
    );
  }
  /**
   * Publishes the mounted viewport to the borrowed surface context.
   *
   * @returns The surface wrapped in its occurrence context.
   */
  function Host() {
    const [element, setElement] = useState<HTMLElement | null>(null);
    const ref = useCallback((next: HTMLElement | null) => {
      panel.setRoot(next);
      setElement(next);
    }, []);
    return (
      <EditorRootContext.Provider
        value={{ identity: element ? getBrowserElementIdentity(element) : undefined, ref }}
      >
        <Surface />
      </EditorRootContext.Provider>
    );
  }
  try {
    act(() => view.render(<Host key="first" />));
    const first = panel.inputRoot!;
    expect(first.isAttached()).toBe(true);
    expect(pan).toHaveBeenCalledTimes(1);
    expect(observe).toHaveBeenCalledTimes(1);
    act(() => view.render(<Host key="second" />));
    const second = panel.inputRoot!;
    expect(second).not.toBe(first);
    expect(first.isAttached()).toBe(false);
    expect(second.isAttached()).toBe(true);
    expect(pan).toHaveBeenCalledTimes(2);
    expect(observe).toHaveBeenCalledTimes(2);
    expect(releasePan).toHaveBeenCalledTimes(1);
    expect(releaseSpotlight).toHaveBeenCalledTimes(1);
    expect(pan.mock.calls[1]![0]).toBe(second);
    expect(observe.mock.calls[1]![0]).toBe(second);
    act(() => view.unmount());
    expect(second.isAttached()).toBe(false);
    expect(releasePan).toHaveBeenCalledTimes(2);
    expect(releaseSpotlight).toHaveBeenCalledTimes(2);
  } finally {
    act(() => view.unmount());
    canvas.dispose();
    await panel.editor.destroy();
    await core.destroy();
    host.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
