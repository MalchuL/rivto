/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import { EdgelessCreationDefaults } from "../../../managers/elements/edgeless-creation-defaults";
import { EdgelessOperations } from "../../../managers/elements/edgeless-operations";
import { edgelessVisualsExtension } from "../visuals/extension";
import { canRunEdgelessKeyboardAction } from "../edgeless-keyboard-scope";
import { EdgelessTransformController } from "../edgeless-transform";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("blocks keyboard actions as soon as transform preparation focuses the surface", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const root = document.createElement("div");
  document.body.append(root);
  try {
    panel.setRoot(root);
    const inputRoot = panel.inputRoot!;
    const element = operations.createElement({ type: "rectangle" });
    let permittedDuringFocus: boolean | undefined;
    root.addEventListener("focus", () => {
      permittedDuringFocus = canRunEdgelessKeyboardAction(panel, inputRoot);
    });
    root.tabIndex = 0;
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(true);
    expect(permittedDuringFocus).toBe(false);
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(false);
    controller.finishControls(panel, false);
    expect(canRunEdgelessKeyboardAction(panel, inputRoot)).toBe(true);
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("restores the previous transform marker after the Root detaches", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const root = document.createElement("div");
  root.setAttribute("data-transforming", "previous");
  document.body.append(root);
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(true);
    expect(root.getAttribute("data-transforming")).toBe("resize");
    panel.mountedRoot!.detach();
    controller.finishControls(panel, false);
    expect(root.getAttribute("data-transforming")).toBe("previous");
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("restores captured preview geometry after the Root detaches", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    const host = document.createElement("div");
    host.dataset.edgelessObjectId = element.id;
    root.append(host);
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(true);
    expect(host.dataset.edgelessGeometryLock).toBe("true");
    controller.previewControls([
      { id: element.id, frame: { ...element.frame, width: 400 }, rotation: 0 },
    ]);
    expect(host.style.width).toBe("400px");
    panel.mountedRoot!.detach();
    controller.finishControls(panel, false);
    expect(host.style.width).toBe(`${element.frame.width}px`);
    expect(host.dataset.edgelessGeometryLock).toBeUndefined();
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not let an old gesture restore over a replacement occurrence", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const oldController = new EdgelessTransformController(panel.editor, defaults, null);
  const newController = new EdgelessTransformController(panel.editor, defaults, null);
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    const host = document.createElement("div");
    host.dataset.edgelessObjectId = element.id;
    root.append(host);
    expect(
      oldController.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(true);
    oldController.previewControls([
      { id: element.id, frame: { ...element.frame, width: 300 }, rotation: 0 },
    ]);
    panel.setRoot(null);
    panel.setRoot(root);
    expect(
      newController.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(true);
    newController.previewControls([
      { id: element.id, frame: { ...element.frame, width: 400 }, rotation: 0 },
    ]);
    oldController.finishControls(panel, false);
    expect(host.style.width).toBe("400px");
    expect(host.dataset.edgelessGeometryLock).toBe("true");
    expect(root.dataset.transforming).toBe("resize");
    newController.finishControls(panel, false);
    expect(host.style.width).toBe(`${element.frame.width}px`);
    expect(host.dataset.edgelessGeometryLock).toBeUndefined();
    expect(root.dataset.transforming).toBeUndefined();
  } finally {
    oldController.finishControls(panel, false);
    newController.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not begin controls without a current input registration", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const controller = new EdgelessTransformController(panel.editor, defaults, null);
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    panel.setEnabled(false);
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(false);
    expect(root.hasAttribute("data-transforming")).toBe(false);
  } finally {
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases canvas pins if acquiring the transform marker fails", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const releasePins = jestApi.fn();
  const controller = new EdgelessTransformController(panel.editor, defaults, {
    pin: () => releasePins,
  });
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    jestApi.spyOn(panel.inputRoot!, "setTemporaryAttribute").mockImplementation(() => {
      throw new Error("marker failed");
    });
    expect(() =>
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toThrow("marker failed");
    expect(releasePins).toHaveBeenCalledTimes(1);
    expect(root.hasAttribute("data-transforming")).toBe(false);
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("cleans up a gesture when capturing preview regions fails", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const releasePins = jestApi.fn();
  const stop = jestApi.fn();
  const controller = new EdgelessTransformController(panel.editor, defaults, {
    pin: () => releasePins,
  });
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    jestApi.spyOn(panel.inputRoot!, "findRegions").mockImplementation(() => {
      throw new Error("region lookup failed");
    });
    expect(() =>
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        stop,
        panel.inputRegistration,
      ),
    ).toThrow("region lookup failed");
    expect(root.hasAttribute("data-transforming")).toBe(false);
    expect(releasePins).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("releases pins and stops controls when restoring the transform marker fails", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const releasePins = jestApi.fn();
  const stop = jestApi.fn();
  const controller = new EdgelessTransformController(panel.editor, defaults, {
    pin: () => releasePins,
  });
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    jestApi.spyOn(panel.inputRoot!, "setTemporaryAttribute").mockReturnValue(() => {
      throw new Error("marker cleanup failed");
    });
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        stop,
        panel.inputRegistration,
      ),
    ).toBe(true);
    expect(() => controller.finishControls(panel, false)).toThrow("marker cleanup failed");
    expect(releasePins).toHaveBeenCalledTimes(1);
    expect(stop).toHaveBeenCalledTimes(1);
    expect(() => controller.finishControls(panel, false)).not.toThrow();
  } finally {
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("keeps a new gesture started by cleanup instead of replacing it", async () => {
  const core = await createTestCoreEditor({ mode: "edgeless" });
  const panel = createTestReactEditor({ editor: core, extensions: [edgelessVisualsExtension()] });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const releases = [jestApi.fn(), jestApi.fn()];
  let pins = 0;
  const controller = new EdgelessTransformController(panel.editor, defaults, {
    pin: () => releases[pins++]!,
  });
  const root = document.createElement("div");
  try {
    panel.setRoot(root);
    const element = operations.createElement({ type: "rectangle" });
    jestApi
      .spyOn(panel.inputRoot!, "setTemporaryAttribute")
      .mockReturnValueOnce(() => {
        expect(
          controller.beginControls(
            panel,
            panel.inputRoot,
            [element.id],
            "resize",
            () => {},
            panel.inputRegistration,
          ),
        ).toBe(true);
      })
      .mockReturnValue(() => {});
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "resize",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(true);
    expect(
      controller.beginControls(
        panel,
        panel.inputRoot,
        [element.id],
        "rotate",
        () => {},
        panel.inputRegistration,
      ),
    ).toBe(false);
    expect(releases[0]).toHaveBeenCalledTimes(1);
    expect(releases[1]).not.toHaveBeenCalled();
    controller.finishControls(panel, false);
    expect(releases[1]).toHaveBeenCalledTimes(1);
  } finally {
    controller.finishControls(panel, false);
    operations.destroy();
    panel.editor.destroy();
    await core.destroy();
  }
});
