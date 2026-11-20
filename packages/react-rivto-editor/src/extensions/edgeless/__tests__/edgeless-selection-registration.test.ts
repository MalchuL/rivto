/** @jest-environment ./jest-browser-environment.mjs */
import type { PanelInputRegistration } from "../../../panels/types";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessSelectionRuntime } from "../../built-ins/selection/edgeless-runtime";
import { EdgelessSelectionController } from "../edgeless-selection-controller";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not start a marquee after focus replaces its registration", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const element = document.createElement("div");
  element.dataset.rivtoPanel = "";
  element.dataset.rivtoSurface = "edgeless";
  element.tabIndex = 0;
  document.body.append(element);
  let registration: PanelInputRegistration | undefined;
  panel.events.register({ id: "capture-registration", type: "click" }, (event) => {
    registration = event.inputRegistration;
  });
  panel.setRoot(element);
  element.click();
  const inputRoot = panel.inputRoot!;
  const attached = jestApi.spyOn(inputRoot, "isAttached").mockReturnValue(true);
  const start = jestApi.fn();
  const marquee = { start, move: () => true, stop: () => false as const, destroy: () => {} };
  const selection = new EdgelessSelectionRuntime(panel);
  const clear = jestApi.spyOn(selection, "clear");
  const controller = new EdgelessSelectionController(marquee, inputRoot, selection, registration!);
  const release = controller.install(panel.events);
  element.addEventListener(
    "focus",
    () => {
      panel.setEnabled(false);
      panel.setEnabled(true);
    },
    { once: true },
  );
  try {
    expect(registration?.isCurrent(inputRoot)).toBe(true);
    element.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }));
    expect(registration?.isCurrent()).toBe(false);
    expect(inputRoot.isAttached()).toBe(true);
    expect(clear).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  } finally {
    release();
    clear.mockRestore();
    attached.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});
