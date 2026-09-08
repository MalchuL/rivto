import { canvasPoint } from "./canvas-point";

describe("canvasPoint", () => {
  test("uses viewport pan and zoom instead of transformed child bounds", () => {
    const viewport = {
      dataset: { edgelessZoom: "1.5", edgelessPanX: "90", edgelessPanY: "-30" },
      getBoundingClientRect: () => ({ left: 10, top: 20 }),
    } as unknown as HTMLElement;
    expect(canvasPoint({ clientX: 250, clientY: 140 }, viewport, 1)).toEqual({ x: 100, y: 100 });
  });
});
