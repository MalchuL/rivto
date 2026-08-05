import type { Block, DocumentElement, Link } from "../../store/document-model";

/**
 * Lossless Rivto clipboard representation.
 *
 * Unlike interoperable HTML and plain text, this flavor preserves hierarchy,
 * native block fields, custom properties, plugin data, and internal
 * links. Browser integrations serialize it under `RIVTO_CLIPBOARD_MIME`.
 */
export interface ClipboardBundle {
  /** Clipboard schema version, independent from document snapshot versions. */
  version: 3;
  /** Whether copied content begins with partial text; omission denotes structural blocks. */
  startsWithText?: boolean;
  /** Selected block subtrees preserving native types, props, and plugin data. */
  blocks: Block[];
  /** Links whose endpoints are both inside the copied block set. */
  links: Link[];
  /** Optional first-class canvas elements contributed by an edgeless host. */
  elements?: DocumentElement[];
  /** Top-level element IDs that should be selected after an edgeless paste. */
  selectedElementIds?: string[];
  /** Optional lossless namespaces contributed by installed editor plugins. */
  pluginData?: Record<string, unknown>;
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
  /** Markdown source preserving descendants as nested lists. */
  markdown: string;
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
  /** Keep plain-text newline characters inside one block instead of creating siblings. */
  readonly preserveNewlines?: boolean;
  /** Block type used for additional lines in a plain-text paste. */
  readonly defaultBlockType?: string;
}
