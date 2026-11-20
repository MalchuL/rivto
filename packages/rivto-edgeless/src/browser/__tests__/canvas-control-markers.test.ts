/** @jest-environment jsdom */
import { applyCanvasControlMarkers } from "../canvas-control-markers";

it("applies and removes host markers while preserving canvas accessibility markers", () => {
  const box = document.createElement("div");
  box.innerHTML =
    '<div data-canvas-resize-handle="se" aria-label="Resize se"></div><div data-canvas-rotation-handle="true"></div>';
  const resize = box.children[0];
  const rotate = box.children[1];
  const remove = applyCanvasControlMarkers(box, {
    box: { "data-editor-control": "", "data-edgeless-controls-for": "shape" },
    resizeHandle: "data-edgeless-resize-handle",
    rotationHandle: "data-edgeless-rotation-handle",
  });
  expect(box.getAttribute("data-edgeless-controls-for")).toBe("shape");
  expect(resize.getAttribute("data-edgeless-resize-handle")).toBe("se");
  expect(rotate.getAttribute("data-edgeless-rotation-handle")).toBe("true");
  remove();
  expect(box.hasAttribute("data-edgeless-controls-for")).toBe(false);
  expect(resize.hasAttribute("data-edgeless-resize-handle")).toBe(false);
  expect(rotate.hasAttribute("data-edgeless-rotation-handle")).toBe(false);
  expect(resize.getAttribute("data-canvas-resize-handle")).toBe("se");
  expect(resize.getAttribute("aria-label")).toBe("Resize se");
});
