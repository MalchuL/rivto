/** Background explicitly owned by one block. */
export interface BlockBackgroundStyle {
  /** Explicit six- or eight-digit hexadecimal color. */
  readonly color?: string;
}

/** Typography applied to the visible text belonging to one block. */
export interface BlockTextStyle {
  /** Explicit six- or eight-digit hexadecimal color. */
  readonly color?: string;
  /** Font family name or family list. */
  readonly fontFamily?: string;
  /** Font size; a unitless value is interpreted as pixels. */
  readonly fontSize?: string;
  /** Font weight accepted by the browser. */
  readonly fontWeight?: number | "normal" | "bold";
  /** Line height; a unitless value is interpreted as pixels. */
  readonly lineHeight?: string;
  /** Text alignment within the block. */
  readonly alignment?: "left" | "right" | "center" | "justify" | "start" | "end";
}

/** Border explicitly owned by one block. */
export interface BlockBorderStyle {
  /** Explicit six- or eight-digit hexadecimal color. */
  readonly color?: string;
  /** Border thickness; a unitless value is interpreted as pixels. */
  readonly width?: string;
  /** Border line pattern. */
  readonly style?: "none" | "solid" | "dashed" | "dotted" | "double";
  /** Corner radius; a unitless value is interpreted as pixels. */
  readonly radius?: string;
}

/** Portable appearance of one block; it does not apply to descendant blocks. */
export interface BlockStyle {
  /** Own background, including an optional alpha channel. */
  readonly background?: BlockBackgroundStyle;
  /** Own text appearance. */
  readonly text?: BlockTextStyle;
  /** Own border appearance. */
  readonly border?: BlockBorderStyle;
}
