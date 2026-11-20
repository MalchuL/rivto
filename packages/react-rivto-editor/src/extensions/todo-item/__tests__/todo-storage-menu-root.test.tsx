/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../test-utils";
import { TodoStorageMenu } from "../todo-storage-menu";

it("keeps consumed Escape and follows the current Root for outside presses", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  const outside = document.createElement("button");
  document.body.append(surface, outside);
  const view = createRoot(surface);
  try {
    panel.setRoot(surface);
    act(() =>
      view.render(
        <TestPanel panel={panel}>
          <TodoStorageMenu label="Filter" panelLabel="Filters">
            <button>Inside</button>
          </TodoStorageMenu>
        </TestPanel>,
      ),
    );
    act(() => surface.querySelector("button")!.click());
    const inside = surface.querySelector('[role="dialog"] button')!;
    inside.addEventListener("keydown", (event) => event.preventDefault(), { once: true });
    act(() =>
      inside.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
      ),
    );
    expect(surface.querySelector('[role="dialog"]')).not.toBeNull();
    act(() => {
      panel.setRoot(null);
      panel.setRoot(surface);
    });
    act(() => outside.dispatchEvent(new MouseEvent("pointerdown", { bubbles: true })));
    expect(surface.querySelector('[role="dialog"]')?.hasAttribute("hidden")).toBe(true);
  } finally {
    act(() => view.unmount());
    panel.editor.destroy();
    await core.destroy();
    surface.remove();
    outside.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
