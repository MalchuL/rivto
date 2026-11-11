import { CheckIcon, SlashIcon } from "lucide-react";
import type { CSSProperties, ReactElement, ReactNode } from "react";

/** Stable persisted block background tokens; empty means the theme default. */
export const BLOCK_BACKGROUND_COLORS = [
  "",
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "purple",
] as const;

/** Props for the shared block color swatches. */
export interface BlockColorPaletteProps {
  /** Current token, or undefined for a mixed selection. */
  readonly value?: string;
  /** Whether to offer explicit transparency alongside the theme default. */
  readonly includeTransparent?: boolean;
  /** Accessible name for the group of swatches. */
  readonly label: string;
  /**
   * Publishes the selected color without writing to a document.
   *
   * @param value - Chosen token; empty selects the theme default.
   * @returns Completes the caller's selection action.
   */
  readonly onChange: (value: string) => void;
  /**
   * Wraps a swatch for an owning menu or other control.
   *
   * @param value - Persisted token represented by this button.
   * @param button - Swatch button to render inside the wrapper.
   * @returns The wrapped swatch.
   */
  readonly renderItem?: (value: string, button: ReactElement) => ReactNode;
}

/** Inline color token consumed by the existing swatch hover styles. */
interface BlockColorSwatchStyle extends CSSProperties {
  readonly "--block-background": string;
}

/**
 * Renders the editor's block color swatches without owning their persistence.
 *
 * The optional wrapper lets a dropdown supply menu keyboard behavior while a
 * popover can use ordinary buttons. Default and transparent remain distinct.
 *
 * @param props - Selected token, accessible group name, and selection callback.
 * @param props.value - Current selected token, or undefined for mixed values.
 * @param props.includeTransparent - Adds an explicit transparent choice when true.
 * @param props.label - Accessible name of the color group.
 * @param props.onChange - Receives the chosen persisted token.
 * @param props.renderItem - Optional wrapper for each token and its button.
 * @returns A group of focusable swatches.
 */
export function BlockColorPalette({
  value,
  includeTransparent,
  label,
  onChange,
  renderItem,
}: BlockColorPaletteProps) {
  const colors = includeTransparent
    ? ["", "transparent", ...BLOCK_BACKGROUND_COLORS.slice(1)]
    : BLOCK_BACKGROUND_COLORS;
  return (
    <div role="group" aria-label={label} className="block-color-swatches">
      {colors.map((color) => {
        const selected = value === color;
        const style: BlockColorSwatchStyle = {
          backgroundColor: "var(--block-background)",
          "--block-background":
            color && color !== "transparent" ? `var(--rivto-block-${color})` : "transparent",
        };
        const button = (
          <button
            type="button"
            className="block-color-swatch rounded-full p-0"
            aria-label={color || "Default"}
            title={color || "Default"}
            aria-pressed={selected}
            style={style}
            onClick={() => onChange(color)}
          >
            {!color && <SlashIcon aria-hidden="true" />}
            {color === "transparent" && <span aria-hidden="true">∅</span>}
            {color && color !== "transparent" && selected && <CheckIcon aria-hidden="true" />}
          </button>
        );
        return <span key={color}>{renderItem ? renderItem(color, button) : button}</span>;
      })}
    </div>
  );
}
