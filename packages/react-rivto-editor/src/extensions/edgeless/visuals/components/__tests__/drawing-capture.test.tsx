/** @jest-environment ./jest-browser-environment.mjs */
import { act, createRef } from "react";
import { createRoot } from "react-dom/client";
import type { CanvasApi } from "@chulane/rivto-edgeless";
import { createTestCoreEditor, createTestReactEditor, TestPanel } from "../../../../../test-utils";
import {
  EdgelessToolsProvider,
  useEdgelessCanvas,
} from "../../../../../surfaces/edgeless/edgeless-tools-context";
import { DrawingCapture } from "../drawing-capture";

it("updates capture geometry from the owning camera and stops after unmount", async () => {
  const environment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
  const previous = environment.IS_REACT_ACT_ENVIRONMENT;
  environment.IS_REACT_ACT_ENVIRONMENT = true;
  const editor = await createTestCoreEditor();
  const panel = createTestReactEditor({ editor });
  const container = document.createElement("div");
  const root = createRoot(container);
  const canvasRef = createRef<CanvasApi>();
  /**
   * Captures the surface-owned canvas for this fixture.
   *
   * @returns The drawing layer subscribed to that same canvas.
   */
  function Surface() {
    canvasRef.current = useEdgelessCanvas();
    return <DrawingCapture />;
  }
  try {
    act(() =>
      root.render(
        <TestPanel panel={panel}>
          <EdgelessToolsProvider>
            <Surface />
          </EdgelessToolsProvider>
        </TestPanel>,
      ),
    );
    const capture = container.querySelector("svg");
    if (!canvasRef.current || !capture) {
      throw new Error("Expected a canvas and drawing capture");
    }
    const camera = canvasRef.current;
    act(() => camera.setCamera({ x: 80, y: -20, zoom: 2 }));
    expect(capture.style.getPropertyValue("--edgeless-capture-left")).toBe("-40px");
    expect(capture.style.getPropertyValue("--edgeless-capture-top")).toBe("10px");
    expect(capture.style.getPropertyValue("--edgeless-capture-width")).toBe("50%");
    act(() => root.unmount());
    act(() => camera.setCamera({ x: 0, y: 0, zoom: 1 }));
    expect(capture.style.getPropertyValue("--edgeless-capture-left")).toBe("-40px");
  } finally {
    act(() => root.unmount());
    await panel.editor.destroy();
    await editor.destroy();
    environment.IS_REACT_ACT_ENVIRONMENT = previous;
  }
});
