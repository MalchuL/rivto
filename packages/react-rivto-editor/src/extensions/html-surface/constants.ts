/** Persisted type of HTML widget blocks. The widget's HTML, CSS and JavaScript live in `content`. */
export const HTML_BLOCK_TYPE = "html";

/** Persisted block type for HTML that the user may grant editor access. */
export const UNSAFE_HTML_BLOCK_TYPE = "unsafe-html";

/** Persisted type of HTML widget canvas elements. The widget's HTML lives in `props.html`. */
export const HTML_ELEMENT_TYPE = "html";

/** Marker carried by every message between the editor and a widget page, so unrelated messages are ignored. */
export const HTML_CHANNEL = "rivto-html";

/** Short reference for the widget script API, shown next to source fields. */
export const HTML_EDIT_HINT =
  "Scripts call rivto.ready() for this node. Blocks expose props, listProps, content, pluginData, and childIds. Elements expose props, frame, zIndex, and childIds. rivto.setProp(key, value) writes one property.";
