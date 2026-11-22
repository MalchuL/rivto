import type { FileCandidate, FileHandler } from "../../attachments";
import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";
import type {
  ClipboardBundle,
  ClipboardPasteInput,
  EditorBlock,
  EditorBlockNode,
  EditorPosition,
  PasteStrategyRegistry,
  EditorElementNode,
  PasteStrategy,
  Selection,
} from "@chulane/rivto";
import {
  BlockPasteStrategy,
  hasBlockRanges,
  isStructuralSelection,
  validateClipboardBundle,
} from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";
import { blockIdsOf } from "../../elements/block-element-projection";
import { blockElementClipboardConverter } from "../../elements/clipboard-converters";
import { ElementPasteStrategy } from "../../extensions/built-ins/clipboard/element-paste-strategy";
import { clipboardContentBundle, selectedClipboardElements } from "./clipboard-content";
import { ClipboardConverters } from "./clipboard-converters";
import { browserClipboardType } from "./utils";
import type {
  BlockClipboardConverter,
  ClipboardBinaryRepresentation,
  ClipboardPostprocessor,
  ClipboardWriter,
  ClipboardCopyContext,
  ClipboardPasteContext,
  ConvertedClipboardElements,
  CreatedClipboardRecords,
  ElementClipboardConverter,
  PanelPasteStrategy,
  BlockClipboardFields,
  PortableBlockFormats,
} from "./types";

import type { DocumentEditorAPI } from "@chulane/rivto";
import { ClipboardManager as CoreClipboardManager } from "@chulane/rivto";
import type { ReactPanelApi } from "../../panels/types";
import { isReactPanelApi } from "../../panels/is-react-panel-api";

/** Shared clipboard operations; paste receives a panel or a runtime for document-only commands. */
export class ClipboardManager {
  /** Runtime-owned type registrations used by structured and portable clipboard operations. */
  readonly converters: ClipboardConverters;
  /** Applies the runtime's empty-writing-block policy to blocks in the receiving panel. */
  private readonly blockPasteStrategy = new BlockPasteStrategy((block) =>
    this.editor.defaultWritingBlockFactory.isEmptyBlock(block),
  );
  /** File handlers in registration order. */
  private readonly fileHandlers: FileHandler[] = [];
  /** Revision published when file handler registrations change. */
  private readonly fileHandlerChanges = new RevisionStore();
  /** Explicit fallback when no registered file handler matches. */
  private defaultFileHandler?: FileHandler;
  /** Binary clipboard contributors in registration order. */
  private readonly postprocessors: ClipboardPostprocessor[] = [];
  /** Optional host writer for binary clipboard content. */
  private writer?: ClipboardWriter;

  /**
   * Creates structured clipboard operations shared by a document's panels.
   * @param document - Core runtime providing clipboard operations and paste transactions.
   * @param editor - React runtime providing shared clipboard operations and portable formats.
   * @param registrations - Extension registration ownership and destruction guard.
   */
  constructor(
    private readonly document: DocumentEditorAPI,
    private readonly editor: ReactEditorApi,
    /** Owner that guards and cleans up extension registrations. */
    private readonly registrations: RegistrationOwner,
  ) {
    this.converters = new ClipboardConverters(registrations);
    // Release revision listeners when their owning runtime is destroyed.
    registrations.registerCleanup(() => this.fileHandlerChanges.clear());
    this.registerElementConverter("block", blockElementClipboardConverter);
  }

  /**
   * Registers a file handler for matching, lookup, or explicit default selection.
   *
   * Matching handlers are tried in registration order before the single default.
   * Registrations are released by the extension lifecycle or the returned disposer.
   *
   * @param handler - File preparation, provider, matcher, and optional inline view.
   * @returns Disposer that unregisters the handler.
   * @throws If the runtime is inactive, the provider is invalid, the ID is empty or
   * duplicated.
   */
  registerFileHandler(handler: FileHandler): () => void {
    this.registrations.assertActive();
    if (
      !handler.provider ||
      typeof handler.provider.write !== "function" ||
      typeof handler.provider.read !== "function"
    ) {
      throw new TypeError("File handler requires a binary provider");
    }
    if (!handler.id.trim() || this.fileHandlers.some(({ id }) => id === handler.id)) {
      throw new Error(`File handler ${handler.id || "<empty>"} is already registered`);
    }
    this.fileHandlers.push(handler);
    // Removing a handler also clears it as the default and updates subscribers.
    const dispose = this.registrations.registerCleanup(() => {
      const index = this.fileHandlers.indexOf(handler);
      if (index >= 0) {
        this.fileHandlers.splice(index, 1);
      }
      if (this.defaultFileHandler === handler) {
        this.defaultFileHandler = undefined;
      }
      this.fileHandlerChanges.changed();
    });
    this.fileHandlerChanges.changed();
    return dispose;
  }

  /**
   * Sets a registered file handler as the default when no handler matches.
   *
   * Selecting another default replaces the previous selection. Removing the
   * selected registration clears it; no earlier selection is restored.
   *
   * @param id - ID of the registered handler to use as the default.
   * @returns Completion of the default selection.
   * @throws If the runtime is inactive or no handler has the supplied ID.
   */
  setDefaultFileHandler(id: string): void {
    this.registrations.assertActive();
    const handler = this.getFileHandler(id);
    if (!handler) {
      throw new Error(`File handler ${id} is not registered`);
    }
    if (this.defaultFileHandler !== handler) {
      this.defaultFileHandler = handler;
      this.fileHandlerChanges.changed();
    }
  }

  /**
   * Subscribes to changes in file-handler registrations or the selected fallback.
   *
   * @param listener - Callback invoked after the handler selection may have changed.
   * @returns Disposer that removes the listener.
   */
  subscribeFileHandlers(listener: () => void): () => void {
    return this.fileHandlerChanges.subscribe(listener);
  }

  /**
   * Selects the first matching handler, falling back to the generic attachment handler.
   *
   * @param candidate - File or reference to classify.
   * @returns Matching handler, or undefined when no handler is installed.
   */
  selectFileHandler(candidate: FileCandidate): FileHandler | undefined {
    // Exclude the fallback from matching so it cannot shadow a specific handler.
    return (
      this.fileHandlers.find(
        (entry) => entry !== this.defaultFileHandler && entry.matches?.(candidate),
      ) ?? this.defaultFileHandler
    );
  }

  /**
   * Looks up a registered attachment handler by its stable identifier.
   *
   * @param id - Attachment handler identifier.
   * @returns Registered handler, if present.
   */
  getFileHandler(id: string): FileHandler | undefined {
    return this.fileHandlers.find((handler) => handler.id === id);
  }

  /**
   * Registers one ordered final clipboard refinement.
   *
   * Contributions are considered in registration order and the first match is used.
   *
   * @param postprocessor - Single-object binary contribution hook.
   * @returns A disposer that removes this registration.
   * @throws If the runtime is inactive or the ID is empty or already registered.
   */
  registerPostprocessor(postprocessor: ClipboardPostprocessor): () => void {
    this.registrations.assertActive();
    if (!postprocessor.id.trim() || this.postprocessors.some(({ id }) => id === postprocessor.id)) {
      throw new Error(
        `Clipboard postprocessor ${postprocessor.id || "<empty>"} is already registered`,
      );
    }
    this.postprocessors.push(postprocessor);
    // Remove only this registration when its extension is destroyed.
    return this.registrations.registerCleanup(() => {
      const index = this.postprocessors.indexOf(postprocessor);
      if (index >= 0) {
        this.postprocessors.splice(index, 1);
      }
    });
  }

  /**
   * Registers the single host binary writer used before the browser fallback.
   *
   * @param writer - Privileged host clipboard bridge.
   * @returns A disposer that removes this writer.
   * @throws If the runtime is inactive, the ID is empty, or a writer is already registered.
   */
  registerWriter(writer: ClipboardWriter): () => void {
    this.registrations.assertActive();
    if (!writer.id.trim()) {
      throw new Error("Clipboard writer ID is required");
    }
    if (this.writer) {
      throw new Error(`Clipboard writer ${this.writer.id} is already registered`);
    }
    this.writer = writer;
    // Do not clear a writer installed after this registration was removed.
    return this.registrations.registerCleanup(() => {
      if (this.writer === writer) {
        this.writer = undefined;
      }
    });
  }

  /**
   * Reports whether a registered host or the current browser can attempt a binary write.
   *
   * @param mimeType - Exact file MIME type proposed for copying.
   * @returns Whether the custom copy menu should handle this type.
   */
  canWriteBinary(mimeType: string): boolean {
    const writer = this.writer;
    if (writer?.supports(mimeType) || writer?.supports("application/octet-stream")) {
      return true;
    }
    const view = (this.editor.panels.getActiveRoot() ?? this.editor.panels.getDefaultRoot())
      ?.ownerDocument.defaultView;
    return browserClipboardType(view, mimeType) !== undefined;
  }

  /**
   * Runs postprocessors and starts a binary write without delaying the copy event.
   *
   * Stops at the first binary contribution; portable formats remain available if
   * a postprocessor or asynchronous binary write fails.
   *
   * @param bundle - Structured selected objects.
   * @param formats - Synchronous portable clipboard formats.
   * @returns Starts writing the first available binary contribution.
   */
  writeProcessed(bundle: ClipboardBundle, formats: PortableBlockFormats): void {
    try {
      for (const processor of this.postprocessors) {
        const binary = processor.process({ bundle, formats });
        if (binary) {
          // Portable formats were already written synchronously, so ignore later binary failures.
          void this.writeBinary(binary, formats).catch(() => undefined);
          break;
        }
      }
    } catch {
      // The synchronous event already contains portable formats; refinement is optional.
    }
  }

  /**
   * Writes exact MIME bytes, falling back to application/octet-stream.
   *
   * The host writer is tried before the browser. A host failure permits browser
   * fallback; unsupported browser formats return false without awaiting the data.
   *
   * @param binary - Named attachment bytes and original MIME type.
   * @param formats - Portable representations included beside binary data.
   * @returns A promise resolving to whether a host or browser writer accepted the payload.
   * @throws If capability checks, binary preparation, or the browser write fail.
   */
  async writeBinary(
    binary: ClipboardBinaryRepresentation,
    formats: PortableBlockFormats = {
      plain: binary.name,
      markdown: binary.name,
      html: binary.name,
    },
  ): Promise<boolean> {
    // A contribution can reject even when no writer supports its MIME type.
    void Promise.resolve(binary.data).catch(() => undefined);
    const fallbackType = "application/octet-stream";
    const writer = this.writer;
    let hostType: string | undefined;
    if (writer?.supports(binary.mimeType)) {
      hostType = binary.mimeType;
    } else if (writer?.supports(fallbackType)) {
      hostType = fallbackType;
    }
    if (writer && hostType) {
      try {
        await writer.write({ ...binary, ...formats, mimeType: hostType });
        return true;
      } catch {
        // A failed host bridge may still be recoverable through ClipboardItem.
      }
    }
    const view = (this.editor.panels.getActiveRoot() ?? this.editor.panels.getDefaultRoot())
      ?.ownerDocument.defaultView;
    const ClipboardItemConstructor = view?.ClipboardItem;
    const clipboard = view?.navigator.clipboard;
    const browserType = browserClipboardType(view, binary.mimeType);
    if (!ClipboardItemConstructor || !clipboard?.write || !browserType) {
      return false;
    }
    // ClipboardItem requires the blob's type to match the selected browser format.
    const data = Promise.resolve(binary.data).then(
      (blob) => new Blob([blob], { type: browserType }),
    );
    await clipboard.write([
      new ClipboardItemConstructor(
        {
          [browserType]: data,
          "text/plain": new Blob([formats.plain], { type: "text/plain" }),
          "text/html": new Blob([formats.html], { type: "text/html" }),
        },
        { presentationStyle: "attachment" },
      ),
    ]);
    return true;
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

  /**
   * Exposes the core paste strategies extended by React clipboard integrations.
   *
   * @returns The core manager's current paste strategy registry.
   */
  get pasteStrategies(): PasteStrategyRegistry {
    return this.document.clipboard.pasteStrategies;
  }

  /**
   * Copies selected block subtrees, text ranges and canvas subtrees through type converters.
   * @param selection - Explicit selection, or omitted to read the panel/runtime selection.
   * @param reactPanel - Source panel defining Panel roots; omitted for a document-only copy.
   * @param operation - Copy, cut or duplicate intent supplied to converters; defaults to copy.
   * @returns Detached payload, or undefined for an empty selection. Does not write the document.
   * @throws If the source panel belongs to another document, the selection is outside its boundaries,
   * or a converter rejects the copied data.
   */
  copy(
    selection?: Selection,
    reactPanel?: ReactPanelApi,
    operation: ClipboardCopyContext["operation"] = "copy",
  ): ClipboardBundle | undefined {
    const current = selection ?? (reactPanel?.selection ?? this.document.selection).get();
    if (!current) {
      // There is no selection in the requested owner to serialize.
      return;
    }
    if (reactPanel) {
      this.requirePanelSelection(reactPanel, current);
    }
    let bundle = this.document.clipboard.copy(current);
    if (current.elements?.length) {
      const elements = this.collectElements(current.elements, reactPanel ?? this.editor);
      const included = new Set(elements.blocks.map((block) => block.id));
      elements.blocks.push(...(bundle?.blocks.filter((block) => !included.has(block.id)) ?? []));
      bundle = elements;
    }
    return bundle ? this.convertCopy(bundle, reactPanel, operation) : undefined;
  }

  /**
   * Copies an explicit text selection through block converters, excluding unselected children.
   * @param selection - Block text ranges to copy.
   * @param reactPanel - Optional source panel supplied to converters.
   * @returns Detached partial-text bundle, or undefined when there is no text to copy.
   * @throws If the source panel belongs to another document, the selection is outside its boundaries,
   * or a converter rejects the copied data.
   */
  copyText(selection: Selection, reactPanel?: ReactPanelApi): ClipboardBundle | undefined {
    if (reactPanel) {
      this.requirePanelSelection(reactPanel, selection);
    }
    const bundle = this.document.clipboard.copyText(selection);
    return bundle ? this.convertCopy(bundle, reactPanel) : undefined;
  }

  /**
   * Copies the supplied selection and checks portable formats before deleting its content.
   *
   * The panel owns selection lookup and deletion when supplied. Otherwise the document
   * owns both. Conversion and formatting finish before deletion begins.
   *
   * @param selection - Content to cut, defaulting to the selection of the chosen owner.
   * @param reactPanel - Source panel providing selection boundaries and converter context.
   * @returns Detached copied bundle, or undefined when there is no copyable selection.
   * @throws If the panel belongs to another document, the selection is outside the panel,
   * conversion or formatting fails, or deletion fails.
   */
  cut(selection?: Selection, reactPanel?: ReactPanelApi): ClipboardBundle | undefined {
    const owner = reactPanel?.selection ?? this.document.selection;
    const current = selection ?? owner.get();
    if (!current) {
      return;
    }
    const bundle = this.copy(current, reactPanel, "cut");
    if (!bundle) {
      // An empty copy must leave the original content intact.
      return;
    }
    this.editor.clipboardFormats.formatBundle(bundle);
    owner.delete(current);
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
  paste(
    input: ClipboardPasteInput = {},
    reactPanel: ReactPanelApi | ReactEditorApi = this.editor,
    operation: "paste" | "duplicate" = "paste",
  ): EditorPosition | undefined {
    input ??= {};
    const selection = input.textTarget ??
      reactPanel.selection.get() ?? { type: "selection" as const, blocks: [], elements: [] };
    if (isReactPanelApi(reactPanel)) {
      if (
        selection.blocks.some(({ id }) => !reactPanel.blocks.hasBlock(id)) ||
        selection.elements?.some((id) => !reactPanel.elements.hasElement(id))
      ) {
        throw new Error("Paste selection is outside panel");
      }
      if (
        input.placement?.parentId != null &&
        input.placement.parentId !== reactPanel.rootBlockId &&
        !reactPanel.blocks.hasBlock(input.placement.parentId)
      ) {
        throw new Error("Paste parent is outside panel");
      }
      if (
        input.placement?.afterId != null &&
        !reactPanel.blocks.canRemove(input.placement.afterId)
      ) {
        throw new Error("Paste anchor is outside panel or protected");
      }
    }
    let bundle = input.bundle;
    if (!bundle && input.structured) {
      try {
        const parsed: unknown = JSON.parse(input.structured);
        validateClipboardBundle(parsed);
        bundle = parsed;
      } catch {
        /* Core retains the plain-text fallback for invalid structured data. */
      }
    }
    let convertedElements: ConvertedClipboardElements | undefined;
    const created: CreatedClipboardRecords = { blockIds: new Set(), elementIds: new Set() };
    const previousSelection = this.document.selection.get();
    if (bundle) {
      validateClipboardBundle(bundle);
      let preparedBundle = structuredClone(bundle);
      if (
        isReactPanelApi(reactPanel) &&
        reactPanel.getSurfaceType() !== "edgeless" &&
        preparedBundle.elements?.length
      ) {
        // Page pastes traverse selected element trees, retaining referenced blocks and converting visuals to writing blocks.
        const byId = new Map(preparedBundle.elements.map((node) => [node.id, node]));
        const blocks = new Map(preparedBundle.blocks.map((block) => [block.id, block]));
        const sourceRootIds = [...blocks.keys()];
        const included = new Set<string>();
        const result: EditorBlock[] = [];
        const seen = new Set<string>();
        const visit = (id: string): void => {
          if (seen.has(id)) {
            // A selected ancestor may already have visited this element.
            return;
          }
          seen.add(id);
          const node = byId.get(id);
          if (!node) {
            // Detached payloads can refer to an element missing from this bundle.
            return;
          }
          const converter = this.converters.elements.get(node.type);
          const refs = converter?.getReferencedBlockIds?.(node, sourceRootIds);
          if (refs) {
            refs.forEach((id) => {
              const block = blocks.get(id);
              if (block && !included.has(id)) {
                included.add(id);
                result.push(block);
              }
            });
          } else if (converter?.format) {
            const writingType =
              input.defaultBlockType ??
              this.editor.defaultWritingBlockFactory.createEmptyBlock().type;
            const formats = this.editor.clipboardFormats.formatElement(node, preparedBundle);
            const parsed = this.editor.clipboardFormats.parseContent(
              { html: formats.html, text: formats.plain },
              { surface: "page", defaultBlockType: writingType },
            );
            result.push(
              ...clipboardContentBundle(
                parsed ?? {
                  blocks: formats.plain ? [{ type: writingType, content: formats.plain }] : [],
                },
              ).blocks,
            );
          }
          node.childIds.forEach(visit);
        };
        (preparedBundle.selectedElementIds ?? [...byId.keys()]).forEach(visit);
        preparedBundle.blocks.forEach((block) => {
          if (!included.has(block.id)) {
            result.push(block);
          }
        });
        preparedBundle = {
          ...preparedBundle,
          blocks: result,
          elements: undefined,
          selectedElementIds: undefined,
        };
      }
      const sourceIds: string[] = [];
      // Collect source block IDs recursively before allocating destination IDs.
      const collect = (block: EditorBlock): void => {
        sourceIds.push(block.id);
        block.children.forEach(collect);
      };
      preparedBundle.blocks.forEach(collect);
      const blockIdMap = new Map(this.document.getDocument().blocks.createImportIdMap(sourceIds));
      if (
        preparedBundle.fromTextSelection &&
        input.placement?.mergeText !== false &&
        hasBlockRanges(selection) &&
        !isStructuralSelection(selection)
      ) {
        const target = this.document.selection.resolveBlockSelection(selection)?.blocks[0];
        if (target && preparedBundle.blocks[0]) {
          blockIdMap.set(preparedBundle.blocks[0].id, target.id);
        }
      }
      const sources = selectedClipboardElements(preparedBundle);
      // An empty block card has no copied content and is omitted before converters see the maps.
      const sourceRootIds = preparedBundle.blocks.map((block) => block.id);
      const retained = sources.filter((node) => {
        if (node.type !== "block") {
          // Only block cards depend on referenced roots being copied.
          return true;
        }
        return blockIdsOf(node, sourceRootIds).some((id) => blockIdMap.has(id));
      });
      const elementIdMap = new Map(
        this.document.elements.createImportIdMap(retained.map((node) => node.id)),
      );
      const context = this.pasteContext(
        preparedBundle,
        reactPanel,
        blockIdMap,
        elementIdMap,
        operation,
      );
      // Apply the paste converter recursively while preserving child order.
      const convert = (block: EditorBlock): EditorBlock => {
        const fields = this.converters.blocks
          .get(block.type)
          ?.paste?.(this.blockNode(block), context);
        return { ...block, ...this.blockFields(fields), children: block.children.map(convert) };
      };
      preparedBundle.blocks = preparedBundle.blocks.map(convert);
      const elements = this.convertElements(
        preparedBundle,
        reactPanel,
        blockIdMap,
        elementIdMap,
        operation,
      );

      input = { ...input, bundle: preparedBundle, blockIdMap };
      convertedElements = elements;
      for (const id of blockIdMap.values()) {
        if (!this.document.blocks.hasBlock(id)) {
          created.blockIds.add(id);
        }
      }
      for (const id of elements.idMap.values()) {
        if (!this.document.elements.hasElement(id)) {
          created.elementIds.add(id);
        }
      }
    }
    // A local pipeline retains the destination even if a strategy invokes another paste.
    const clipboard = new CoreClipboardManager(reactPanel, this.pasteStrategies);
    const strategies = this.pasteStrategies.getPasteStrategies();
    if (!strategies.some((strategy) => strategy instanceof ElementPasteStrategy)) {
      strategies.push(new ElementPasteStrategy(this.editor));
    }
    const boundStrategies = strategies.map((strategy) => {
      let bound = strategy;
      if (strategy instanceof ElementPasteStrategy) {
        bound = new ElementPasteStrategy(reactPanel, convertedElements, created);
      } else if (strategy instanceof BlockPasteStrategy) {
        bound = this.blockPasteStrategy;
      } else if (isPanelPasteStrategy(strategy) && isReactPanelApi(reactPanel)) {
        // The strategy is registered editor-wide, but this paste must use the receiving panel's bounds.
        bound = strategy.createPanelStrategy(reactPanel);
      }
      return bound;
    });
    // An inactive panel has no caret; undefined would make core borrow another panel's selection.
    const root = isReactPanelApi(reactPanel) ? reactPanel.rootBlockId : undefined;
    const placement = { ...input.placement };
    if (root && placement.parentId === root) {
      placement.parentId = null;
    }
    if (
      root &&
      !selection.blocks.length &&
      placement.afterId === undefined &&
      placement.parentId === undefined
    ) {
      placement.parentId = null;
      placement.afterId =
        (reactPanel.blocks.includeRoot
          ? reactPanel.blocks.getChildIds(root)
          : reactPanel.blocks.getRootIds()
        ).at(-1) ?? null;
    }
    return this.document.history.batchUpdates(() => {
      try {
        return clipboard.paste({ ...input, placement, textTarget: selection }, boundStrategies);
      } catch (error) {
        // The text-merge destination existed before paste and is deliberately absent from these sets.
        try {
          this.document.elements.removeElements(
            [...created.elementIds].filter((id) => this.document.elements.hasElement(id)),
          );
          for (const id of created.blockIds) {
            if (this.document.blocks.hasBlock(id)) {
              this.document.blocks.removeBlock(id);
            }
          }
          if (previousSelection) {
            this.document.selection.set(previousSelection);
          } else {
            this.document.selection.clear();
          }
        } catch (cleanupError) {
          throw new AggregateError([error, cleanupError], "Clipboard insertion and cleanup failed");
        }
        throw error;
      }
    });
  }

  /**
   * Collects selected canvas subtrees and referenced block trees before applying copy hooks once.
   * @param ids - Selected element IDs; overlapping subtrees are visited only once.
   * @param reactPanel - Source panel restricting elements and block roots, or the owning runtime.
   * @param operation - Copy, cut or duplicate intent; defaults to copy.
   * @returns Detached bundle with source identities and ordered referenced block roots.
   */
  copyElements(
    ids: readonly string[],
    reactPanel: ReactPanelApi | ReactEditorApi,
    operation: ClipboardCopyContext["operation"] = "copy",
  ): ClipboardBundle {
    return this.convertCopy(
      this.collectElements(ids, reactPanel),
      isReactPanelApi(reactPanel) ? reactPanel : undefined,
      operation,
    );
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
  convertElements(
    bundle: ClipboardBundle,
    reactPanel: ReactPanelApi | ReactEditorApi,
    blockIdMap: ReadonlyMap<string, string>,
    ids?: ReadonlyMap<string, string>,
    operation: "paste" | "duplicate" = "paste",
  ): ConvertedClipboardElements {
    const sources = selectedClipboardElements(bundle);
    if (!sources.length) {
      return { nodes: [], idMap: new Map(), referencedBlocks: new Map() };
    }
    const idMap = new Map(
      ids ?? this.document.elements.createImportIdMap(sources.map((node) => node.id)),
    );
    const referencedBlocks = new Map<string, readonly string[]>();
    const sourceRoots = bundle.blocks.map((block) => block.id);
    for (const source of sources) {
      const references = this.converters.elements
        .get(source.type)
        ?.getReferencedBlockIds?.(source, sourceRoots);
      if (!references) {
        continue;
      }
      const mapped = references.flatMap((id) => blockIdMap.get(id) ?? []);
      if (!mapped.length && source.type === "block") {
        idMap.delete(source.id);
      } else if (idMap.has(source.id)) {
        referencedBlocks.set(idMap.get(source.id)!, mapped);
      }
    }
    const context = this.pasteContext(bundle, reactPanel, blockIdMap, idMap, operation);
    const topLayer = Math.max(
      0,
      ...reactPanel.elements.getElementNodes().map((node) => node.zIndex),
    );
    const nodes = sources.flatMap((source, index): EditorElementNode[] => {
      const id = idMap.get(source.id);
      if (!id) {
        return [];
      }
      const fields = this.converters.elements
        .get(source.type)
        ?.paste?.(structuredClone(source), context);
      const input = {
        ...source,
        id,
        childIds: [],
        props: fields?.props ?? source.props,
        frame: {
          ...source.frame,
          x: source.frame.x + context.offset.x,
          y: source.frame.y + context.offset.y,
        },
        zIndex: topLayer + index + 1,
      };
      return [{ ...input, childIds: source.childIds.flatMap((child) => idMap.get(child) ?? []) }];
    });
    return { nodes, idMap, referencedBlocks };
  }

  /**
   * Rejects clipboard selections containing records outside this occurrence.
   *
   * @param reactPanel - Source panel defining the visible records.
   * @param selection - Candidate clipboard source selection.
   * @returns After every selected record is found inside this panel.
   * @throws If the panel belongs to another document or any selected record is outside the panel.
   */
  private requirePanelSelection(reactPanel: ReactPanelApi, selection: Selection): void {
    if (reactPanel.getDocument() !== this.document.getDocument()) {
      throw new Error("Clipboard source panel belongs to a different document");
    }
    if (
      selection.blocks.some(({ id }) => !reactPanel.blocks.hasBlock(id)) ||
      selection.elements?.some((id) => !reactPanel.elements.hasElement(id))
    ) {
      throw new Error("Clipboard selection is outside panel");
    }
  }

  /**
   * Converts a recursive block snapshot into a detached shallow node.
   *
   * @param block - Block snapshot or input used by this operation.
   * @returns Block fields with direct child IDs instead of child snapshots.
   */
  private blockNode(block: EditorBlock): EditorBlockNode {
    const { children, ...node } = block;
    return structuredClone({ ...node, childIds: children.map((child) => child.id) });
  }

  /**
   * Restricts a converter patch to defined clipboard-editable block fields.
   *
   * @param fields - Optional converter result to restrict to supported block fields.
   * @returns Allowed fields, or an empty patch when the converter returned nothing.
   */
  private blockFields(fields: Partial<BlockClipboardFields> | undefined) {
    if (!fields) {
      return {};
    }
    const { content, props, listProps, pluginData } = fields;
    return {
      ...(content === undefined ? {} : { content }),
      ...(props === undefined ? {} : { props }),
      ...(listProps === undefined ? {} : { listProps }),
      ...(pluginData === undefined ? {} : { pluginData }),
    };
  }

  /**
   * Applies copy hooks once to detached nodes, retaining source identities and hierarchy.
   *
   * The source bundle is cloned before converters run and the returned bundle
   * records the current source document ID.
   *
   * @param source - Clipboard snapshot to clone and convert.
   * @param reactPanel - Optional source panel supplied to converters.
   * @param operation - Copy, cut, or duplicate intent; defaults to copy.
   * @returns Converted bundle with the original source left unchanged.
   * @throws If cloning or a converter fails.
   */
  private convertCopy(
    source: ClipboardBundle,
    reactPanel?: ReactPanelApi,
    operation: ClipboardCopyContext["operation"] = "copy",
  ): ClipboardBundle {
    const bundle = structuredClone(source);
    const context: ClipboardCopyContext = {
      operation,
      sourceDocumentId: this.document.getDocument().id,
      reactPanel,
      rootBlockIds: reactPanel?.blocks.getRootIds() ?? this.document.blocks.getRootIds(),
    };
    // Apply each block's copy converter recursively to its descendants.
    const visit = (block: EditorBlock): EditorBlock => ({
      ...block,
      ...this.blockFields(
        this.converters.blocks.get(block.type)?.copy?.(this.blockNode(block), context),
      ),
      children: block.children.map(visit),
    });
    bundle.blocks = bundle.blocks.map(visit);
    bundle.elements = bundle.elements?.map((element) => {
      const fields = this.converters.elements
        .get(element.type)
        ?.copy?.(structuredClone(element), context);
      return { ...element, props: fields?.props ?? element.props };
    });
    bundle.sourceDocumentId = context.sourceDocumentId;
    return bundle;
  }

  /**
   * Collects selected element subtrees and referenced block forests without duplicating visited records.
   *
   * @param ids - Stable IDs of the elements or blocks to include.
   * @param reactPanel - Panel-scoped operations, or editor-wide operations when no panel is supplied.
   * @returns Clipboard bundle containing the selected elements and referenced root blocks.
   */
  private collectElements(
    ids: readonly string[],
    reactPanel: ReactPanelApi | ReactEditorApi,
  ): ClipboardBundle {
    const elements: EditorElementNode[] = [];
    const seen = new Set<string>();
    // Collect existing canvas elements and descendants without revisiting IDs.
    const visit = (id: string): void => {
      if (seen.has(id)) {
        return;
      }
      const node = reactPanel.elements.getElementNode(id);
      if (!node) {
        return;
      }
      seen.add(id);
      elements.push(node);
      node.childIds.forEach(visit);
    };
    ids.forEach(visit);
    const referenced = new Set(
      elements.flatMap(
        (node) =>
          this.converters.elements
            .get(node.type)
            ?.getReferencedBlockIds?.(node, reactPanel.blocks.getRootIds()) ?? [],
      ),
    );
    const blocks = [...referenced]
      .filter((id) => {
        let parent = this.document.blocks.getParentId(id);
        while (parent) {
          if (referenced.has(parent)) {
            return false;
          }
          parent = this.document.blocks.getParentId(parent);
        }
        return true;
      })
      .flatMap((id) => this.document.blocks.getBlock(id) ?? []);
    return { version: 4, blocks, elements, selectedElementIds: [...ids] };
  }

  /**
   * Builds a converter context with destination identity, ID maps, panel scope, and the 24-unit paste offset.
   *
   * @param bundle - Clipboard bundle containing source blocks, elements, and identity metadata.
   * @param reactPanel - Panel-scoped operations, or editor-wide operations when no panel is supplied.
   * @param blockIdMap - Source-to-destination block ID mapping.
   * @param elementIdMap - Source-to-destination element ID mapping.
   * @param operation - Clipboard operation associated with conversion; defaults are specified by the method signature.
   * @returns Context for paste or duplicate conversion.
   */
  private pasteContext(
    bundle: ClipboardBundle,
    reactPanel: ReactPanelApi | ReactEditorApi,
    blockIdMap: ReadonlyMap<string, string>,
    elementIdMap: ReadonlyMap<string, string>,
    operation: "paste" | "duplicate",
  ): ClipboardPasteContext {
    return {
      operation,
      sourceDocumentId: bundle.sourceDocumentId,
      destinationDocumentId: this.document.getDocument().id,
      reactPanel: isReactPanelApi(reactPanel) ? reactPanel : undefined,
      blockIdMap,
      elementIdMap,
      offset: { x: 24, y: 24 },
      sourceRootBlockIds: bundle.blocks.map((block) => block.id),
    };
  }
}

/**
 * Checks whether a paste strategy supports binding to a rendered panel.
 *
 * @param strategy - Shared paste strategy to inspect.
 * @returns Whether it provides the panel binding contract.
 */
function isPanelPasteStrategy(strategy: PasteStrategy): strategy is PanelPasteStrategy {
  return "createPanelStrategy" in strategy && typeof strategy.createPanelStrategy === "function";
}
