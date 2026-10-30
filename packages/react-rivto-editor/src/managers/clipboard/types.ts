import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockNode,
  EditorElementInput,
  EditorElementNode,
  PasteStrategy,
} from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";

/** Fields owned by a block converter; identity, type and children belong to clipboard. */
export type BlockClipboardFields = Pick<
  EditorBlock,
  "content" | "props" | "listProps" | "pluginData"
>;

/** Fields owned by an element converter; clipboard places and identifies the resulting element. */
export type ElementClipboardFields = Pick<EditorElementNode, "props">;

/** Source information shared by a single copy, cut, or duplicate operation. */
export interface ClipboardCopyContext {
  readonly operation: "copy" | "cut" | "duplicate";
  readonly sourceDocumentId: string;
  /** Omitted for document-only programmatic copy. */
  readonly reactPanel?: ReactPanelApi;
  /** Ordered block siblings represented by this source panel. */
  readonly rootBlockIds: readonly string[];
}

/** Destination identities are allocated before any converter runs or document write occurs. */
export interface ClipboardPasteContext {
  readonly operation: "paste" | "duplicate";
  readonly sourceDocumentId?: string;
  readonly destinationDocumentId: string;
  /** Receiving mounted panel, absent for document-only programmatic operations. */
  readonly reactPanel?: ReactPanelApi;
  /** Source IDs mapped to prepared destination IDs; text merge may reuse an existing block. */
  readonly blockIdMap: ReadonlyMap<string, string>;
  /** Source IDs mapped to new element IDs; omitted empty block cards have no entry. */
  readonly elementIdMap: ReadonlyMap<string, string>;
  /** Canvas translation in document units, applied once by clipboard. */
  readonly offset: { readonly x: number; readonly y: number };
  /** Source block roots in clipboard order, used to resolve copied card ranges. */
  readonly sourceRootBlockIds: readonly string[];
}

/** Detached creation inputs returned by external format parsers. */
export interface ClipboardContent {
  readonly blocks?: readonly EditorBlockInput[];
  readonly elements?: readonly EditorElementInput[];
}

/** Surface and fallback block type used while parsing external content. */
export interface ClipboardParseContext {
  readonly surface: "page" | "edgeless";
  readonly defaultBlockType: string;
}

export interface ClipboardParsers {
  /**
   * Accepts an entire detached HTML subtree, including its children. Returning
   * undefined lets the next parser try it; an empty result deliberately consumes it.
   * Page parsers must return blocks. Edgeless parsers may also return elements.
   */
  readonly parseHTML?: (
    element: Element,
    context: ClipboardParseContext,
  ) => ClipboardContent | undefined;
  /** Accepts a complete plain-text value, or returns undefined to keep the normal fallback. */
  readonly parseText?: (
    text: string,
    context: ClipboardParseContext,
  ) => ClipboardContent | undefined;
}

/**
 * Optional synchronous operations for one block type. Methods must not write the document.
 * Copy and paste receive detached fields and child IDs, never a live model record.
 * Return only changed fields; omitted fields retain their value. An exception aborts
 * preparation before clipboard insertion or deletion. Type, identity and child order
 * are assigned by the shared clipboard code and cannot be replaced by these hooks.
 */
export interface BlockClipboardConverter extends ClipboardParsers {
  /** Returns replacement fields on a detached copy. Omitted fields retain their source value. */
  readonly copy?: (
    block: EditorBlockNode,
    context: ClipboardCopyContext,
  ) => Partial<BlockClipboardFields>;
  /** Rewrites type-specific data using complete destination maps, before validation and insertion. */
  readonly paste?: (
    block: EditorBlockNode,
    context: ClipboardPasteContext,
  ) => Partial<BlockClipboardFields>;
  /** Formats this block and its already formatted descendants; common list formatters run afterwards. */
  readonly format?: (
    context: ClipboardFormatContext,
    current: PortableBlockFormats,
  ) => PortableBlockFormats;
}

/** Context for formatting one canvas element without reading the live document. */
export interface ElementClipboardFormatContext {
  readonly element: EditorElementNode;
  /** Already formatted child elements, in stored order. */
  readonly children: PortableBlockFormats;
  /** Already formatted blocks referenced by this element. */
  readonly blocks: PortableBlockFormats;
}

/**
 * Optional synchronous operations for one canvas type; geometry and hierarchy stay clipboard-owned.
 * Copy and paste receive detached records. Omitted methods and fields preserve the
 * source values. Return props to remove transient data or remap type-specific references.
 * Exceptions abort preparation before clipboard writes; converters must not mutate the document.
 */
export interface ElementClipboardConverter extends ClipboardParsers {
  /** Replaces props in the copied payload without changing the source element. */
  readonly copy?: (
    element: EditorElementNode,
    context: ClipboardCopyContext,
  ) => Partial<ElementClipboardFields>;
  /** Rewrites props with destination IDs before element processors and validation run. */
  readonly paste?: (
    element: EditorElementNode,
    context: ClipboardPasteContext,
  ) => Partial<ElementClipboardFields>;
  /** Produces portable text from this element, formatted children and referenced blocks. */
  readonly format?: (
    context: ElementClipboardFormatContext,
    current: PortableBlockFormats,
  ) => PortableBlockFormats;
  /**
   * Returns source block IDs to transfer with these elements; missing blocks are ignored.
   * Canvas Cut removes these original blocks after export, so ordinary external links
   * should stay in props instead of being declared here. Root IDs are ordered siblings
   * from the source panel, allowing a block card to resolve its inclusive range.
   */
  readonly getReferencedBlockIds?: (
    element: EditorElementNode,
    rootBlockIds: readonly string[],
  ) => readonly string[];
}

/** Portable text representations produced for one block forest. */
export interface PortableBlockFormats {
  /** Unformatted text suitable for `text/plain`. */
  readonly plain: string;
  /** Markdown representation suitable for `text/markdown`. */
  readonly markdown: string;
  /** HTML fragment suitable for `text/html`. */
  readonly html: string;
}

/** Structural context supplied while formatting one block. */
export interface ClipboardFormatContext {
  /** Current detached block being formatted. */
  readonly block: EditorBlock;
  /** Ordered siblings containing the current block. */
  readonly siblings: readonly EditorBlock[];
  /** Zero-based position of the current block among its siblings. */
  readonly index: number;
  /** Zero-based nesting depth in the copied block forest. */
  readonly depth: number;
  /** Already formatted descendant forest. */
  readonly children: PortableBlockFormats;
}

/** Ordered contribution that may rewrite portable formats for matching blocks. */
export interface ClipboardFormatter {
  /** Stable ID used to prevent duplicate formatter registration. */
  readonly id: string;
  /** Optional predicate; returning `false` skips this formatter for the block. */
  readonly matches?: (context: ClipboardFormatContext) => boolean;
  /** Produces the next formats from structural context and preceding output. */
  readonly format: (
    context: ClipboardFormatContext,
    current: PortableBlockFormats,
  ) => PortableBlockFormats;
}

/** Candidate parser consulted in registration order for external clipboard data. */
export interface ClipboardParser {
  /** Stable ID used to prevent duplicate parser registration. */
  readonly id: string;
  /** Returns parsed block inputs on a match or `undefined` to try the next parser. */
  readonly parse: (data: {
    readonly html: string;
    readonly text: string;
  }) => EditorBlockInput[] | undefined;
}

/** Detached canvas records with converted props, destination IDs and source references. */
export interface ConvertedClipboardElements {
  readonly nodes: readonly EditorElementNode[];
  readonly idMap: ReadonlyMap<string, string>;
  readonly referencedBlocks: ReadonlyMap<string, readonly string[]>;
}

/** IDs belonging to this paste, used to remove newly created records when insertion fails. */
export interface CreatedClipboardRecords {
  readonly blockIds: Set<string>;
  readonly elementIds: Set<string>;
}

/** Optional panel binding for paste algorithms that depend on a rendered surface. */
export interface PanelPasteStrategy extends PasteStrategy {
  /** Returns an algorithm bound to the receiving occurrence, without changing registrations. */
  createPanelStrategy(reactPanel: ReactPanelApi): PasteStrategy;
}
