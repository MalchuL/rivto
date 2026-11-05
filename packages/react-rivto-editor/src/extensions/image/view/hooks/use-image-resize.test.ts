import { calculateImageResize } from "./use-image-resize";

const start = { width: 100, height: 50, maxWidth: 150, pointerId: 1, x: 0, y: 0 };

test("constrains proportional resize to parent width and minimum image size", () => {
  expect(
    calculateImageResize(start, { clientX: 100, clientY: 0, shiftKey: false }, "letterbox"),
  ).toEqual({ width: 150, height: 75 });
  expect(
    calculateImageResize(start, { clientX: -100, clientY: 0, shiftKey: false }, "letterbox"),
  ).toEqual({ width: 48, height: 24 });
});

test("allows independent width and height changes when Shift is held", () => {
  expect(
    calculateImageResize(start, { clientX: 20, clientY: -100, shiftKey: true }, "letterbox"),
  ).toEqual({ width: 120, height: 24 });
});
