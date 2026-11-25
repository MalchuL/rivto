/** Persisted block type for authored HTML, CSS and JavaScript. Source lives in `content`. */
export const HTML_BLOCK_TYPE = "html";

/** Persisted block type for HTML that the user may grant editor access. */
export const UNSAFE_HTML_BLOCK_TYPE = "unsafe-html";

/** Persisted canvas element type for authored HTML. Source lives in `props.html`. */
export const HTML_ELEMENT_TYPE = "html";

/** Discriminator on every message exchanged between the host and a widget document. */
export const HTML_CHANNEL = "rivto-html";

/** Upper bound for an auto-sized Page block iframe, in CSS pixels. */
export const MAX_AUTO_FRAME_HEIGHT = 720;

/** Upper bound for drag regions reported by one widget document. */
export const MAX_DRAG_REGIONS = 64;

/** Short reference for the widget script API, shown next to source fields. */
export const HTML_EDIT_HINT =
  "Scripts call rivto.ready() for this node. Blocks expose props, listProps, content, pluginData, and childIds. Elements expose props, frame, zIndex, and childIds. rivto.setProp(key, value) writes one property.";
