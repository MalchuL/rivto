import type { BlockManagerApi } from "@chulane/rivto";
import { isBlockStyle } from "./block-style";

/** Explicit default background stored for colored containers. */
export const CONTAINER_DEFAULT_BACKGROUND = "#eceef6";

/**
 * Creates a block-owned processor that fills a container's missing background.
 *
 * Existing style properties and explicit transparent or colored backgrounds are preserved.
 * A non-object style is left untouched because it cannot be merged safely.
 *
 * @param type - Native container type receiving the default.
 * @returns Processor for creation and type conversion.
 */
export function createContainerBackgroundProcessor(
  type: string,
): Parameters<BlockManagerApi["registerProcessor"]>[0] {
  return {
    id: `${type}.background`,
    priority: 0,
    /**
     * Supplies the initial color only when the input has no explicit background.
     *
     * @param block - Input being created or converted.
     * @returns Original input or a copy with the initial style background.
     */
    processor: (block) => {
      if (block.type !== type) {
        return block;
      }
      const style = block.listProps?.style;
      if (style !== undefined && !isBlockStyle(style)) {
        return block;
      }
      if (typeof style?.background?.color === "string") {
        return block;
      }
      return {
        ...block,
        listProps: {
          ...block.listProps,
          style: {
            ...style,
            background: {
              ...(typeof style?.background === "object" &&
              style.background !== null &&
              !Array.isArray(style.background)
                ? style.background
                : {}),
              color: CONTAINER_DEFAULT_BACKGROUND,
            },
          },
        },
      };
    },
  };
}

/** Named background palette controls; names are not stored in block data. */
export const BLOCK_BACKGROUND_COLORS = [
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
export const BLOCK_PALETTE_COLORS: Readonly<Record<string, string>> = {
  red: "#fcdddd",
  orange: "#fee6d5",
  yellow: "#fbf1d3",
  green: "#d7f5e2",
  blue: "#dce9fd",
  purple: "#efe0fe",
};

/** Persisted color split into its base and alpha percentage. */
export interface BlockBackgroundColor {
  /** Six-digit hex color without the alpha channel. */
  readonly color: string;
  /** Alpha as an integer percentage. */
  readonly alpha: number;
}

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
