/** Persisted color split into its base and alpha percentage. */
type BlockBackgroundColor = {
  /** Six-digit hex color without the alpha channel. */
  readonly color: string;
  /** Alpha as an integer percentage. */
  readonly alpha: number;
};

/**
 * Reads a persisted background color and its alpha percentage.
 *
 * @param value - Stored six- or eight-digit explicit hexadecimal color.
 * @returns Base color and alpha percentage, or undefined for an invalid value.
 */
export function parseBlockBackground(value: string): BlockBackgroundColor | undefined {
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (hex) {
    return {
      color: `#${hex[1]}`,
      alpha: hex[2] ? Math.round((parseInt(hex[2], 16) / 255) * 100) : 100,
    };
  }
  return undefined;
}

/**
 * Encodes alpha without changing the underlying palette color.
 *
 * @param color - A validated six-digit hexadecimal color.
 * @param alpha - Integer alpha percentage between zero and one hundred.
 * @returns A hexadecimal color including alpha when needed.
 */
export function formatBlockBackground(color: string, alpha: number): string {
  if (alpha === 100) {
    return color;
  }
  return `${color}${Math.round((alpha / 100) * 255)
    .toString(16)
    .padStart(2, "0")}`;
}
