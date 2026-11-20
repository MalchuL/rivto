/** @jest-environment ./jest-browser-environment.mjs */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ReactPanel } from "../../../../panels/react-panel";
import { TestPanel, createTestCoreEditor, createTestReactEditor } from "../../../../test-utils";
import { TableBlockBoundary } from "../browser/table-block-boundary";

it("keeps boundary controls on the current mounted Root, including while disabled", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const surface = document.createElement("div");
  const block = document.createElement("div");
  block.dataset.blockId = "table-cell";
  surface.append(block);
  document.body.append(surface);
  const renderer = createRoot(block);
  const otherSurface = document.createElement("div");
  try {
    panel.setRoot(surface);
    const first = panel.mountedRoot!;
    renderBoundary(renderer, panel);
    expect(block.querySelector("button")?.textContent).toBe("Boundary");
    const other = document.createElement("div");
    other.dataset.blockId = "other-cell";
    surface.append(other);
    const marker = block.querySelector(".marker")!;
    other.append(marker);
    renderBoundary(renderer, panel);
    expect(block.querySelector("button")).toBeNull();
    block.append(marker);
    renderBoundary(renderer, panel);
    expect(block.querySelector("button")?.textContent).toBe("Boundary");
    act(() => panel.setEnabled(false));
    renderBoundary(renderer, panel);
    expect(block.querySelector("button")?.textContent).toBe("Boundary");
    document.body.append(otherSurface);
    act(() => panel.setRoot(otherSurface));
    expect(block.querySelector("button")).toBeNull();
    act(() => panel.setRoot(surface));
    expect(first.isAttached()).toBe(false);
    renderBoundary(renderer, panel);
    expect(block.querySelector("button")?.textContent).toBe("Boundary");
    panel.mountedRoot!.detach();
    renderBoundary(renderer, panel);
    expect(block.querySelector("button")).toBeNull();
  } finally {
    act(() => renderer.unmount());
    panel.editor.destroy();
    await core.destroy();
    otherSurface.remove();
    surface.remove();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});

/**
 * Renders the marker under the test panel's actual mounting context.
 *
 * @param renderer - React root owning the table marker.
 * @param panel - Panel retaining the mounted Root.
 * @returns The marker and eligible portal have been committed.
 */
function renderBoundary(renderer: Root, panel: ReactPanel): void {
  act(() =>
    renderer.render(
      <TestPanel panel={panel}>
        <TableBlockBoundary className="marker" controls={<button>Boundary</button>} />
      </TestPanel>,
    ),
  );
}
