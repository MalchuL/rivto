/**
 * Stable clipboard protocol and core paste-strategy identifiers.
 *
 * Browser hosts use the MIME constant for portable data transfer. Core owns
 * only IDs for strategies it registers itself; extension IDs remain with their
 * registering extension.
 */
/** MIME type carrying Rivto's serialized lossless `ClipboardBundle`. */
export const RIVTO_CLIPBOARD_MIME = "application/x-rivto+json";

/** Registry ID for newline-splitting text paste. */
export const TEXT_PASTE_STRATEGY_ID = "paste.text";
/** Registry ID for text paste that preserves newline characters. */
export const PRESERVE_NEWLINES_PASTE_STRATEGY_ID = "paste.text.preserve-newlines";
/** Registry ID for structured block paste. */
export const BLOCK_PASTE_STRATEGY_ID = "paste.blocks";
