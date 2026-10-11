import type { EditorBlock, EditorBlockNode, EditorBlockInput, EditorElementInput, EditorElementNode } from "@chulane/rivto";
import type { EditorViewApi } from "../../editor-view/types";
import type { RegistrationOwner } from "../extensions/types";
import type { ClipboardFormatContext, PortableBlockFormats } from "./clipboard-format-registry";

/** Fields owned by a block converter; identity, type and children belong to clipboard. */
export type BlockClipboardFields = Pick<EditorBlock, "content" | "props" | "listProps" | "pluginData">;
/** Fields owned by an element converter; clipboard places and identifies the resulting element. */
export type ElementClipboardFields = Pick<EditorElementNode, "props">;

/** Source information shared by a single copy, cut, or duplicate operation. */
export interface ClipboardCopyContext {
  readonly operation: "copy" | "cut" | "duplicate";
  readonly sourceDocumentId: string;
  /** Omitted for document-only programmatic copy. */
  readonly editorView?: EditorViewApi;
  /** Ordered block siblings represented by this source view. */
  readonly rootBlockIds: readonly string[];
}

/** Destination identities are allocated before any converter runs or document write occurs. */
export interface ClipboardPasteContext {
  readonly operation: "paste" | "duplicate";
  readonly sourceDocumentId?: string;
  readonly destinationDocumentId: string;
  /** Receiving mounted view, absent for document-only programmatic operations. */
  readonly editorView?: EditorViewApi;
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

interface ClipboardParsers {
  /**
   * Accepts an entire detached HTML subtree, including its children. Returning
   * undefined lets the next parser try it; an empty result deliberately consumes it.
   * Page parsers must return blocks. Edgeless parsers may also return elements.
   */
  readonly parseHTML?: (element: Element, context: ClipboardParseContext) => ClipboardContent | undefined;
  /** Accepts a complete plain-text value, or returns undefined to keep the normal fallback. */
  readonly parseText?: (text: string, context: ClipboardParseContext) => ClipboardContent | undefined;
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
  readonly copy?: (block: EditorBlockNode, context: ClipboardCopyContext) => Partial<BlockClipboardFields>;
  /** Rewrites type-specific data using complete destination maps, before validation and insertion. */
  readonly paste?: (block: EditorBlockNode, context: ClipboardPasteContext) => Partial<BlockClipboardFields>;
  /** Formats this block and its already formatted descendants; common list formatters run afterwards. */
  readonly format?: (context: ClipboardFormatContext, current: PortableBlockFormats) => PortableBlockFormats;
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
  readonly copy?: (element: EditorElementNode, context: ClipboardCopyContext) => Partial<ElementClipboardFields>;
  /** Rewrites props with destination IDs before element processors and validation run. */
  readonly paste?: (element: EditorElementNode, context: ClipboardPasteContext) => Partial<ElementClipboardFields>;
  /** Produces portable text from this element, formatted children and referenced blocks. */
  readonly format?: (context: ElementClipboardFormatContext, current: PortableBlockFormats) => PortableBlockFormats;
  /**
   * Returns source block IDs to transfer with these elements; missing blocks are ignored.
   * Canvas Cut removes these original blocks after export, so ordinary external links
   * should stay in props instead of being declared here. Root IDs are ordered siblings
   * from the source view, allowing a block card to resolve its inclusive range.
   */
  readonly getReferencedBlockIds?: (element: EditorElementNode, rootBlockIds: readonly string[]) => readonly string[];
}

/** Per-type clipboard registrations shared by a runtime's views. */
export class ClipboardConverters {
  private readonly blockTypes = new Map<string, BlockClipboardConverter>();
  private readonly elementTypes = new Map<string, ElementClipboardConverter>();
  private readonly parsers: ClipboardParsers[] = [];
  /** Current block registrations; callers cannot change registry membership. */
  get blocks(): ReadonlyMap<string, BlockClipboardConverter> { return this.blockTypes; }
  /** Current element registrations; callers cannot change registry membership. */
  get elements(): ReadonlyMap<string, ElementClipboardConverter> { return this.elementTypes; }
  /** Returns parser contributions in registration order across both kinds of type. */
  getParsers(): readonly ClipboardParsers[] { return this.parsers; }
  constructor(private readonly registrations: RegistrationOwner) {}

  /**
   * Registers one block converter; disposal removes only this registration.
   * @param type - Persisted block type handled by the converter.
   * @param converter - Synchronous clipboard methods for that type.
   * @returns Idempotent disposer also owned by the active extension lifecycle.
   * @throws If the type is empty, already registered, or the owner is destroyed.
   */
  registerBlock(type: string, converter: BlockClipboardConverter): () => void {
    return this.register(this.blockTypes, type, converter);
  }
  /**
   * Registers one element converter; disposal removes only this registration.
   * @param type - Persisted canvas element type handled by the converter.
   * @param converter - Synchronous clipboard methods for that type.
   * @returns Idempotent disposer also owned by the active extension lifecycle.
   * @throws If the type is empty, already registered, or the owner is destroyed.
   */
  registerElement(type: string, converter: ElementClipboardConverter): () => void {
    return this.register(this.elementTypes, type, converter);
  }
  private register<T extends ClipboardParsers>(map: Map<string, T>, type: string, converter: T): () => void {
    this.registrations.assertActive();
    if (!type.trim() || map.has(type)) throw new Error(`Clipboard converter ${type || "<empty>"} is already registered`);
    map.set(type, converter);
    this.parsers.push(converter);
    return this.registrations.own(() => {
      if (map.get(type) !== converter) return;
      map.delete(type);
      const index = this.parsers.indexOf(converter);
      if (index >= 0) this.parsers.splice(index, 1);
    });
  }
}
