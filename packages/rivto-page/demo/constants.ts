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
    value: "#e3e6ea",
  },
  {
    name: "red",
    value: "#fcdddd",
  },
  {
    name: "orange",
    value: "#fee6d5",
  },
  {
    name: "yellow",
    value: "#fbf1d3",
  },
  {
    name: "green",
    value: "#d7f5e2",
  },
  {
    name: "blue",
    value: "#dce9fd",
  },
  {
    name: "purple",
    value: "#efe0fe",
  },
];
