import { clampFrameHeight } from "../use-html-frame";

test("allows small iframe heights while bounding invalid and oversized measurements", () => {
  expect(clampFrameHeight(0, 720)).toBe(0);
  expect(clampFrameHeight(24.4, 720)).toBe(24);
  expect(clampFrameHeight(-1, 720)).toBe(0);
  expect(clampFrameHeight(900, 720)).toBe(720);
  expect(clampFrameHeight(900, 1200)).toBe(900);
  expect(clampFrameHeight(900, 300)).toBe(300);
});
