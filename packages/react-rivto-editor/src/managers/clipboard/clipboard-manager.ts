import { blockIdsOf } from "../../elements/block-element-projection";
import { ElementPasteStrategy } from "../../extensions/built-ins/clipboard/element-paste-strategy";
import type { ClipboardBundle, EditorBlockNode, EditorBlock, EditorElementNode, ClipboardPasteInput, Selection } from "@chulane/rivto";
import { hasBlockRanges, isStructuralSelection, validateClipboardBundle } from "@chulane/rivto";
import type { EditorRuntime } from "../../editor/editor-runtime";
import { ClipboardConverters, type BlockClipboardConverter, type ElementClipboardConverter, type ClipboardCopyContext, type ClipboardPasteContext } from "./clipboard-converters";
import { selectedClipboardElements, clipboardContentBundle } from "./clipboard-content";
import { blockElementClipboardConverter, connectorClipboardConverter, textElementClipboardConverter } from "../../elements/clipboard-converters";

import type { PasteStrategy, RivtoEditorApi } from "@chulane/rivto";
import { BLOCK_PASTE_STRATEGY_ID, ClipboardManager as CoreClipboardManager, PRESERVE_NEWLINES_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID } from "@chulane/rivto";
import type { EditorViewApi } from "../../editor-view/types";

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

/** Optional view binding for paste algorithms that depend on a rendered surface. */
export interface ViewPasteStrategy extends PasteStrategy {
  /** Returns an algorithm bound to the receiving occurrence, without changing registrations. */
  createViewStrategy(editorView: EditorViewApi): PasteStrategy;
}

/** Shared clipboard operations; paste receives a view or a runtime for document-only commands. */
export class ClipboardManager {
  /** Runtime-owned type registrations used by structured and portable clipboard operations. */
  readonly converters: ClipboardConverters;

  /**
   * Creates structured clipboard operations shared by a document's views.
   * @param editor - Core runtime providing clipboard operations and paste transactions.
   * @param runtime - React runtime owning converter registrations and portable formats.
   */
  constructor(private readonly editor: RivtoEditorApi, private readonly runtime: EditorRuntime) {
    this.converters = new ClipboardConverters(runtime.extensions);
    this.registerElementConverter("block", blockElementClipboardConverter);
    this.registerElementConverter("connector", { ...textElementClipboardConverter("connector"), ...connectorClipboardConverter });
    for (const type of ["text", "sticker", "rectangle", "ellipse"]) {
      this.registerElementConverter(type, textElementClipboardConverter(type));
    }
  }

  /**
   * Installs one block converter and disposes it with its owning extension.
   * @param type - Persisted block type; only one converter may be registered per type.
   * @param converter - Optional copy, paste, formatting and external parsing methods.
   * @returns Idempotent disposer for this registration.
   * @throws If the type is empty, already registered, or the runtime is destroyed.
   */
  registerBlockConverter(type: string, converter: BlockClipboardConverter): () => void {
    return this.converters.registerBlock(type, converter);
  }
  /**
   * Installs one canvas converter and disposes it with its owning extension.
   * @param type - Persisted element type; only one converter may be registered per type.
   * @param converter - Optional conversion methods and referenced-block collection.
   * @returns Idempotent disposer for this registration.
   * @throws If the type is empty, already registered, or the runtime is destroyed.
   */
  registerElementConverter(type: string, converter: ElementClipboardConverter): () => void {
    return this.converters.registerElement(type, converter);
  }

  /** Core paste strategies extended by React clipboard integrations. */
  get pasteStrategies(): CoreClipboardManager["pasteStrategies"] { return this.editor.clipboard.pasteStrategies; }

  /**
   * Copies selected block subtrees, text ranges and canvas subtrees through type converters.
   * @param selection - Explicit selection, or omitted to read the view/runtime selection.
   * @param editorView - Source view defining Panel roots; omitted for a document-only copy.
   * @param operation - Copy, cut or duplicate intent supplied to converters; defaults to copy.
   * @returns Detached payload, or undefined for an empty selection. Does not write the document.
   * @throws If a converter rejects the copied data.
   */
  copy(selection?: Selection, editorView?: EditorViewApi, operation: ClipboardCopyContext["operation"] = "copy"): ClipboardBundle | undefined {
    const current = selection ?? editorView?.selection.get() ?? this.editor.selection.get();
    let bundle = this.editor.clipboard.copy(current);
    if (current?.elements?.length) {
      const elements = this.collectElements(current.elements, editorView ?? this.runtime);
      const included = new Set(elements.blocks.map(block => block.id));
      elements.blocks.push(...bundle?.blocks.filter(block => !included.has(block.id)) ?? []);
      bundle = elements;
    }
    return bundle ? this.convertCopy(bundle, editorView, operation) : undefined;
  }

  /**
   * Copies an explicit text selection through block converters, excluding unselected children.
   * @param selection - Block text ranges to copy.
   * @param editorView - Optional source view supplied to converters.
   * @returns Detached partial-text bundle, or undefined when there is no text to copy.
   */
  copyText(selection: Selection, editorView?: EditorViewApi): ClipboardBundle | undefined {
    const bundle = this.editor.clipboard.copyText(selection);
    return bundle ? this.convertCopy(bundle, editorView) : undefined;
  }

  /**
   * Copies the runtime selection and checks portable formats before deleting it.
   * @returns Detached copied bundle, or undefined for an empty selection.
   * @throws If copy or formatting rejects the data; deletion has not started in that case.
   */
  cut(): ReturnType<CoreClipboardManager["cut"]> {
    const bundle = this.copy(undefined, undefined, "cut");
    if (!bundle) return;
    this.runtime.clipboardFormats.formatBundle(bundle);
    this.editor.selection.delete();
    return bundle;
  }

  /**
   * Prepares structured data through type converters, then invokes core paste strategies.
   * ID allocation and converters run before import. Creation processors and validation run
   * during insertion. On failure, new records are removed and the error is rethrown; changes
   * to existing text are not reverted by this cleanup. A malformed
   * serialized bundle falls back to plain text; an invalid explicit bundle throws.
   * @param input - Clipboard data, selection override and placement; plain text keeps core behavior.
   * @param editorView - Receiving view, or runtime for document-only commands without a mounted view.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Core paste result, including the resulting caret when text was inserted.
   * @throws If a converter, creation processor or validator rejects the payload.
   */
  paste(input: Parameters<CoreClipboardManager["paste"]>[0], editorView: EditorViewApi | EditorRuntime, operation: "paste" | "duplicate" = "paste"): ReturnType<CoreClipboardManager["paste"]> {
    input ??= {};
    const selection = input.textTarget ?? editorView.selection.get() ?? { type: "selection" as const, blocks: [], elements: [] };
    let bundle = input.bundle;
    if (!bundle && input.structured) {
      try { const parsed: unknown = JSON.parse(input.structured); validateClipboardBundle(parsed); bundle = parsed; }
      catch { /* Core retains the plain-text fallback for invalid structured data. */ }
    }
    let convertedElements: ConvertedClipboardElements | undefined;
    const created: CreatedClipboardRecords = { blockIds: new Set(), elementIds: new Set() };
    const previousSelection = this.editor.selection.get();
    if (bundle) {
      const converted = this.convertPasteBundle(bundle, input, selection, editorView, operation);
      input = { ...input, bundle: converted.bundle, blockIdMap: converted.blockIdMap };
      convertedElements = converted.elements;
      for (const id of converted.blockIdMap.values()) {
        if (!this.editor.blocks.hasBlock(id)) created.blockIds.add(id);
      }
      for (const id of converted.elements.idMap.values()) {
        if (!this.editor.elements.hasElement(id)) created.elementIds.add(id);
      }
    }
    // A local pipeline retains the destination even if a strategy invokes another paste.
    const clipboard = new CoreClipboardManager(this.editor);
    for (const id of [BLOCK_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID, PRESERVE_NEWLINES_PASTE_STRATEGY_ID]) {
      clipboard.pasteStrategies.unregister(id);
    }
    const strategies = this.pasteStrategies.getPasteStrategies();
    if (!strategies.some(strategy => strategy instanceof ElementPasteStrategy)) strategies.push(new ElementPasteStrategy(this.runtime));
    strategies.forEach((strategy, index) => {
      const bind = (strategy as Partial<ViewPasteStrategy>).createViewStrategy;
      let bound = strategy;
      if (strategy instanceof ElementPasteStrategy) bound = new ElementPasteStrategy(editorView, convertedElements, created);
      else if (bind && "runtime" in editorView) bound = bind.call(strategy, editorView);
      clipboard.pasteStrategies.register(String(index), bound);
    });
    // An inactive view has no caret; undefined would make core borrow another view's selection.
    const root = "runtime" in editorView ? editorView.panel?.rootBlockId : undefined;
    const placement = { ...input.placement };
    if (root && !selection.blocks.length && placement.afterId === undefined && placement.parentId === undefined) {
      placement.parentId = root;
      placement.afterId = ("runtime" in editorView ? editorView.getRootBlockIds() : editorView.blocks.getRootIds()).at(-1) ?? null;
    }
    return this.editor.history.batchUpdates(() => {
      try {
        return clipboard.paste({ ...input, placement, textTarget: selection });
      } catch (error) {
        // The text-merge destination existed before paste and is deliberately absent from these sets.
        try {
          this.editor.elements.removeElements([...created.elementIds].filter(id => this.editor.elements.hasElement(id)));
          for (const id of created.blockIds) {
            if (this.editor.blocks.hasBlock(id)) this.editor.blocks.removeBlock(id);
          }
          if (previousSelection) this.editor.selection.set(previousSelection);
          else this.editor.selection.clear();
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Clipboard insertion and cleanup failed");
        }
        throw error;
      }
    });
  }

  /** Keeps source IDs in strategy inputs while converted properties refer to allocated destination IDs. */
  private convertPasteBundle(
    bundle: ClipboardBundle, input: ClipboardPasteInput, selection: Selection,
    editorView: EditorViewApi | EditorRuntime, operation: "paste" | "duplicate",
  ): { bundle: ClipboardBundle; blockIdMap: ReadonlyMap<string, string>; elements: ConvertedClipboardElements } {
    validateClipboardBundle(bundle);
    bundle = structuredClone(bundle);
    if (("runtime" in editorView ? editorView.events.getSurfaceType() : editorView.editorViews.getSurfaceType()) !== "edgeless" && bundle.elements?.length) bundle = this.pageBundle(bundle, input.defaultBlockType);
    const sourceIds: string[] = [];
    const collect = (block: EditorBlock): void => { sourceIds.push(block.id); block.children.forEach(collect); };
    bundle.blocks.forEach(collect);
    const blockIdMap = new Map(this.editor.getDocument().blocks.createImportIdMap(sourceIds));
    if (bundle.fromTextSelection && input.placement?.mergeText !== false && hasBlockRanges(selection) && !isStructuralSelection(selection)) {
      const target = this.editor.selection.resolveBlockSelection(selection)?.blocks[0];
      if (target && bundle.blocks[0]) blockIdMap.set(bundle.blocks[0].id, target.id);
    }
    const sources = selectedClipboardElements(bundle);
    // An empty block card has no copied content and is omitted before converters see the maps.
    const retained = sources.filter(node => {
      if (node.type !== "block") return true;
      return blockIdsOf(node, bundle.blocks.map(block => block.id)).some(id => blockIdMap.has(id));
    });
    const elementIdMap = new Map(this.editor.elements.createImportIdMap(retained.map(node => node.id)));
    const context = this.pasteContext(bundle, editorView, blockIdMap, elementIdMap, operation);
    const convert = (block: EditorBlock): EditorBlock => {
      const fields = this.converters.blocks.get(block.type)?.paste?.(this.blockNode(block), context);
      return { ...block, ...this.blockFields(fields), children: block.children.map(convert) };
    };
    bundle.blocks = bundle.blocks.map(convert);
    const elements = this.convertElements(bundle, editorView, blockIdMap, elementIdMap, operation);
    return { bundle, blockIdMap, elements };
  }

  private blockNode(block: EditorBlock): EditorBlockNode {
    const { children, ...node } = block;
    return structuredClone({ ...node, childIds: children.map(child => child.id) });
  }

  private blockFields(fields: Partial<import("./clipboard-converters").BlockClipboardFields> | undefined) {
    if (!fields) return {};
    const { content, props, listProps, pluginData } = fields;
    return { ...(content === undefined ? {} : { content }), ...(props === undefined ? {} : { props }),
      ...(listProps === undefined ? {} : { listProps }), ...(pluginData === undefined ? {} : { pluginData }) };
  }

  /** Applies copy hooks once to detached nodes, retaining source identities and hierarchy. */
  private convertCopy(source: ClipboardBundle, editorView?: EditorViewApi, operation: ClipboardCopyContext["operation"] = "copy"): ClipboardBundle {
    const bundle = structuredClone(source);
    const context: ClipboardCopyContext = { operation, sourceDocumentId: this.editor.getDocument().id,
      editorView, rootBlockIds: editorView?.getRootBlockIds() ?? this.editor.blocks.getRootIds() };
    const visit = (block: EditorBlock): EditorBlock => ({ ...block,
      ...this.blockFields(this.converters.blocks.get(block.type)?.copy?.(this.blockNode(block), context)), children: block.children.map(visit) });
    bundle.blocks = bundle.blocks.map(visit);
    bundle.elements = bundle.elements?.map(element => {
      const fields = this.converters.elements.get(element.type)?.copy?.(structuredClone(element), context);
      return { ...element, props: fields?.props ?? element.props };
    });
    bundle.sourceDocumentId = context.sourceDocumentId;
    return bundle;
  }

  /**
   * Collects selected canvas subtrees and referenced block trees before applying copy hooks once.
   * @param ids - Selected element IDs; overlapping subtrees are visited only once.
   * @param editorView - Source view restricting elements and block roots, or the owning runtime.
   * @param operation - Copy, cut or duplicate intent; defaults to copy.
   * @returns Detached bundle with source identities and ordered referenced block roots.
   */
  copyElements(ids: readonly string[], editorView: EditorViewApi | EditorRuntime, operation: ClipboardCopyContext["operation"] = "copy"): ClipboardBundle {
    return this.convertCopy(this.collectElements(ids, editorView), "runtime" in editorView ? editorView : undefined, operation);
  }

  private collectElements(ids: readonly string[], editorView: EditorViewApi | EditorRuntime): ClipboardBundle {
    const elements: EditorElementNode[] = [];
    const seen = new Set<string>();
    const visit = (id: string): void => {
      if (seen.has(id)) return;
      const node = editorView.elements.getElementNode(id);
      if (!node) return;
      seen.add(id); elements.push(node); node.childIds.forEach(visit);
    };
    ids.forEach(visit);
    const referenced = new Set(elements.flatMap(node => this.converters.elements.get(node.type)?.getReferencedBlockIds?.(node, ("runtime" in editorView ? editorView.getRootBlockIds() : editorView.blocks.getRootIds())) ?? []));
    const blocks = [...referenced].filter(id => {
      let parent = this.editor.blocks.getParentId(id);
      while (parent) { if (referenced.has(parent)) return false; parent = this.editor.blocks.getParentId(parent); }
      return true;
    }).flatMap(id => this.editor.blocks.getBlock(id) ?? []);
    return { version: 4, blocks, elements, selectedElementIds: [...ids] };
  }

  private pasteContext(bundle: ClipboardBundle, editorView: EditorViewApi | EditorRuntime, blockIdMap: ReadonlyMap<string, string>, elementIdMap: ReadonlyMap<string, string>, operation: "paste" | "duplicate"): ClipboardPasteContext {
    return { operation, sourceDocumentId: bundle.sourceDocumentId, destinationDocumentId: this.editor.getDocument().id,
      editorView: "runtime" in editorView ? editorView : undefined, blockIdMap, elementIdMap, offset: { x: 24, y: 24 }, sourceRootBlockIds: bundle.blocks.map(block => block.id) };
  }

  /**
   * Converts selected canvas records without writing either document forest.
   * Empty block cards are omitted. Other elements retain their type and child order; creation
   * processors run later through ordinary insertion. Copied frames move by 24 document units on each axis.
   * @param bundle - Detached source records and referenced block roots.
   * @param editorView - Destination view or document runtime used for placement and processors.
   * @param blockIdMap - Already allocated source-to-destination block IDs.
   * @param ids - Preallocated element IDs, or omitted to allocate them here.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Converted records, element ID map and remapped block dependencies; insertion still validates them.
   * @throws If a type converter rejects the source data.
   */
  convertElements(bundle: ClipboardBundle, editorView: EditorViewApi | EditorRuntime, blockIdMap: ReadonlyMap<string, string>, ids?: ReadonlyMap<string, string>, operation: "paste" | "duplicate" = "paste"): ConvertedClipboardElements {
    const sources = selectedClipboardElements(bundle);
    if (!sources.length) return { nodes: [], idMap: new Map(), referencedBlocks: new Map() };
    const idMap = new Map(ids ?? this.editor.elements.createImportIdMap(sources.map(node => node.id)));
    const referencedBlocks = new Map<string, readonly string[]>();
    const sourceRoots = bundle.blocks.map(block => block.id);
    for (const source of sources) {
      const references = this.converters.elements.get(source.type)?.getReferencedBlockIds?.(source, sourceRoots);
      if (!references) continue;
      const mapped = references.flatMap(id => blockIdMap.get(id) ?? []);
      if (!mapped.length && source.type === "block") idMap.delete(source.id);
      else if (idMap.has(source.id)) referencedBlocks.set(idMap.get(source.id)!, mapped);
    }
    const context = this.pasteContext(bundle, editorView, blockIdMap, idMap, operation);
    const topLayer = Math.max(0, ...editorView.elements.getElementNodes().map(node => node.zIndex));
    const nodes = sources.flatMap((source, index): EditorElementNode[] => {
      const id = idMap.get(source.id);
      if (!id) return [];
      const fields = this.converters.elements.get(source.type)?.paste?.(structuredClone(source), context);
      const input = { ...source, id, childIds: [], props: fields?.props ?? source.props,
        frame: { ...source.frame, x: source.frame.x + context.offset.x, y: source.frame.y + context.offset.y }, zIndex: topLayer + index + 1 };
      return [{ ...input, childIds: source.childIds.flatMap(child => idMap.get(child) ?? []) }];
    });
    return { nodes, idMap, referencedBlocks };
  }

  private pageBundle(bundle: ClipboardBundle, defaultBlockType?: string): ClipboardBundle {
    const byId = new Map(bundle.elements?.map(node => [node.id, node]));
    const blocks = new Map(bundle.blocks.map(block => [block.id, block]));
    const included = new Set<string>();
    const result: EditorBlock[] = [];
    const seen = new Set<string>();
    const visit = (id: string): void => {
      if (seen.has(id)) return;
      seen.add(id);
      const node = byId.get(id);
      if (!node) return;
      const converter = this.converters.elements.get(node.type);
      const refs = converter?.getReferencedBlockIds?.(node, bundle.blocks.map(block => block.id));
      if (refs) refs.forEach(id => { const block = blocks.get(id); if (block && !included.has(id)) { included.add(id); result.push(block); } });
      else if (converter?.format) {
        const writingType = defaultBlockType ?? this.runtime.createDefaultBlock().type;
        const formats = this.runtime.clipboardFormats.formatElement(node, bundle);
        const parsed = this.runtime.clipboardFormats.parseContent({ html: formats.html, text: formats.plain }, { surface: "page", defaultBlockType: writingType });
        result.push(...clipboardContentBundle(parsed ?? { blocks: formats.plain ? [{ type: writingType, content: formats.plain }] : [] }).blocks);
      }
      node.childIds.forEach(visit);
    };
    (bundle.selectedElementIds ?? [...byId.keys()]).forEach(visit);
    bundle.blocks.forEach(block => { if (!included.has(block.id)) result.push(block); });
    return { ...bundle, blocks: result, elements: undefined, selectedElementIds: undefined };
  }

}
