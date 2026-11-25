import { clampFrameHeight } from "../use-html-frame";

test("allows small iframe heights while bounding invalid and oversized measurements", () => {
  expect(clampFrameHeight(0)).toBe(0);
  expect(clampFrameHeight(24.4)).toBe(24);
  expect(clampFrameHeight(-1)).toBe(0);
  expect(clampFrameHeight(900)).toBe(720);
});
