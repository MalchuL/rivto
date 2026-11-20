/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../../../test-utils";
import { EraseTargets } from "../eraser-tool";

it("marks only the current occurrence and restores markers across a same-element remount", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.dataset.rivtoBlockEditor = "";
  const host = document.createElement("div");
  host.dataset.edgelessObjectId = "object";
  host.dataset.edgelessEraseTarget = "original";
  const nested = document.createElement("div");
  nested.dataset.rivtoBlockEditor = "";
  const nestedHost = document.createElement("div");
  nestedHost.dataset.edgelessObjectId = "object";
  nested.append(nestedHost);
  surface.append(host, nested);
  document.body.append(surface);
  const view = createRoot(document.createElement("div"));
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <EraseTargets ids={["object"]} />
        </TestPanel>,
      ),
    );
    expect(host.dataset.edgelessEraseTarget).toBe("true");
    expect(nestedHost.dataset.edgelessEraseTarget).toBeUndefined();
    const original = panel.inputRoot;
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    expect(panel.inputRoot).not.toBe(original);
    expect(host.dataset.edgelessEraseTarget).toBe("true");
    act(() => view.unmount());
    expect(host.dataset.edgelessEraseTarget).toBe("original");
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
