/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessSelectionRuntime } from "../../built-ins/selection/edgeless-runtime";
import { EdgelessSelectionController } from "../edgeless-selection-controller";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("respects pan markers and ignores events from a replacement occurrence", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "selection-test";
  root.dataset.rivtoSurface = "edgeless";
  document.body.append(root);
  panel.setRoot(root);
  const inputRoot = panel.inputRoot!;
  const start = jestApi.fn<void, [number, number, readonly string[]]>();
  const marquee = { start, move: () => true, stop: () => false as const, destroy: () => {} };
  const controller = new EdgelessSelectionController(
    marquee,
    inputRoot,
    new EdgelessSelectionRuntime(panel),
    panel.inputRegistration!,
  );
  const release = controller.install(panel.events);
  /**
   * Dispatches a primary press on the mounted canvas root.
   *
   * @returns Whether the browser allowed the pointer event's default action.
   */
  const press = () =>
    root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }));
  try {
    root.dataset.panningReady = "true";
    press();
    expect(start).not.toHaveBeenCalled();
    delete root.dataset.panningReady;
    press();
    expect(start).toHaveBeenCalledTimes(1);
    const read = jestApi.spyOn(inputRoot, "readAttribute").mockImplementationOnce(() => {
      panel.setRoot(null);
      panel.setRoot(root);
      return undefined;
    });
    press();
    read.mockRestore();
    expect(inputRoot.isAttached()).toBe(false);
    press();
    expect(start).toHaveBeenCalledTimes(1);
  } finally {
    release();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("does not clear selection or start a marquee after focus replaces the Root", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "selection-focus-test";
  root.dataset.rivtoSurface = "edgeless";
  root.tabIndex = 0;
  document.body.append(root);
  panel.setRoot(root);
  const inputRoot = panel.inputRoot!;
  const start = jestApi.fn<void, [number, number, readonly string[]]>();
  const marquee = { start, move: () => true, stop: () => false as const, destroy: () => {} };
  const selection = new EdgelessSelectionRuntime(panel);
  const clear = jestApi.spyOn(selection, "clear");
  const controller = new EdgelessSelectionController(
    marquee,
    inputRoot,
    selection,
    panel.inputRegistration!,
  );
  const release = controller.install(panel.events);
  root.addEventListener(
    "focus",
    () => {
      panel.setRoot(null);
      panel.setRoot(root);
    },
    { once: true },
  );
  try {
    root.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true, button: 0, buttons: 1 }));
    expect(inputRoot.isAttached()).toBe(false);
    expect(clear).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  } finally {
    release();
    clear.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});
