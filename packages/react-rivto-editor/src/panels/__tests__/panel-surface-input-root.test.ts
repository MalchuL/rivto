/** @jest-environment ./jest-browser-environment.mjs */
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("reads a panel surface through its Root and rejects a replaced registration", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.setAttribute("data-rivto-surface", "edgeless");
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    const original = panel.inputRoot!;
    const registration = panel.inputRegistration!;
    expect(original).toBeDefined();
    expect(panel.editor.panels.getSurfaceType(original, registration)).toBe("edgeless");
    panel.setEnabled(false);
    panel.setEnabled(true);
    expect(panel.inputRoot).toBe(original);
    expect(panel.editor.panels.getSurfaceType(original, registration)).toBe("block");
    expect(panel.editor.panels.getSurfaceType(panel.inputRoot)).toBe("edgeless");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("reads the default surface through its current Root and retains the panel-mode fallback", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.setAttribute("data-rivto-surface", "edgeless");
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    const inputRoot = panel.inputRoot!;
    const read = jestApi.spyOn(inputRoot, "readAttribute");
    expect(panel.editor.panels.getSurfaceType()).toBe("edgeless");
    expect(read).toHaveBeenCalledWith("data-rivto-surface");
    surface.setAttribute("data-rivto-surface", "unsupported");
    panel.mode.set("edgeless");
    expect(panel.editor.panels.getSurfaceType(inputRoot)).toBe("edgeless");
    expect(panel.getSurfaceType()).toBe("edgeless");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("discards a surface read if the registration is replaced during the read", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.setAttribute("data-rivto-surface", "edgeless");
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    const original = panel.inputRoot!;
    const registration = panel.inputRegistration!;
    const getAttribute = surface.getAttribute.bind(surface);
    let replaced = false;
    const read = jestApi.spyOn(surface, "getAttribute").mockImplementation((name) => {
      const value = getAttribute(name);
      if (name === "data-rivto-surface" && !replaced) {
        replaced = true;
        panel.setEnabled(false);
        panel.setEnabled(true);
      }
      return value;
    });
    try {
      expect(panel.editor.panels.getSurfaceType(original, registration)).toBe("block");
      expect(panel.inputRoot).toBe(original);
      expect(panel.editor.panels.getSurfaceType(panel.inputRoot)).toBe("edgeless");
    } finally {
      read.mockRestore();
    }
  } finally {
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});

it("does not read a replacement panel's mode through a stale Root", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  surface.setAttribute("data-rivto-surface", "unsupported");
  document.body.append(surface);
  try {
    panel.setRoot(surface);
    panel.mode.set("edgeless");
    const original = panel.inputRoot!;
    const identity = new BrowserInputRoot(surface).getElementIdentity();
    const root = {
      isAttached: () => original.isAttached(),
      readAttribute: (name: string) => original.readAttribute(name),
      getElementIdentity: () => {
        panel.setEnabled(false);
        panel.setEnabled(true);
        return identity;
      },
    };
    expect(panel.editor.panels.getSurfaceType(root)).toBe("block");
    expect(panel.editor.panels.getSurfaceType(panel.inputRoot)).toBe("edgeless");
  } finally {
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
  }
});
