/** Persisted type of HTML widget blocks. The widget's HTML, CSS and JavaScript live in `content`. */
export const HTML_BLOCK_TYPE = "html";

/** Persisted block type for HTML that the user may grant editor access. */
export const UNSAFE_HTML_BLOCK_TYPE = "unsafe-html";

/** Persisted type of HTML widget canvas elements. The widget's HTML lives in `props.html`. */
export const HTML_ELEMENT_TYPE = "html";

/**
 * Namespace tag of every message between the editor and a widget iframe.
 *
 * The iframe's first message (`ready`) travels over the shared `window`
 * `postMessage` bus, which browser extensions, devtools and other iframes also
 * use; the tag lets both sides skip their messages. It is not a secret: the
 * per-page token is what proves who sent a message.
 */
export const HTML_IFRAME_MESSAGE_NAMESPACE = "rivto-html";
