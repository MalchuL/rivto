/** Dimensions shared by tools in one creation group; positions and rotations remain explicit. */
export const REMEMBERED_FRAME_FIELDS = ["width", "height"] as const;
/** Shape appearance shared by rectangles and ellipses; authored labels are excluded. */
export const SHAPE_REMEMBERED_PROPERTIES = [
  "fill",
  "stroke",
  "strokeWidth",
  "filled",
  "stroked",
  "color",
  "fontFamily",
  "fontSize",
  "align",
  "verticalAlign",
] as const;
/** Rectangle-only styling, never inherited by ellipses in the same group. */
export const RECTANGLE_REMEMBERED_PROPERTIES = ["cornerRadius"] as const;
/** Text appearance without its authored content. */
export const TEXT_REMEMBERED_PROPERTIES = [
  "color",
  "fontFamily",
  "fontSize",
  "align",
  "verticalAlign",
] as const;
/** Sticky appearance, including paper color but excluding its authored content. */
export const STICKER_REMEMBERED_PROPERTIES = ["fill", ...TEXT_REMEMBERED_PROPERTIES] as const;
/** Freehand style; point geometry and pressure samples are never remembered. */
export const DRAWING_REMEMBERED_PROPERTIES = ["brush", "stroke", "strokeWidth", "opacity"] as const;
/** Connector appearance and routing, excluding endpoints and authored labels. */
export const CONNECTOR_REMEMBERED_PROPERTIES = [
  "route",
  "stroke",
  "strokeWidth",
  "opacity",
  "lineStyle",
  "startStyle",
  "endStyle",
  "textRotation",
  ...TEXT_REMEMBERED_PROPERTIES,
] as const;
