/**
 * Clipboard operations and portable format contracts. Whole-block selection is structural; text editing uses explicit single-block ranges.
 */
import {
  isStructuralSelection,
  hasBlockRanges,
  getSelectedBlockIds,
  createStructuralSelection,
  RIVTO_CLIPBOARD_MIME,
  validateClipboardBundle,
  type BlockPrepareErrorHandler,
  type EditorBlockInput,
  type ClipboardBundle,
  type Selection,
} from "@chulane/rivto";
import type { ReactEditor } from "../../../types";
import {
  KEYBOARD_BINDING_IDS,
  matchesShortcut,
  parseShortcut,
  resolveSelectionEndpoints,
} from "../../../managers";
import { findEdgelessRuntime } from "../selection/edgeless-runtime";
import { isNonBlockEditableClipboardEvent } from "./clipboard-target";
import { blockIdsOf } from "../../../elements/block-element-projection";
import { ElementPasteStrategy } from "./element-paste-strategy";

const ELEMENT_PASTE_STRATEGY_ID = "paste.elements";

/** Configuration for browser clipboard integration. */
export interface ClipboardExtensionOptions {
  /**
   * Block type used when plain text creates additional blocks.
   *
   * When omitted, uses `reactEditor.createDefaultBlock().type` at paste time.
   */
  readonly defaultBlockType?: string;
  /**
   * Replaces one block rejected during core import preparation.
   *
   * @param block - Complete rejected block and nested data from the clipboard.
   * @param error - Validation error that caused rejection.
   * @returns A replacement block input that core prepares once more.
   */
  readonly onPrepareError?: BlockPrepareErrorHandler;
}

/**
 * Routes browser copy, cut, and paste events through the core clipboard manager.
 *
 * Without this bridge, a contenteditable handles paste itself and sees only
 * `text/plain`; native block types, list state, hierarchy, props, and plugin data are lost.
 * Core produces and consumes Rivto's structured clipboard MIME representation;
 * this component only transfers those portable values to and from the browser.
 * Ctrl/Cmd+Shift+V is remembered from keydown because ClipboardEvent has no
 * modifier fields; that shortcut ignores structured data and keeps multiline
 * plain text inside one block. Normal paste follows the copied selection type.
 *
 * DOM selection is synchronized immediately before each action because the
 * browser's `selectionchange` event may arrive after a keyboard clipboard event.
 * Visual label editors (non-block contenteditable hosts) are left to native
 * plain-text copy/paste so a previous block selection is not reused and a
 * copied label does not re-enter as a new canvas element.
 * Event listeners are delegated to the active surface root and are removed by
 * the keyboard and DOM event runtimes when this component unmounts.
 *
 * @param reactEditor - React editor whose DOM events and clipboard managers are connected.
 * @param options - Plain-text fallback and invalid-block handling configuration.
 * @returns Disposer that unregisters the canvas paste strategy.
 */
export function registerClipboard(
  reactEditor: ReactEditor,
  options: ClipboardExtensionOptions = {},
): () => void {
  const unregisterElementPaste = reactEditor.clipboard.pasteStrategies.register(
    ELEMENT_PASTE_STRATEGY_ID,
    new ElementPasteStrategy(reactEditor),
  );
  const resolveDefaultBlockType = (): string =>
    options.defaultBlockType ?? reactEditor.createDefaultBlock().type;
  // ClipboardEvent does not expose keyboard modifiers. Remember only the
  // immediately preceding paste shortcut, then consume it in `paste` below.
  let pasteAsPlainText = false;
  // Firefox can omit custom MIME data when a later keyboard paste event is
  // dispatched without a native DOM range. Retain the exact last editor copy
  // as a fallback, but only use it when the browser's plain text still matches.
  let copiedClipboard: { structured: string; text: string } | null = null;

  const selectedCanvasElementIds = (): readonly string[] => {
    const snapshot = findEdgelessRuntime(reactEditor)?.get();
    return snapshot?.active ? snapshot.items : [];
  };

  /** Returns a core-compatible block selection for active canvas root objects. */
  const canvasSelection = (): Selection | undefined => {
    if (reactEditor.mode.get() !== "edgeless") return undefined;
    const snapshot = findEdgelessRuntime(reactEditor)?.get();
    const blockIds = snapshot?.active ? snapshot.items.flatMap((id) => {
      const element = reactEditor.elements.getElement(id);
      return element?.type === "block" ? blockIdsOf(element, reactEditor.blocks.getRootIds()) : [];
    }) : [];
    return blockIds.length ? createStructuralSelection(blockIds) : undefined;
  };

  /** Writes the core-produced flavors into a native clipboard event. */
  const writeClipboard = (event: ClipboardEvent, bundle: ClipboardBundle): void => {
    const elementIds = selectedCanvasElementIds();
    if (elementIds.length) {
      bundle.elements = elementIds.flatMap((id) => reactEditor.elements.getElement(id) ?? []);
      bundle.selectedElementIds = [...elementIds];
    }
    const portable = reactEditor.clipboard.format(bundle.blocks);
    const structured = JSON.stringify(bundle);
    event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, structured);
    event.clipboardData?.setData("text/html", portable.html);
    event.clipboardData?.setData("text/markdown", portable.markdown);
    event.clipboardData?.setData("text/plain", portable.plain);
    copiedClipboard = {
      structured,
      text: portable.plain,
    };
  };

  /** Recovers custom data only when the event still represents our last copy. */
  const fallbackStructuredClipboard = (event: ClipboardEvent): string | undefined => {
    if (event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)) return;
    const copied = copiedClipboard;
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    return copied && (!plain || plain === copied.text) ? copied.structured : undefined;
  };

  /** Publishes the exact native endpoints before an asynchronous event can lag. */
  const synchronizeSelection = (): void => {
    if (canvasSelection()) return;
    const selection = reactEditor.selection.readDOM();
    if (selection) reactEditor.selection.set(selection);
  };

  /** Pastes either the richest clipboard flavor or one unbroken plain-text value. */
  const pasteClipboard = (event: ClipboardEvent): void => {
    const plainText = pasteAsPlainText;
    pasteAsPlainText = false;
    let structured: string | undefined;
    if (!plainText) {
      structured = event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)
        || fallbackStructuredClipboard(event);
    }
    const canvas = canvasSelection();
    // Paste has only two outcomes:
    // 1. Text is written into the current text selection.
    // 2. Complete blocks are inserted beside or inside the current block.
    let sourceBundle: ClipboardBundle | undefined;
    let parsedBlocks: EditorBlockInput[] | undefined;
    if (structured) {
      try {
        const parsed = JSON.parse(structured) as unknown;
        validateClipboardBundle(parsed);
        sourceBundle = parsed;
      } catch {
        sourceBundle = undefined;
      }
    }
    if (!sourceBundle && !plainText) {
      // HTML and Markdown parsers return complete blocks. They do not describe
      // a text selection, so their blocks are inserted as new blocks.
      const parsed = reactEditor.clipboard.parse({
        html: event.clipboardData?.getData("text/html") ?? "",
        text: event.clipboardData?.getData("text/plain") ?? "",
      });
      parsedBlocks = parsed;
    }
    // Use the canvas selection while calculating where pasted content belongs.
    // The completed paste replaces it with the newly selected content.
    if (canvas) reactEditor.selection.set(canvas);
    const active = reactEditor.selection.get();
    const lengthOf = (id: string) => reactEditor.blocks.getBlockNode(id)?.content.length ?? 0;
    const ends = active ? resolveSelectionEndpoints(active, lengthOf) : undefined;
    const activeId = ends?.head.blockId ?? active?.focusBlockId;
    const activeBlock = activeId ? reactEditor.blocks.getBlockNode(activeId) : undefined;
    const expanded = reactEditor.blockListProps.has("collapse") && activeBlock?.listProps.collapsed !== true;
    // Only whole-block paste needs a parent and sibling insertion position.
    // A native bundle marked `fromTextSelection` is pasted into text instead.
    const structuralSource = Boolean(parsedBlocks?.length)
      || Boolean(sourceBundle?.blocks.length && sourceBundle.fromTextSelection !== true);
    const placement = activeBlock && structuralSource
      ? expanded && reactEditor.blocks.hasChildren(activeBlock.id)
        ? { parentId: activeBlock.id, afterId: null }
        : { parentId: reactEditor.blocks.getParentId(activeBlock.id) ?? null, afterId: activeBlock.id }
      : undefined;
    if (parsedBlocks?.length) {
      // Parsed blocks do not need IDs. importForest validates them, assigns IDs,
      // inserts them, and returns the complete inserted roots.
      reactEditor.history.batchUpdates(() => {
        const imported = reactEditor.blocks.importForest(
          parsedBlocks,
          placement?.afterId ?? undefined,
          options.onPrepareError,
        );
        const insertedIds = imported.roots.map(({ id }) => id);
        if (placement?.parentId && placement.afterId === null && insertedIds.length) {
          reactEditor.blocks.moveBlocks(insertedIds, placement.parentId, "inside");
        }
        if (insertedIds.length) reactEditor.selection.set(createStructuralSelection(insertedIds));
      });
    } else {
      // Plain text and native Rivto clipboard data share this path. Text updates
      // the current text selection; a bundle of whole blocks inserts new blocks.
      reactEditor.clipboard.paste({
        textTarget: !canvas && active && hasBlockRanges(active)
          && !isStructuralSelection(active) ? active : undefined,
        defaultBlockType: resolveDefaultBlockType(),
        structured,
        text: event.clipboardData?.getData("text/plain"),
        bundle: sourceBundle,
        onPrepareError: options.onPrepareError,
        placement: {
          ...placement,
          mergeText: canvas ? false : undefined,
          preserveNewlines: plainText || undefined,
        },
      });
    }
    if (!canvas && isStructuralSelection(reactEditor.selection.get())) {
      const root = reactEditor.events.getRoot();
      // The paste event started in the old contenteditable, whose native caret
      // would override the newly selected blocks on the next keyboard event.
      // Move keyboard ownership to the surface, as pointer block selection does.
      root?.ownerDocument.getSelection()?.removeAllRanges();
      root?.focus({ preventScroll: true });
    }
    requestAnimationFrame(() => reactEditor.selection.restoreDOM());
  };

  /**
   * Copies selected canvas elements, whole blocks, or an exact text range.
   * @returns Portable payload, or undefined for an empty range.
   */
  const copyCurrent = (): ClipboardBundle | undefined => {
    const canvas = canvasSelection();
    const canvasElementIds = selectedCanvasElementIds();
    return canvas ? reactEditor.clipboard.copy(canvas)
      : canvasElementIds.length ? { version: 4, blocks: [] }
      : reactEditor.clipboard.copy();
  };

  /**
   * Deletes copied content and restores the resulting block-local caret.
   * @returns No value.
   */
  const deleteCopiedSelection = (): void => {
    reactEditor.selection.delete();
    // Capture before a delayed native selectionchange can report old DOM offsets.
    const selection = reactEditor.selection.get();
    requestAnimationFrame(() => reactEditor.selection.restoreDOM(selection));
  };

  reactEditor.events.register({
    id: "clipboard.copy",
    type: "copy",
    scope: "surface",
    when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
  }, ({ raw: event }) => {
    synchronizeSelection();
    const payload = copyCurrent();
    if (!payload) return false;
    writeClipboard(event, payload);
    return true;
  });

  reactEditor.events.register({
    id: "clipboard.cut",
    type: "cut",
    scope: "surface",
    when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
  }, ({ raw: event }) => {
    synchronizeSelection();
    const canvas = canvasSelection();
    const canvasElementIds = selectedCanvasElementIds();
    const payload = copyCurrent();
    if (!payload) return false;
    writeClipboard(event, payload);
    if (!canvasElementIds.length) deleteCopiedSelection();
    if (canvasElementIds.length) {
      reactEditor.history.batchUpdates(() => {
        if (canvas) getSelectedBlockIds(canvas).forEach((id) => reactEditor.blocks.removeBlock(id));
        reactEditor.elements.removeElements(canvasElementIds);
      });
      findEdgelessRuntime(reactEditor)?.clear();
    }
    return true;
  });

  /** Handles Firefox clipboard events dispatched to body for block selection. */
  const handleDocumentClipboard = (root: HTMLElement, event: ClipboardEvent, insideRoot: boolean): boolean => {
    if (insideRoot || isNonBlockEditableClipboardEvent(event)) return false;
    const activeElement = root.ownerDocument.activeElement;
    const editorHasFocus = activeElement === root ||
      (activeElement !== null && root.contains(activeElement));
    const current = reactEditor.selection.get();
    const canvas = canvasSelection();
    const canvasElementIds = selectedCanvasElementIds();
    if (!editorHasFocus || (!canvasElementIds.length && !isStructuralSelection(current))) return false;
    let handled = false;
    if (event.type === "paste") {
      pasteClipboard(event);
      handled = true;
    } else {
      const payload = canvas
        ? reactEditor.clipboard.copy(canvas)
        : copyCurrent();
      if (payload) {
        writeClipboard(event, payload);
        if (!canvasElementIds.length && event.type === "cut") deleteCopiedSelection();
        if (canvasElementIds.length && event.type === "cut") {
          reactEditor.history.batchUpdates(() => {
            if (canvas) getSelectedBlockIds(canvas).forEach((id) => reactEditor.blocks.removeBlock(id));
            reactEditor.elements.removeElements(canvasElementIds);
          });
          findEdgelessRuntime(reactEditor)?.clear();
        }
        handled = true;
      }
    }
    return handled;
  };

  reactEditor.events.register({
    id: "clipboard.document-copy",
    type: "copy",
    target: "document",
  }, ({ raw: event, insideRoot, root }) => (
    handleDocumentClipboard(root, event, insideRoot)
  ));
  reactEditor.events.register({
    id: "clipboard.document-cut",
    type: "cut",
    target: "document",
  }, ({ raw: event, insideRoot, root }) => (
    handleDocumentClipboard(root, event, insideRoot)
  ));
  reactEditor.events.register({
    id: "clipboard.document-paste",
    type: "paste",
    target: "document",
  }, ({ raw: event, insideRoot, root }) => (
    handleDocumentClipboard(root, event, insideRoot)
  ));

  const pasteAsPlainTextKeys = ["Primary+Shift+v"] as const;
  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText,
    keys: pasteAsPlainTextKeys,
  }, () => {
    pasteAsPlainText = true;
    return false;
  });

  const clearPasteAsPlainText = (): boolean => {
    pasteAsPlainText = false;
    return false;
  };
  reactEditor.events.register({
    id: "clipboard.paste-as-plain-text-release",
    type: "keyup",
    target: "window",
  }, ({ raw }) => {
    const binding = reactEditor.keyboard.list().find((item) => (
      item.id === KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText
    ));
    const keys = binding?.keys ?? pasteAsPlainTextKeys;
    if (keys.some((key) => matchesShortcut(parseShortcut(key), raw))) {
      return clearPasteAsPlainText();
    }
    return false;
  });
  reactEditor.events.register({
    id: "clipboard.paste-as-plain-text-blur",
    type: "blur",
    target: "window",
  }, clearPasteAsPlainText);

  reactEditor.events.register({
    id: "clipboard.paste",
    type: "paste",
    scope: "surface",
    when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
  }, ({ raw: event }) => {
    synchronizeSelection();
    pasteClipboard(event);
    return true;
  });
  return unregisterElementPaste;
}
