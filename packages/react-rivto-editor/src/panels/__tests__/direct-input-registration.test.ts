/** @jest-environment ./jest-browser-environment.mjs */
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../test-utils";
import { scheduleBlockFocus } from "../../block-behaviors/utils/focus-ops";
import { PanelRegistry } from "../panel-registry";
import type { PanelInputRegistration } from "../types";
import type { InputRoot } from "@chulane/rivto-root";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("attaches Page behavior to the panel-owned Edgeless occurrence", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  try {
    panel.setRoot(root);
    expect(panel.page.inputRoot).toBe(panel.mountedRoot);
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
    panel.setRoot(null);
    expect(panel.page.inputRoot).toBeUndefined();
  } finally {
    panel.editor.destroy();
    await core.destroy();
  }
});

it("invalidates a direct control's captured capability when routing is disabled", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoBlockEditor = "true";
  let delivered: Pick<InputRoot, "isAttached"> | undefined;
  panel.editor.events.register({ id: "capture-registration", type: "click" }, (event) => {
    delivered = event.inputRoot;
  });
  const schedule = jestApi.spyOn(panel.selection, "scheduleIfSelectionUnchanged");
  try {
    panel.setRoot(root);
    const original = panel.inputRoot!;
    const registration = panel.inputRegistration!;
    root.click();
    expect(delivered).toBe(original);
    expect(original.isAttached()).toBe(true);
    panel.setEnabled(false);
    expect(registration.isCurrent(original)).toBe(false);
    expect(panel.inputRoot).toBeUndefined();
    expect(panel.page.inputRoot?.getElementIdentity?.()).toBe(getBrowserElementIdentity(root));
    panel.setEnabled(true);
    expect(panel.inputRoot?.isAttached()).toBe(true);
    expect(registration.isCurrent(original)).toBe(false);
    scheduleBlockFocus(panel, "block", 0, original, registration);
    expect(schedule).not.toHaveBeenCalled();
  } finally {
    schedule.mockRestore();
    panel.editor.destroy();
    await core.destroy();
  }
});

it("invalidates a staged capability if its recipient rejects registration", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = document.createElement("div");
  const mountedRoot = new BrowserInputRoot(root);
  const failure = new Error("recipient failed");
  let staged: PanelInputRegistration | undefined;
  try {
    const release = registry.registerPanel(mountedRoot);
    const previous = mountedRoot;
    expect(() =>
      registry.registerPanel(mountedRoot, {
        receiveInput: (registration) => {
          staged = registration;
          throw failure;
        },
      }),
    ).toThrow(failure);
    expect(staged?.isCurrent()).toBe(false);
    expect(registry.getInputRoots().has(previous)).toBe(true);
    expect(previous?.isAttached()).toBe(true);
    release();
  } finally {
    registry.destroy();
    mountedRoot.detach();
    await core.destroy();
  }
});
