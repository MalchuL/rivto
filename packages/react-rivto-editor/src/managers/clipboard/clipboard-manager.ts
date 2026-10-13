import type { RegistrationOwner } from "../extensions/types";
import type { ClipboardBundle, ClipboardPasteInput, EditorBlock, EditorBlockNode, EditorElementNode, Selection } from "@chulane/rivto";
import { BlockPasteStrategy, hasBlockRanges, isStructuralSelection, PreserveNewlinesPasteStrategy, TextPasteStrategy, validateClipboardBundle } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";
import { blockIdsOf } from "../../elements/block-element-projection";
import { blockElementClipboardConverter } from "../../elements/clipboard-converters";
import { ElementPasteStrategy } from "../../extensions/built-ins/clipboard/element-paste-strategy";
import { clipboardContentBundle, selectedClipboardElements } from "./clipboard-content";
import { ClipboardConverters } from "./clipboard-converters";
import { panelClipboardDocument } from "./panel-clipboard-document";
import type { BlockClipboardConverter, ClipboardCopyContext, ClipboardPasteContext, ConvertedClipboardElements, CreatedClipboardRecords, ElementClipboardConverter, PanelPasteStrategy, BlockClipboardFields } from "./types";

import type { DocumentEditorAPI } from "@chulane/rivto";
import { BLOCK_PASTE_STRATEGY_ID, ClipboardManager as CoreClipboardManager, PRESERVE_NEWLINES_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";

/** Shared clipboard operations; paste receives a panel or a runtime for document-only commands. */
export class ClipboardManager {
  /** Runtime-owned type registrations used by structured and portable clipboard operations. */
  readonly converters: ClipboardConverters;

  /**
   * Creates structured clipboard operations shared by a document's panels.
   * @param document - Core runtime providing clipboard operations and paste transactions.
   * @param editor - React runtime providing shared clipboard operations and portable formats.
   * @param extensions - Internal converter registration ownership and destruction guard.
   */
  constructor(private readonly document: DocumentEditorAPI, private readonly editor: ReactEditorApi, extensions: RegistrationOwner) {
    this.converters = new ClipboardConverters(extensions);
    this.registerElementConverter("block", blockElementClipboardConverter);

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
  get pasteStrategies(): CoreClipboardManager["pasteStrategies"] { return this.document.clipboard.pasteStrategies; }

  /**
   * Copies selected block subtrees, text ranges and canvas subtrees through type converters.
   * @param selection - Explicit selection, or omitted to read the panel/runtime selection.
   * @param reactPanel - Source panel defining Panel roots; omitted for a document-only copy.
   * @param operation - Copy, cut or duplicate intent supplied to converters; defaults to copy.
   * @returns Detached payload, or undefined for an empty selection. Does not write the document.
   * @throws If a converter rejects the copied data.
   */
  copy(selection?: Selection, reactPanel?: ReactPanelApi, operation: ClipboardCopyContext["operation"] = "copy"): ClipboardBundle | undefined {
    const current = selection ?? reactPanel?.selection.get() ?? this.document.selection.get();
    let bundle = this.document.clipboard.copy(current);
    if (current?.elements?.length) {
      const elements = this.collectElements(current.elements, reactPanel ?? this.editor);
      const included = new Set(elements.blocks.map(block => block.id));
      elements.blocks.push(...bundle?.blocks.filter(block => !included.has(block.id)) ?? []);
      bundle = elements;
    }
    return bundle ? this.convertCopy(bundle, reactPanel, operation) : undefined;
  }

  /**
   * Copies an explicit text selection through block converters, excluding unselected children.
   * @param selection - Block text ranges to copy.
   * @param reactPanel - Optional source panel supplied to converters.
   * @returns Detached partial-text bundle, or undefined when there is no text to copy.
   */
  copyText(selection: Selection, reactPanel?: ReactPanelApi): ClipboardBundle | undefined {
    const bundle = this.document.clipboard.copyText(selection);
    return bundle ? this.convertCopy(bundle, reactPanel) : undefined;
  }

  /**
   * Copies the runtime selection and checks portable formats before deleting it.
   * @returns Detached copied bundle, or undefined for an empty selection.
   * @throws If copy or formatting rejects the data; deletion has not started in that case.
   */
  cut(): ReturnType<CoreClipboardManager["cut"]> {
    const bundle = this.copy(undefined, undefined, "cut");
    if (!bundle) return;
    this.editor.clipboardFormats.formatBundle(bundle);
    this.document.selection.delete();
    return bundle;
  }

  /**
   * Prepares structured data through type converters, then invokes core paste strategies.
   * ID allocation and converters run before import. Creation processors and validation run
   * during insertion. On failure, new records are removed and the error is rethrown; changes
   * to existing text are not reverted by this cleanup. A malformed
   * serialized bundle falls back to plain text; an invalid explicit bundle throws.
   * @param input - Clipboard data, selection override and placement; plain text keeps core behavior.
   * @param reactPanel - Receiving panel, or runtime for document-only commands without a mounted panel; defaults to this editor.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Core paste result, including the resulting caret when text was inserted.
   * @throws If a converter, creation processor or validator rejects the payload.
   */
  paste(input: Parameters<CoreClipboardManager["paste"]>[0] = {}, reactPanel: ReactPanelApi | ReactEditorApi = this.editor, operation: "paste" | "duplicate" = "paste"): ReturnType<CoreClipboardManager["paste"]> {
    input ??= {};
    const selection = input.textTarget ?? reactPanel.selection.get() ?? { type: "selection" as const, blocks: [], elements: [] };
    if ("editor" in reactPanel) {
      if (selection.blocks.some(({ id }) => !reactPanel.blocks.hasBlock(id)) || selection.elements?.some(id => !reactPanel.elements.hasElement(id))) throw new Error("Paste selection is outside panel");
      if (input.placement?.parentId != null && input.placement.parentId !== reactPanel.rootBlockId && !reactPanel.blocks.hasBlock(input.placement.parentId)) throw new Error("Paste parent is outside panel");
      if (input.placement?.afterId != null && !reactPanel.blocks.canRemove(input.placement.afterId)) throw new Error("Paste anchor is outside panel or protected");
    }
    let bundle = input.bundle;
    if (!bundle && input.structured) {
      try { const parsed: unknown = JSON.parse(input.structured); validateClipboardBundle(parsed); bundle = parsed; }
      catch { /* Core retains the plain-text fallback for invalid structured data. */ }
    }
    let convertedElements: ConvertedClipboardElements | undefined;
    const created: CreatedClipboardRecords = { blockIds: new Set(), elementIds: new Set() };
    const previousSelection = this.document.selection.get();
    if (bundle) {
      const converted = this.convertPasteBundle(bundle, input, selection, reactPanel, operation);
      input = { ...input, bundle: converted.bundle, blockIdMap: converted.blockIdMap };
      convertedElements = converted.elements;
      for (const id of converted.blockIdMap.values()) {
        if (!this.document.blocks.hasBlock(id)) created.blockIds.add(id);
      }
      for (const id of converted.elements.idMap.values()) {
        if (!this.document.elements.hasElement(id)) created.elementIds.add(id);
      }
    }
    // A local pipeline retains the destination even if a strategy invokes another paste.
    const pasteDocument = "editor" in reactPanel ? panelClipboardDocument(reactPanel) : this.document;
    const clipboard = new CoreClipboardManager(pasteDocument);
    for (const id of [BLOCK_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID, PRESERVE_NEWLINES_PASTE_STRATEGY_ID]) {
      clipboard.pasteStrategies.unregister(id);
    }
    const strategies = this.pasteStrategies.getPasteStrategies();
    if (!strategies.some(strategy => strategy instanceof ElementPasteStrategy)) strategies.push(new ElementPasteStrategy(this.editor));
    strategies.forEach((strategy, index) => {
      const bind = (strategy as Partial<PanelPasteStrategy>).createPanelStrategy;
      let bound = strategy;
      if (strategy instanceof ElementPasteStrategy) bound = new ElementPasteStrategy(reactPanel, convertedElements, created);
      else if (strategy instanceof BlockPasteStrategy) bound = new BlockPasteStrategy(pasteDocument);
      else if (strategy instanceof TextPasteStrategy) bound = new TextPasteStrategy(pasteDocument);
      else if (strategy instanceof PreserveNewlinesPasteStrategy) bound = new PreserveNewlinesPasteStrategy(pasteDocument);
      else if (bind && "editor" in reactPanel) bound = bind.call(strategy, reactPanel);
      clipboard.pasteStrategies.register(String(index), bound);
    });
    // An inactive panel has no caret; undefined would make core borrow another panel's selection.
    const root = "editor" in reactPanel ? reactPanel.rootBlockId : undefined;
    const placement = { ...input.placement };
    if (root && !selection.blocks.length && placement.afterId === undefined && placement.parentId === undefined) {
      placement.parentId = root;
      placement.afterId = this.document.blocks.getChildIds(root).at(-1) ?? null;
    }
    return this.document.history.batchUpdates(() => {
      try {
        return clipboard.paste({ ...input, placement, textTarget: selection });
      } catch (error) {
        // The text-merge destination existed before paste and is deliberately absent from these sets.
        try {
          this.document.elements.removeElements([...created.elementIds].filter(id => this.document.elements.hasElement(id)));
          for (const id of created.blockIds) {
            if (this.document.blocks.hasBlock(id)) this.document.blocks.removeBlock(id);
          }
          if (previousSelection) this.document.selection.set(previousSelection);
          else this.document.selection.clear();
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
    reactPanel: ReactPanelApi | ReactEditorApi, operation: "paste" | "duplicate",
  ): { bundle: ClipboardBundle; blockIdMap: ReadonlyMap<string, string>; elements: ConvertedClipboardElements } {
    validateClipboardBundle(bundle);
    bundle = structuredClone(bundle);
    if ("editor" in reactPanel && reactPanel.events.getSurfaceType() !== "edgeless" && bundle.elements?.length) bundle = this.pageBundle(bundle, input.defaultBlockType);
    const sourceIds: string[] = [];
    const collect = (block: EditorBlock): void => { sourceIds.push(block.id); block.children.forEach(collect); };
    bundle.blocks.forEach(collect);
    const blockIdMap = new Map(this.document.getDocument().blocks.createImportIdMap(sourceIds));
    if (bundle.fromTextSelection && input.placement?.mergeText !== false && hasBlockRanges(selection) && !isStructuralSelection(selection)) {
      const target = this.document.selection.resolveBlockSelection(selection)?.blocks[0];
      if (target && bundle.blocks[0]) blockIdMap.set(bundle.blocks[0].id, target.id);
    }
    const sources = selectedClipboardElements(bundle);
    // An empty block card has no copied content and is omitted before converters see the maps.
    const retained = sources.filter(node => {
      if (node.type !== "block") return true;
      return blockIdsOf(node, bundle.blocks.map(block => block.id)).some(id => blockIdMap.has(id));
    });
    const elementIdMap = new Map(this.document.elements.createImportIdMap(retained.map(node => node.id)));
    const context = this.pasteContext(bundle, reactPanel, blockIdMap, elementIdMap, operation);
    const convert = (block: EditorBlock): EditorBlock => {
      const fields = this.converters.blocks.get(block.type)?.paste?.(this.blockNode(block), context);
      return { ...block, ...this.blockFields(fields), children: block.children.map(convert) };
    };
    bundle.blocks = bundle.blocks.map(convert);
    const elements = this.convertElements(bundle, reactPanel, blockIdMap, elementIdMap, operation);
    return { bundle, blockIdMap, elements };
  }

  private blockNode(block: EditorBlock): EditorBlockNode {
    const { children, ...node } = block;
    return structuredClone({ ...node, childIds: children.map(child => child.id) });
  }

  private blockFields(fields: Partial<BlockClipboardFields> | undefined) {
    if (!fields) return {};
    const { content, props, listProps, pluginData } = fields;
    return { ...(content === undefined ? {} : { content }), ...(props === undefined ? {} : { props }),
      ...(listProps === undefined ? {} : { listProps }), ...(pluginData === undefined ? {} : { pluginData }) };
  }

  /** Applies copy hooks once to detached nodes, retaining source identities and hierarchy. */
  private convertCopy(source: ClipboardBundle, reactPanel?: ReactPanelApi, operation: ClipboardCopyContext["operation"] = "copy"): ClipboardBundle {
    const bundle = structuredClone(source);
    const context: ClipboardCopyContext = { operation, sourceDocumentId: this.document.getDocument().id,
      reactPanel, rootBlockIds: reactPanel?.blocks.getRootIds() ?? this.document.blocks.getRootIds() };
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
   * @param reactPanel - Source panel restricting elements and block roots, or the owning runtime.
   * @param operation - Copy, cut or duplicate intent; defaults to copy.
   * @returns Detached bundle with source identities and ordered referenced block roots.
   */
  copyElements(ids: readonly string[], reactPanel: ReactPanelApi | ReactEditorApi, operation: ClipboardCopyContext["operation"] = "copy"): ClipboardBundle {
    return this.convertCopy(this.collectElements(ids, reactPanel), "editor" in reactPanel ? reactPanel : undefined, operation);
  }

  private collectElements(ids: readonly string[], reactPanel: ReactPanelApi | ReactEditorApi): ClipboardBundle {
    const elements: EditorElementNode[] = [];
    const seen = new Set<string>();
    const visit = (id: string): void => {
      if (seen.has(id)) return;
      const node = reactPanel.elements.getElementNode(id);
      if (!node) return;
      seen.add(id); elements.push(node); node.childIds.forEach(visit);
    };
    ids.forEach(visit);
    const referenced = new Set(elements.flatMap(node => this.converters.elements.get(node.type)?.getReferencedBlockIds?.(node, (reactPanel.blocks.getRootIds())) ?? []));
    const blocks = [...referenced].filter(id => {
      let parent = this.document.blocks.getParentId(id);
      while (parent) { if (referenced.has(parent)) return false; parent = this.document.blocks.getParentId(parent); }
      return true;
    }).flatMap(id => this.document.blocks.getBlock(id) ?? []);
    return { version: 4, blocks, elements, selectedElementIds: [...ids] };
  }

  private pasteContext(bundle: ClipboardBundle, reactPanel: ReactPanelApi | ReactEditorApi, blockIdMap: ReadonlyMap<string, string>, elementIdMap: ReadonlyMap<string, string>, operation: "paste" | "duplicate"): ClipboardPasteContext {
    return { operation, sourceDocumentId: bundle.sourceDocumentId, destinationDocumentId: this.document.getDocument().id,
      reactPanel: "editor" in reactPanel ? reactPanel : undefined, blockIdMap, elementIdMap, offset: { x: 24, y: 24 }, sourceRootBlockIds: bundle.blocks.map(block => block.id) };
  }

  /**
   * Converts selected canvas records without writing either document forest.
   * Empty block cards are omitted. Other elements retain their type and child order; creation
   * processors run later through ordinary insertion. Copied frames move by 24 document units on each axis.
   * @param bundle - Detached source records and referenced block roots.
   * @param reactPanel - Destination panel or document runtime used for placement and processors.
   * @param blockIdMap - Already allocated source-to-destination block IDs.
   * @param ids - Preallocated element IDs, or omitted to allocate them here.
   * @param operation - Paste or duplicate intent; defaults to paste.
   * @returns Converted records, element ID map and remapped block dependencies; insertion still validates them.
   * @throws If a type converter rejects the source data.
   */
  convertElements(bundle: ClipboardBundle, reactPanel: ReactPanelApi | ReactEditorApi, blockIdMap: ReadonlyMap<string, string>, ids?: ReadonlyMap<string, string>, operation: "paste" | "duplicate" = "paste"): ConvertedClipboardElements {
    const sources = selectedClipboardElements(bundle);
    if (!sources.length) return { nodes: [], idMap: new Map(), referencedBlocks: new Map() };
    const idMap = new Map(ids ?? this.document.elements.createImportIdMap(sources.map(node => node.id)));
    const referencedBlocks = new Map<string, readonly string[]>();
    const sourceRoots = bundle.blocks.map(block => block.id);
    for (const source of sources) {
      const references = this.converters.elements.get(source.type)?.getReferencedBlockIds?.(source, sourceRoots);
      if (!references) continue;
      const mapped = references.flatMap(id => blockIdMap.get(id) ?? []);
      if (!mapped.length && source.type === "block") idMap.delete(source.id);
      else if (idMap.has(source.id)) referencedBlocks.set(idMap.get(source.id)!, mapped);
    }
    const context = this.pasteContext(bundle, reactPanel, blockIdMap, idMap, operation);
    const topLayer = Math.max(0, ...reactPanel.elements.getElementNodes().map(node => node.zIndex));
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
        const writingType = defaultBlockType ?? this.editor.createDefaultBlock().type;
        const formats = this.editor.clipboardFormats.formatElement(node, bundle);
        const parsed = this.editor.clipboardFormats.parseContent({ html: formats.html, text: formats.plain }, { surface: "page", defaultBlockType: writingType });
        result.push(...clipboardContentBundle(parsed ?? { blocks: formats.plain ? [{ type: writingType, content: formats.plain }] : [] }).blocks);
      }
      node.childIds.forEach(visit);
    };
    (bundle.selectedElementIds ?? [...byId.keys()]).forEach(visit);
    bundle.blocks.forEach(block => { if (!included.has(block.id)) result.push(block); });
    return { ...bundle, blocks: result, elements: undefined, selectedElementIds: undefined };
  }

}
