import { canvasPoint } from "./canvas-point";
import { Canvas } from "@chulane/rivto-edgeless";

describe("canvasPoint", () => {
  test("uses viewport pan and zoom instead of transformed child bounds", () => {
    const viewport = {
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as unknown as HTMLElement;
    const canvas = new Canvas();
    canvas.setCamera({ x: 90, y: -30, zoom: 1.5 });
    expect(canvasPoint({ clientX: 250, clientY: 140 }, viewport, canvas)).toEqual({
      x: 100,
      y: 100,
    });
    expect(canvasPoint({ clientX: 250, clientY: 140 }, null, canvas)).toEqual({ x: 0, y: 0 });
  });
});
