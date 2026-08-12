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
  version: 4;
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
 * Structural destination for a non-merging structured paste.
 *
 * Supported host-facing combinations:
 *
 * - Omit `placement`: derive placement from the current selection.
 * - `{ afterId: blockId }`: insert after that block in its sibling list. Omit
 *   `parentId` because the sibling determines the container.
 * - `{ parentId, afterId: null }`: insert as the parent's first children. The
 *   manager inserts before its existing first child, or inside an empty parent.
 *   Null is append to the start of the parent.
 * - `{ parentId: null, afterId: rootId }`: insert after an existing root block.
 * - `{ parentId: null, afterId: null }`: append at the document root. Null is
 *   append to the start of the document.
 */
export interface BlockPastePlacement {
  /**
   * Existing sibling after which roots are inserted.
   *
   * Set a block ID for sibling insertion. Set `null` with a non-null `parentId`
   * for first-child insertion; with `parentId: null`, `null` appends at the
   * document root. Omit it only when no explicit anchor is needed.
  */
  readonly afterId?: string | null;
  /**
   * Parent receiving inserted roots; `null` denotes the document root.
   *
   * A non-null value affects placement only with `afterId: null`. When `afterId`
   * names a sibling, omit this field because that sibling determines its parent.
   */
  readonly parentId?: string | null;
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
  /** Block type used for additional lines in a plain-text paste. Required when pasting plain text. */
  readonly defaultBlockType?: string;
  /** Structural destination already resolved by the host for whole-block paste. */
  readonly placement?: BlockPastePlacement;
}
