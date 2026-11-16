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

/** Preferred block dimensions and behavior when content exceeds them. */
export interface BlockSizeStyle {
  /** Preferred width; a unitless value is interpreted as pixels. */
  readonly width?: string;
  /** Grow from the preferred width, or retain it and scroll or clip horizontal overflow. */
  readonly widthPolicy?: "grow" | "scroll" | "clip";
  /** Height or minimum height; a unitless value is interpreted as pixels. */
  readonly height?: string;
  /** Grow beyond height by default, or use a fixed height with scrolling or clipping. */
  readonly heightPolicy?: "grow" | "scroll" | "clip";
}

/**
 * Portable appearance of one block supplied by the host adapter.
 *
 * Rivto's document host stores this data in `listProps.style`; other hosts may
 * use their own storage. This describes recognized fields, not validation of persisted data. Unknown
 * or malformed fields may also be present and must be checked by consumers.
 * A block's own appearance does not apply to descendant blocks.
 */
export interface BlockStyle {
  /** Own background, including an optional alpha channel. */
  readonly background?: BlockBackgroundStyle;
  /** Own text appearance. */
  readonly text?: BlockTextStyle;
  /** Own border appearance. */
  readonly border?: BlockBorderStyle;
  /** Own dimensions and overflow behavior. */
  readonly size?: BlockSizeStyle;
}
