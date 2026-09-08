/**
 * MIME type carrying Rivto's serialized lossless `ClipboardBundle`.
 *
 * Clipboard hosts should write this flavor alongside standard fallbacks and
 * prefer it during paste so hierarchy and custom block data survive round trips.
 */
export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";
