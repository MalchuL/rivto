import type { BlockListType } from "../src";

/** List choices used by the demo host; not a second package registry. */
export const LIST_TYPES: readonly BlockListType[] = [
  "list",
  "checkbox",
  "numbered_list",
  "start_numbered_list",
  "continue_numbered_list",
];

/** A named example background resolved by the host before reaching Page. */
export interface DemoBackground {
  /** Label and select value used only by the example controls. */
  readonly name: string;
  /** Resolved CSS expression supplied to the Page node command. */
  readonly value: string;
}

/** Demo-owned choices; Page receives only their ready-to-use CSS values. */
export const BACKGROUND_COLORS: readonly DemoBackground[] = [
  {
    name: "gray",
    value: "var(--demo-color-gray, color-mix(in srgb, #64748b 18%, var(--rivto-background, #fff)))",
  },
  {
    name: "red",
    value: "var(--demo-color-red, color-mix(in srgb, #ef4444 18%, var(--rivto-background, #fff)))",
  },
  {
    name: "orange",
    value:
      "var(--demo-color-orange, color-mix(in srgb, #f97316 18%, var(--rivto-background, #fff)))",
  },
  {
    name: "yellow",
    value:
      "var(--demo-color-yellow, color-mix(in srgb, #eab308 18%, var(--rivto-background, #fff)))",
  },
  {
    name: "green",
    value:
      "var(--demo-color-green, color-mix(in srgb, #22c55e 18%, var(--rivto-background, #fff)))",
  },
  {
    name: "blue",
    value: "var(--demo-color-blue, color-mix(in srgb, #3b82f6 18%, var(--rivto-background, #fff)))",
  },
  {
    name: "purple",
    value:
      "var(--demo-color-purple, color-mix(in srgb, #a855f7 18%, var(--rivto-background, #fff)))",
  },
];
