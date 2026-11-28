/** Named background palette controls; names are not stored in block data. */
export const DEFAULT_BLOCK_BACKGROUND_COLORS = [
  "",
  "gray",
  "transparent",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

/** Concrete palette colors; persisted blocks never depend on CSS variable names. */
export const DEFAULT_BLOCK_PALETTE_COLORS: Readonly<Record<string, string>> = {
  red: "#fcdddd",
  orange: "#fee6d5",
  yellow: "#fbf1d3",
  green: "#d7f5e2",
  blue: "#dce9fd",
  purple: "#efe0fe",
};
