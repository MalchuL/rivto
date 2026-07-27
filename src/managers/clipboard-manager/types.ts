import type { Block, Link } from "../../store/document-model";

/**
 * Lossless Rivto clipboard representation.
 *
 * Unlike interoperable HTML and plain text, this flavor preserves hierarchy,
 * native block fields, custom properties, plugin data, layout, and internal
 * links. Browser integrations serialize it under `RIVTO_CLIPBOARD_MIME`.
 */
export interface ClipboardBundle {
  /** Clipboard schema version, independent from document snapshot versions. */
  version: 1;
  /** Whether copied content begins with partial text; omitted legacy bundles mean blocks. */
  startsWithText?: boolean;
  /** Selected block subtrees preserving native types, props, plugin data, and layout. */
  blocks: Block[];
  /** Links whose endpoints are both inside the copied block set. */
  links: Link[];
}

/**
 * Host-independent clipboard flavors produced from one editor selection.
 *
 * Core never accesses `ClipboardEvent` or `DataTransfer`; React or another host
 * writes these values to the platform clipboard synchronously.
 */
export interface ClipboardPayload {
  /** Lossless Rivto representation. */
  bundle: ClipboardBundle;
  /** Interoperable HTML fallback. */
  html: string;
  /** Universal plain-text fallback. */
  text: string;
}

/**
 * Host-independent values accepted by `ClipboardManager.paste`.
 *
 * Precedence is `bundle`, serialized `structured`, then `text`. Browser objects
 * intentionally do not appear in this interface, keeping core DOM-free.
 */
export interface ClipboardPasteInput {
  /** Already parsed lossless Rivto data. Takes precedence over every fallback. */
  readonly bundle?: ClipboardBundle;
  /** Serialized lossless Rivto data, normally read from `RIVTO_CLIPBOARD_MIME`. */
  readonly structured?: string;
  /** Universal plain-text fallback used when structured data is unavailable. */
  readonly text?: string;
  /** Whether copied partial text may merge into an active text selection. */
  readonly mergeText?: boolean;
  /** Block type used for additional lines in a plain-text paste. */
  readonly defaultBlockType?: string;
}
