/** Registration identities owned by the built-in visual tools. */
export const VISUAL_TOOL_IDS = {
  select: "select",
  pan: "pan",
  rectangle: "rectangle",
  ellipse: "ellipse",
  text: "text",
  pencil: "pencil",
  pen: "pen",
  marker: "marker",
  eraser: "eraser",
} as const;
/** Persisted types referenced by the built-in tool implementations. */
export const VISUAL_ELEMENT_TYPES = {
  rectangle: "rectangle",
  ellipse: "ellipse",
  text: "text",
  sticker: "sticker",
  drawing: "drawing",
  connector: "connector",
  group: "group",
} as const;
/** Shared settings groups installed by the visual extension. */
export const VISUAL_TOOL_GROUPS = {
  shapes: "shapes",
  text: "text",
  stickers: "stickers",
  drawing: "drawing",
  connectors: "connectors",
} as const;
