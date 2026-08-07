import type { EdgelessFontOption, EdgelessStickerOption } from "./types";

/** Built-in font choices for text and sticky creation defaults. */
export const DEFAULT_FONTS: readonly EdgelessFontOption[] = [
  { label: "Sans", fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif" },
  { label: "Serif", fontFamily: "Georgia, Cambria, serif" },
  { label: "Mono", fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" },
];

/** Built-in sticky color presets. */
export const DEFAULT_STICKERS: readonly EdgelessStickerOption[] = [
  { id: "yellow", label: "Yellow sticky", fill: "#fff2a8", color: "#3f3515" },
  { id: "pink", label: "Pink sticky", fill: "#ffd9e8", color: "#5b2439" },
  { id: "blue", label: "Blue sticky", fill: "#dcecff", color: "#173d68" },
  { id: "green", label: "Green sticky", fill: "#dff5df", color: "#214f2a" },
];
