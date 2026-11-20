/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { ChildrenPanel, createCaretSelection } from "@chulane/rivto";
import { createReactEditor } from "../../editor/react-editor";
import { ReactPanel } from "../react-panel";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("returns current attachment capabilities instead of surface elements across remounts", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.tabIndex = 0;
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    const original = panel.inputRoot!;
    const registration = panel.inputRegistration!;
    expect(original).toBeDefined();
    expect(panel.editor.panels.getDefaultInputRoot()).toBe(original);
    surface.focus();
    expect(panel.editor.panels.getActiveInputRoot()).toBe(original);
    panel.setEnabled(false);
    expect(registration.isCurrent(original)).toBe(false);
    expect(panel.editor.panels.getActiveInputRoot()).toBeUndefined();
    expect(panel.editor.panels.getDefaultInputRoot()).toBeUndefined();
    panel.setEnabled(true);
    const replacement = panel.inputRoot!;
    expect(replacement).toBeDefined();
    expect(replacement).toBe(original);
    expect(panel.inputRegistration).not.toBe(registration);
    expect(panel.editor.panels.getDefaultInputRoot()).toBe(replacement);
    expect(panel.editor.panels.getDefaultInputRoot()).not.toBe(surface);
  } finally {
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("does not assign selection to a mounted surface without a registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const hasInteractiveRoot = jestApi.spyOn(panel, "hasInteractiveRoot").mockReturnValue(true);
  try {
    core.selection.set(createCaretSelection(block.id, 0));
    expect(panel.inputRoot).toBeUndefined();
    expect(panel.selection.snapshot()).toBeUndefined();
  } finally {
    hasInteractiveRoot.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("does not expose selection while the last surface registration is being released", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  const panel = new ReactPanel(editor, new ChildrenPanel(core, {}));
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const surface = document.createElement("div");
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    core.selection.set(createCaretSelection(block.id, 0));
    let observed: unknown = "not called";
    const unsubscribe = editor.panels.subscribeRoots(() => {
      observed = panel.selection.snapshot();
    });
    try {
      panel.setRoot(null);
      expect(observed).toBeUndefined();
    } finally {
      unsubscribe();
    }
  } finally {
    panel.destroy();
    editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("does not transfer selection to the default panel during active-panel removal", async () => {
  const core = await createTestCoreEditor();
  const editor = createReactEditor({ editor: core });
  const first = new ReactPanel(editor, new ChildrenPanel(core, {}));
  const second = new ReactPanel(editor, new ChildrenPanel(core, {}));
  const block = core.blocks.insertBlock({ type: "paragraph", content: "text" });
  const firstSurface = document.createElement("div");
  const secondSurface = document.createElement("div");
  firstSurface.dataset.rivtoPanel = "";
  secondSurface.dataset.rivtoPanel = "";
  firstSurface.tabIndex = 0;
  secondSurface.tabIndex = 0;
  document.body.append(firstSurface, secondSurface);
  try {
    first.setRoot(firstSurface);
    second.setRoot(secondSurface);
    secondSurface.focus();
    core.selection.set(createCaretSelection(block.id, 0));
    expect(editor.panels.getActiveInputRoot()).toBe(second.inputRoot);
    let observed: unknown = "not called";
    const unsubscribe = editor.panels.subscribeRoots(() => {
      observed = first.selection.snapshot();
    });
    try {
      second.setRoot(null);
      expect(observed).toBeUndefined();
    } finally {
      unsubscribe();
    }
  } finally {
    first.destroy();
    second.destroy();
    editor.destroy();
    await core.destroy();
    firstSurface.remove();
    secondSurface.remove();
  }
});
