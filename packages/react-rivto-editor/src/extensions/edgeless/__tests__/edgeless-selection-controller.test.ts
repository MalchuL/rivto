/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessSelectionRuntime } from "../../built-ins/selection/edgeless-runtime";
import { EdgelessSelectionController } from "../edgeless-selection-controller";
import { createEdgelessMarquee } from "../browser/create-edgeless-marquee";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("rolls back acquired pointer registrations when setup fails, even if cleanup also throws", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  const selection = new EdgelessSelectionRuntime(panel);
  const inputRoot = new BrowserInputRoot(root);
  const controller = new EdgelessSelectionController(
    createEdgelessMarquee(inputRoot, panel.elements, selection),
    inputRoot,
    selection,
    { isCurrent: () => true },
  );
  const first = jestApi.fn(() => {
    throw new Error("release failed");
  });
  const second = jestApi.fn();
  const register = jestApi
    .spyOn(panel.events, "register")
    .mockImplementationOnce(() => first)
    .mockImplementationOnce(() => second)
    .mockImplementationOnce(() => {
      throw new Error("registration failed");
    });
  try {
    expect(() => controller.install(panel.events)).toThrow(AggregateError);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(() => controller.destroy()).not.toThrow();
    expect(first).toHaveBeenCalledTimes(1);
  } finally {
    register.mockRestore();
    controller.destroy();
    inputRoot.detach();
    panel.editor.destroy();
    core.destroy();
  }
});
