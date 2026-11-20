/** @jest-environment ./jest-browser-environment.mjs */
import { attachTestBrowserEvents } from "../../../../../test-utils/attach-test-browser-events";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { Canvas } from "@chulane/rivto-edgeless";
import { BrowserEvents } from "@chulane/rivto-root/browser";
import { createTestCoreEditor, createTestReactEditor } from "../../../../../test-utils";
import { EdgelessTool } from "../../../../../managers/edgeless-tools/edgeless-tool";
import { EdgelessOperations } from "../../../../../managers/elements/edgeless-operations";
import { EdgelessCreationDefaults } from "../../../../../managers/elements/edgeless-creation-defaults";
import { useToolGesture } from "../use-tool-gesture";
import type { ToolGestureOptions } from "../types";

/**
 * Mounts the real tool gesture on a minimal pointer capture surface.
 *
 * @param props - Borrowed tool, viewport and cancellation dependencies.
 * @returns A surface forwarding pointer input to the gesture.
 */
function ToolSurface(props: ToolGestureOptions) {
  useToolGesture(props);
  return <div data-edgeless-tool-capture="" />;
}

/**
 * Creates a real visual tool with counters for delivered moves and cancellations.
 *
 * @returns Fixture owners, the configured tool, and its observed calls.
 */
async function createToolFixture() {
  const core = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor: core });
  const defaults = new EdgelessCreationDefaults(panel.editor);
  const operations = new EdgelessOperations(panel.editor, panel, defaults);
  const tool = new EdgelessTool({ id: "fixture", operations, defaults, reactPanel: panel });
  const calls = { moves: 0, cancellations: 0 };
  tool.pointerDown = () => true;
  tool.pointerMove = () => {
    calls.moves += 1;
  };
  tool.cancel = () => {
    calls.cancellations += 1;
    return true;
  };
  return { core, panel, tool, calls };
}

it("does not deliver an old captured move to a replacement attachment", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const { core, panel, tool, calls } = await createToolFixture();
  const events = new BrowserEvents();
  const viewport = { canvas: new Canvas(), events };
  const tools = {
    reactPanel: { keyboard: { register: () => () => {} }, subscribeDeactivation: () => () => {} },
  };
  let attached = true;
  const first = { clientToWorld: () => (attached ? { x: 1, y: 2 } : undefined) };
  const replacement = { clientToWorld: () => ({ x: 50, y: 60 }) };
  const props = { tool, tools, viewport, coordinates: first, zoom: 1 };
  const container = document.createElement("div");
  document.body.append(container);
  const detach = attachTestBrowserEvents(events, container);
  const renderer = createRoot(container);
  try {
    act(() => renderer.render(<ToolSurface {...props} />));
    const surface = container.firstElementChild;
    if (!(surface instanceof HTMLElement)) {
      throw new Error("Tool surface was not mounted");
    }
    container.setPointerCapture = () => {};
    container.hasPointerCapture = () => true;
    let releases = 0;
    container.releasePointerCapture = () => {
      releases += 1;
    };
    const down = new MouseEvent("pointerdown", { bubbles: true, cancelable: true });
    Object.defineProperty(down, "pointerId", { value: 7 });
    act(() => surface.dispatchEvent(down));
    const motion = new MouseEvent("pointermove", { bubbles: true });
    Object.defineProperty(motion, "pointerId", { value: 7 });
    act(() => {
      attached = false;
      renderer.render(<ToolSurface {...props} coordinates={replacement} />);
      surface.dispatchEvent(motion);
    });
    expect(calls.moves).toBe(0);
    expect(calls.cancellations).toBeGreaterThan(0);
    expect(releases).toBe(1);
  } finally {
    act(() => renderer.unmount());
    detach();
    container.remove();
    panel.editor.destroy();
    core.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
