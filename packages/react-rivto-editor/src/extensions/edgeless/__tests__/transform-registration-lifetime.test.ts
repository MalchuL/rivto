/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessCreationDefaults } from "../../../managers/elements/edgeless-creation-defaults";
import { EdgelessOperations } from "../../../managers/elements/edgeless-operations";
import { edgelessVisualsExtension } from "../visuals/extension";
import { EdgelessTransformController } from "../edgeless-transform";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("does not let old control cleanup cancel a new registration using the same Root and controls", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const element = document.createElement("div");
  document.body.append(element);
  try {
    panel.setRoot(element);
    const root = panel.inputRoot!;
    const shape = operations.createElement({ type: "rectangle" });
    let firstCurrent = true;
    const first = { isCurrent: () => firstCurrent };
    const second = { isCurrent: () => true };
    const controls = { prepareDrag: () => {}, dragStart: () => {}, stop: jestApi.fn() };
    const releaseFirst = controller.registerControls(panel, controls, root, first);
    firstCurrent = false;
    const releaseSecond = controller.registerControls(panel, controls, root, second);
    expect(controller.beginControls(panel, root, [shape.id], "resize", controls.stop, second)).toBe(
      true,
    );
    releaseFirst();
    expect(element.dataset.transforming).toBe("resize");
    expect(controls.stop).not.toHaveBeenCalled();
    releaseSecond();
    expect(element.dataset.transforming).toBeUndefined();
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it("cancels preparation when focus expires the input registration", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const element = document.createElement("div");
  document.body.append(element);
  try {
    panel.setRoot(element);
    const root = panel.inputRoot!;
    const shape = operations.createElement({ type: "rectangle" });
    let current = true;
    const registration = { isCurrent: () => current };
    const focus = jestApi.spyOn(root, "focus").mockImplementation(() => {
      current = false;
    });
    const stop = jestApi.fn();
    expect(controller.beginControls(panel, root, [shape.id], "resize", stop, registration)).toBe(
      false,
    );
    expect(root.isAttached()).toBe(true);
    expect(element.dataset.transforming).toBeUndefined();
    expect(stop).toHaveBeenCalledTimes(1);
    focus.mockRestore();
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it("restores preview geometry instead of committing after registration expiry", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const element = document.createElement("div");
  element.dataset.rivtoBlockEditor = "true";
  document.body.append(element);
  try {
    panel.setRoot(element);
    const root = panel.inputRoot!;
    const shape = operations.createElement({ type: "rectangle" });
    const host = document.createElement("div");
    host.dataset.edgelessObjectId = shape.id;
    element.append(host);
    let current = true;
    const registration = { isCurrent: () => current };
    const stop = jestApi.fn();
    expect(controller.beginControls(panel, root, [shape.id], "resize", stop, registration)).toBe(
      true,
    );
    controller.previewControls([
      { id: shape.id, frame: { ...shape.frame, width: 400 }, rotation: 0 },
    ]);
    expect(host.style.width).toBe("400px");
    current = false;
    controller.finishControls(panel, true, 1, registration);
    expect(panel.elements.getElementNode(shape.id)?.frame.width).toBe(shape.frame.width);
    expect(host.style.width).toBe(`${shape.frame.width}px`);
    expect(stop).toHaveBeenCalledTimes(1);
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    element.remove();
  }
});

it.each(["marker", "pins", "check", "before"])(
  "restores the preview if %s cleanup expires the registration before commit",
  async (cleanup) => {
    const core = await createTestCoreEditor({ mode: "edgeless" });
    const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
    const defaults = new EdgelessCreationDefaults(panel.editor);
    const operations = new EdgelessOperations(panel.editor, panel, defaults);
    let current = true;
    const controller = new EdgelessTransformController(panel.editor, defaults, {
      pin: () => () => {
        if (cleanup === "pins" || cleanup === "check") {
          current = false;
        }
      },
    });
    const element = document.createElement("div");
    element.dataset.rivtoBlockEditor = "true";
    document.body.append(element);
    try {
      panel.setRoot(element);
      const root = panel.inputRoot!;
      const shape = operations.createElement({ type: "rectangle" });
      const host = document.createElement("div");
      host.dataset.edgelessObjectId = shape.id;
      element.append(host);
      const registration = {
        isCurrent: () => {
          if (!current && (cleanup === "check" || cleanup === "before")) {
            throw new Error("registration check failed");
          }
          return current;
        },
      };
      if (cleanup === "marker") {
        jestApi.spyOn(root, "setTemporaryAttribute").mockReturnValue(() => {
          current = false;
        });
      }
      expect(
        controller.beginControls(panel, root, [shape.id], "resize", () => {}, registration),
      ).toBe(true);
      controller.previewControls([
        { id: shape.id, frame: { ...shape.frame, width: 400 }, rotation: 0 },
      ]);
      if (cleanup === "before") {
        current = false;
      }
      if (cleanup === "check" || cleanup === "before") {
        expect(() => controller.finishControls(panel, true, 1, registration)).toThrow(
          "registration check failed",
        );
      } else {
        controller.finishControls(panel, true, 1, registration);
      }
      expect(panel.elements.getElementNode(shape.id)?.frame.width).toBe(shape.frame.width);
      expect(host.style.width).toBe(`${shape.frame.width}px`);
    } finally {
      controller.finishControls(panel, false);
      operations.destroy();
      panel.editor.destroy();
      await core.destroy();
      element.remove();
    }
  },
);
