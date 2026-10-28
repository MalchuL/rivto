/** @jest-environment jsdom */
import { jest } from "@jest/globals";
import { CanvasMarquee } from "./canvas-marquee";
import { Canvas } from "../core/canvas";

test.each([2, 2000])(
  "captures %i bounds once, preserves additive groups, and releases the overlay",
  (count) => {
    const node = document.createElement("div");
    const capture = jest.fn(() =>
      Array.from({ length: count }, (_, index) => ({
        id: index < 2 ? "group" : String(index),
        rect: { x: index * 20, y: 0, width: 10, height: 10 },
      })),
    );
    const select = jest.fn<(ids: readonly string[]) => void>();
    const marquee = new CanvasMarquee(node, { capture, select });
    marquee.start(-5, -5, ["base"]);
    expect(marquee.move(-4, -4)).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(node.isConnected).toBe(false);
    expect(marquee.move(30, 10)).toBe(true);
    expect(select).toHaveBeenLastCalledWith(["base", "group"]);
    expect(node.isConnected).toBe(true);
    marquee.move(10, 10);
    expect(capture).toHaveBeenCalledTimes(1);
    expect(node.style.width).toBe("15px");
    marquee.stop();
    expect(node.style.display).toBe("none");
    expect(marquee.move(50, 50)).toBe(false);
    marquee.start(10, 10, []);
    marquee.move(-5, -5);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(select).toHaveBeenLastCalledWith(["group"]);
    marquee.destroy();
    marquee.destroy();
    expect(node.isConnected).toBe(false);
  },
);

test("snapshot includes offscreen geometry and excludes unselectable objects", () => {
  const canvas = new Canvas();
  canvas.setElements([
    { id: "far", frame: { x: 10000, y: 20000, width: 20, height: 30 }, rotation: 0, zIndex: 0 },
    {
      id: "disabled",
      frame: { x: 0, y: 0, width: 20, height: 30 },
      rotation: 0,
      zIndex: 0,
      selectable: false,
    },
  ]);
  const root = document.createElement("div");
  const measure = jest.spyOn(root, "getBoundingClientRect");
  expect(CanvasMarquee.snapshot(root, canvas)).toEqual([
    { id: "far", rect: { x: 10000, y: 20000, width: 20, height: 30 } },
  ]);
  expect(measure).toHaveBeenCalledTimes(1);
});
