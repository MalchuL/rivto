import { Canvas } from "@chulane/rivto-edgeless";
import { toolPointer } from "./use-tool-gesture";

test("reads current canvas camera and snapping without viewport attributes", () => {
  const canvas = new Canvas();
  canvas.setCamera({ x: 90, y: -30, zoom: 1.5 });
  canvas.setSnapping({ grid: 24, snap: false, align: true });
  const root = { getBoundingClientRect: () => ({ left: 10, top: 20 }) } as HTMLElement;
  const event = {
    clientX: 250,
    clientY: 140,
    pointerId: 3,
    button: 0,
    shiftKey: false,
    altKey: true,
  };
  expect(toolPointer(event, root, 1.5, canvas)).toEqual({
    point: { x: 100, y: 100 },
    pointerId: 3,
    button: 0,
    shiftKey: false,
    zoom: 1.5,
    snapping: {
      snapToGrid: false,
      alignObjects: true,
      grid: 24,
      threshold: 8 / 1.5,
      disabled: true,
    },
  });
  canvas.setSnapping({ grid: 0, snap: true, align: false });
  expect(toolPointer(event, root, 1.5, canvas).snapping).toMatchObject({
    grid: undefined,
    snapToGrid: true,
    alignObjects: false,
  });
});
