import type {
  ClipboardBundle,
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
   *
   * @param element - Complete detached HTML element to inspect.
   * @param context - Receiving surface and default writing block type.
   * @returns Parsed creation inputs, an empty result to consume the subtree, or undefined to decline it.
   * @throws If parsing fails.
   */
  readonly parseHTML?: (
    element: Element,
    context: ClipboardParseContext,
  ) => ClipboardContent | undefined;
  /**
   * Accepts a complete plain-text value, or returns undefined to keep the normal fallback.
   *
   * @param text - Complete plain-text clipboard value.
   * @param context - Receiving surface and default writing block type.
   * @returns Parsed creation inputs, or undefined to decline the text.
   * @throws If parsing fails.
   */
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
  /**
   * Returns replacement fields on a detached copy. Omitted fields retain their source value.
   *
   * @param block - Detached source block and direct child IDs.
   * @param context - Copy operation, source document, and optional panel scope.
   * @returns Fields to replace in the copied payload.
   * @throws If conversion fails before the clipboard operation completes.
   */
  readonly copy?: (
    block: EditorBlockNode,
    context: ClipboardCopyContext,
  ) => Partial<BlockClipboardFields>;
  /**
   * Rewrites type-specific data using complete destination maps, before validation and insertion.
   *
   * @param block - Detached source block and direct child IDs.
   * @param context - Destination document, optional panel, and allocated ID maps.
   * @returns Fields to replace in the prepared block.
   * @throws If conversion fails before insertion.
   */
  readonly paste?: (
    block: EditorBlockNode,
    context: ClipboardPasteContext,
  ) => Partial<BlockClipboardFields>;
  /**
   * Formats this block and its already formatted descendants; common list formatters run afterwards.
   *
   * @param context - Detached block, sibling position, depth, and formatted descendants.
   * @param current - Portable formats produced before this converter.
   * @returns Portable formats for the block and its descendants.
   * @throws If formatting fails.
   */
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
  /**
   * Replaces props in the copied payload without changing the source element.
   *
   * @param element - Detached source element record.
   * @param context - Copy operation and source document information.
   * @returns Properties to replace in the copied payload.
   * @throws If conversion fails before the clipboard operation completes.
   */
  readonly copy?: (
    element: EditorElementNode,
    context: ClipboardCopyContext,
  ) => Partial<ElementClipboardFields>;
  /**
   * Rewrites props with destination IDs before element processors and validation run.
   *
   * @param element - Detached source element record.
   * @param context - Destination document and allocated source-to-destination IDs.
   * @returns Properties to replace in the prepared element.
   * @throws If conversion fails before insertion.
   */
  readonly paste?: (
    element: EditorElementNode,
    context: ClipboardPasteContext,
  ) => Partial<ElementClipboardFields>;
  /**
   * Produces portable text from this element, formatted children and referenced blocks.
   *
   * @param context - Element and already formatted children and referenced blocks.
   * @param current - Portable formats produced before this converter.
   * @returns Portable formats for the element subtree.
   * @throws If formatting fails.
   */
  readonly format?: (
    context: ElementClipboardFormatContext,
    current: PortableBlockFormats,
  ) => PortableBlockFormats;
  /**
   * Returns source block IDs to transfer with these elements; missing blocks are ignored.
   * Canvas Cut removes these original blocks after export, so ordinary external links
   * should stay in props instead of being declared here. Root IDs are ordered siblings
   * from the source panel, allowing a block card to resolve its inclusive range.
   *
   * @param element - Detached canvas element being exported.
   * @param rootBlockIds - Ordered source-panel root IDs.
   * @returns Referenced block IDs to include with the copied elements.
   * @throws If reference collection fails.
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
  /**
   * Selects whether this formatter applies to the current block.
   *
   * @param context - Detached block and its structural formatting context.
   * @returns False to skip this formatter; true to apply it.
   * @throws If the predicate fails.
   */
  readonly matches?: (context: ClipboardFormatContext) => boolean;
  /**
   * Produces the next formats from structural context and preceding output.
   *
   * @param context - Detached block and its structural formatting context.
   * @param current - Portable formats produced by earlier formatters.
   * @returns Updated portable formats.
   * @throws If formatting fails.
   */
  readonly format: (
    context: ClipboardFormatContext,
    current: PortableBlockFormats,
  ) => PortableBlockFormats;
}

/** Candidate parser consulted in registration order for external clipboard data. */
export interface ClipboardParser {
  /** Stable ID used to prevent duplicate parser registration. */
  readonly id: string;
  /**
   * Parses external clipboard text or declines it for the next parser.
   *
   * @param data - Complete HTML and plain-text clipboard strings.
   * @returns Block creation inputs, or undefined when this parser does not match.
   * @throws If parsing fails.
   */
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
  /**
   * Returns an algorithm bound to the receiving occurrence, without changing registrations.
   *
   * @param reactPanel - Receiving panel whose scope the strategy should use.
   * @returns A paste strategy bound to that panel.
   */
  createPanelStrategy(reactPanel: ReactPanelApi): PasteStrategy;
}

/** One binary representation contributed for a single copied attachment. */
export interface ClipboardBinaryRepresentation {
  /** Filename offered to the host clipboard writer. */
  readonly name: string;
  /** Media type of the binary representation. */
  readonly mimeType: string;
  /** Binary content, possibly still being prepared. */
  readonly data: Blob | Promise<Blob>;
}

/** Context supplied while refining the final clipboard payload. */
export interface ClipboardPostprocessContext {
  /** Structured content selected for copying. */
  readonly bundle: ClipboardBundle;
  /** Portable formats already produced for that selection. */
  readonly formats: PortableBlockFormats;
}

/** Ordered extension hook that may contribute single-object binary data. */
export interface ClipboardPostprocessor {
  /** Unique identifier used for registration. */
  readonly id: string;
  /**
   * Contributes binary data for a copied selection when this hook recognizes it.
   *
   * Hooks run synchronously in registration order; the first contribution is used.
   *
   * @param context - Structured clipboard bundle and its portable representations.
   * @returns Binary data to copy, or undefined when this hook does not handle the selection.
   * @throws If preparing the contribution fails.
   */
  readonly process: (
    context: ClipboardPostprocessContext,
  ) => ClipboardBinaryRepresentation | undefined;
}

/** Binary data and portable formats supplied to a host clipboard writer. */
export interface ClipboardWriteInput extends ClipboardBinaryRepresentation, PortableBlockFormats {}

/** Host bridge for MIME formats unavailable through the browser clipboard. */
export interface ClipboardWriter {
  /** Unique identifier used for registration. */
  readonly id: string;
  /**
   * Checks whether the host can accept a proposed binary MIME type.
   *
   * The clipboard may check the original MIME type and application/octet-stream.
   *
   * @param mimeType - MIME type proposed for the binary item.
   * @returns True when the host writer can accept the type.
   * @throws If the host capability check fails.
   */
  readonly supports: (mimeType: string) => boolean;
  /**
   * Writes binary data and its portable text representations through the host.
   *
   * The clipboard may try the browser writer if this call fails.
   *
   * @param input - Named binary item and portable text, Markdown, and HTML formats.
   * @returns Completion of the host write, immediately or when its promise resolves.
   * @throws If the host rejects or cannot complete the write.
   */
  readonly write: (input: ClipboardWriteInput) => void | Promise<void>;
}
