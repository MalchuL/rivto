/** @jest-environment jsdom */
import { act } from "react";
import { createRoot } from "react-dom/client";
import { CanvasTool } from "../../core/tools/canvas-tool";
import { CanvasToolContext } from "../../core/tools/canvas-tool-context";
import { CanvasToolRegistry } from "../../core/tools/canvas-tool-registry";
import type {
  ReactCanvasToolGroupEntry,
  ReactCanvasToolRegistration,
} from "../../types/react-tool-registry";
import { CanvasToolbar } from "../canvas-toolbar";

it("applies registered button presentation and activates the selected tool", () => {
  const registry = new CanvasToolRegistry<ReactCanvasToolRegistration, ReactCanvasToolGroupEntry>();
  registry.registerTool({
    id: "draw",
    title: "Draw",
    className: "custom-tool",
    createTool: (options) => new CanvasTool(options),
  });
  const tools = new CanvasToolContext({
    registry,
    createGroup: (registration) => ({ registration }),
    createTool: (registration, group) => registration.createTool({ id: registration.id, group }),
  });
  const stop = tools.observeChanges();
  const container = document.createElement("div");
  const view = createRoot(container);
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  try {
    act(() => view.render(<CanvasToolbar registry={registry} tools={tools} />));
    const button = container.querySelector<HTMLButtonElement>('button[aria-label="Draw"]')!;
    expect(button.classList.contains("custom-tool")).toBe(true);
    act(() => button.click());
    expect(tools.active?.id).toBe("draw");
  } finally {
    act(() => view.unmount());
    stop();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
