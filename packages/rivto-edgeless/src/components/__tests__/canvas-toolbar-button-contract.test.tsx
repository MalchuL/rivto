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
import type { CanvasToolButtonProps } from "../../types/toolbar";
import { CanvasToolbar } from "../canvas-toolbar";
import { CanvasToolButton } from "../canvas-toolbar-layout";

it("supplies semantic activation and tool identity to custom toolbar buttons", () => {
  const registry = new CanvasToolRegistry<ReactCanvasToolRegistration, ReactCanvasToolGroupEntry>();
  registry.registerTool({
    id: "draw",
    title: "Draw",
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
  let received: CanvasToolButtonProps | undefined;
  /**
   * Observes the custom button contract while rendering the shared browser button.
   *
   * @param props - Semantic toolbar presentation and activation data.
   * @returns The shared button for actual click behavior.
   */
  function Button(props: CanvasToolButtonProps) {
    received = props;
    return <CanvasToolButton {...props} />;
  }
  try {
    act(() => view.render(<CanvasToolbar registry={registry} tools={tools} Button={Button} />));
    expect(received?.toolId).toBe("draw");
    expect(received).not.toHaveProperty("onClick");
    expect(received).not.toHaveProperty("onPointerDown");
    const button = container.querySelector<HTMLButtonElement>('[data-canvas-tool="draw"]')!;
    act(() => button.click());
    expect(tools.active?.id).toBe("draw");
  } finally {
    act(() => view.unmount());
    stop();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
