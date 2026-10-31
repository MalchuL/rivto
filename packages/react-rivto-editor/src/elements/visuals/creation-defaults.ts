const DEFAULT_FONT = "Inter, ui-sans-serif, system-ui, sans-serif";
/** Built-in brush presets; stroke widths are canvas units and opacity ranges from zero to one. */
export const drawingDefaults = {
  pencil: { stroke: "#3f3f46", strokeWidth: 2, opacity: 0.68 },
  pen: { stroke: "#18181b", strokeWidth: 3, opacity: 1 },
  marker: { stroke: "#facc15", strokeWidth: 16, opacity: 0.34 },
} as const;

/**
 * Returns fresh built-in creation defaults, independent of mounted panels and session choices.
 *
 * Element definitions and toolbar groups use these values as their starting styles.
 * A surface can remember later style changes separately; changing those settings does
 * not mutate these defaults. The text tool supplies its initial label in its preset,
 * so the text category here contains appearance only.
 *
 * @returns Independent mutable category objects; dimensions are canvas units and opacity is a zero-to-one fraction.
 */
export function createEdgelessDefaults() {
  return {
    shape: {
      fill: "#eeeaff",
      stroke: "#6c5ce7",
      strokeWidth: 2,
      filled: true,
      stroked: true,
      text: "",
      color: "#222222",
      fontFamily: DEFAULT_FONT,
      fontSize: 16,
      align: "center" as const,
      verticalAlign: "middle" as const,
    },
    text: {
      color: "#222222",
      fontFamily: DEFAULT_FONT,
      fontSize: 24,
      align: "left" as const,
      verticalAlign: "top" as const,
    },
    sticker: {
      fill: "#fff2a8",
      color: "#3f3515",
      fontFamily: DEFAULT_FONT,
      fontSize: 22,
      align: "left" as const,
      verticalAlign: "top" as const,
    },
    drawing: { brush: "pen" as const, ...drawingDefaults.pen },
    connector: {
      route: "straight" as const,
      stroke: "#52525b",
      strokeWidth: 2,
      opacity: 1,
      lineStyle: "solid" as const,
      startStyle: "none" as const,
      endStyle: "arrow" as const,
      text: "",
      textRotation: "horizontal" as const,
      color: "#222222",
      fontFamily: DEFAULT_FONT,
      fontSize: 14,
      align: "center" as const,
      verticalAlign: "middle" as const,
    },
  };
}
