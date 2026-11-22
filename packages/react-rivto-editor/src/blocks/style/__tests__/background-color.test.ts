import { DEFAULT_BLOCK_PALETTE_COLORS } from "../background-color-constants";
import {
  createContainerBackgroundProcessor,
  formatBlockBackground,
  parseBlockBackground,
} from "../background-color";

test("uses a container's configured default only when the block has no color", () => {
  const { processor } = createContainerBackgroundProcessor("bento", "#abcdef");
  expect(processor({ type: "bento" }, {}).listProps?.style).toEqual({
    background: { color: "#abcdef" },
  });
  const explicit = { type: "bento", listProps: { style: { background: { color: "#00000000" } } } };
  expect(processor(explicit, {})).toBe(explicit);
});

test("concrete palette colors round-trip with alpha without stored CSS tokens", () => {
  for (const color of Object.values(DEFAULT_BLOCK_PALETTE_COLORS)) {
    expect(parseBlockBackground(formatBlockBackground(color, 50))).toEqual({ color, alpha: 50 });
  }
  expect(parseBlockBackground("red@50")).toBeUndefined();
  expect(parseBlockBackground("var(--rivto-block-red)")).toBeUndefined();
});
