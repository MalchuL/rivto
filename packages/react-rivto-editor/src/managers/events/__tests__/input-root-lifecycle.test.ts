/** @jest-environment ./jest-browser-environment.mjs */
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { InputRoot } from "@chulane/rivto-root";
import { createTestCoreEditor, createTestReactEditor } from "../../../test-utils";
import type { PanelInputRegistration } from "../../../panels/types";
import { PanelRegistry } from "../../../panels/panel-registry";

const jestApi = (import.meta as ImportMeta & { jest: typeof jest }).jest;

it("invalidates old root operations across remount and editor teardown", async () => {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const root = document.createElement("div");
  root.dataset.rivtoPanel = "input-root";
  root.dataset.rivtoBlockEditor = "true";
  root.tabIndex = 0;
  document.body.append(root);
  const roots: Pick<InputRoot, "isAttached" | "clearSelection" | "focus">[] = [];
  const focus = jestApi.spyOn(root, "focus");
  const getSelection = jestApi.spyOn(document, "getSelection");
  panel.editor.events.register({ id: "capture-root", type: "click" }, (event) => {
    roots.push(event.inputRoot);
  });
  try {
    panel.setRoot(root);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    panel.setRoot(null);
    panel.setRoot(root);
    root.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    focus.mockClear();
    getSelection.mockClear();
    roots[0]!.clearSelection();
    roots[0]!.focus();
    expect(focus).not.toHaveBeenCalled();
    expect(getSelection).not.toHaveBeenCalled();
    roots[1]!.focus();
    expect(focus).toHaveBeenCalledWith({ preventScroll: true });
    panel.editor.destroy();
    expect(roots[1]!.isAttached()).toBe(false);
  } finally {
    focus.mockRestore();
    getSelection.mockRestore();
    panel.editor.destroy();
    await core.destroy();
    root.remove();
  }
});

it("invalidates a replaced registration without letting its disposer release the replacement", async () => {
  const core = await createTestCoreEditor();
  const registry = new PanelRegistry(core.selection, { assertActive: () => {} });
  const root = document.createElement("div");
  const mountedRoot = new BrowserInputRoot(root);
  try {
    const registrations: PanelInputRegistration[] = [];
    const register = () =>
      registry.registerPanel(
        mountedRoot,
        core.getDocument(),
        undefined,
        undefined,
        undefined,
        undefined,
        (registration) => {
          registrations.push(registration);
        },
      );
    const releaseFirst = register();
    const releaseSecond = register();
    const [first, second] = registrations;
    expect(first.isCurrent()).toBe(false);
    expect(second.isCurrent()).toBe(true);
    releaseFirst();
    expect(registry.getInputRoots().has(mountedRoot)).toBe(true);
    expect(second.isCurrent()).toBe(true);
    releaseSecond();
    expect(second.isCurrent()).toBe(false);
    expect(mountedRoot.isAttached()).toBe(true);
  } finally {
    registry.destroy();
    mountedRoot.detach();
    await core.destroy();
  }
});
