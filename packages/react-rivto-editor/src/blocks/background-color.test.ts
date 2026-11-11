import {
  BLOCK_PALETTE_COLORS,
  formatBlockBackground,
  parseBlockBackground,
} from "./background-color";

test("concrete palette colors round-trip with alpha without stored CSS tokens", () => {
  for (const color of Object.values(BLOCK_PALETTE_COLORS)) {
    expect(parseBlockBackground(formatBlockBackground(color, 50))).toEqual({ color, alpha: 50 });
  }
  expect(parseBlockBackground("red@50")).toBeUndefined();
  expect(parseBlockBackground("var(--rivto-block-red)")).toBeUndefined();
});
