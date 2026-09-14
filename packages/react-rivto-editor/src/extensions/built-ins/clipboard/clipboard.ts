import { BlockSelectionEndpoints } from "@chulane/rivto-page";
import { registerBlockClipboardActions } from "../block-handle/actions";
import {
  browserClipboardFormats,
  readClipboardEnvelope,
} from "../../../managers/clipboard/browser-clipboard";
import type { ReactEditorApi } from "../../../editor/types";
import { clipboardContentBundle } from "../../../managers/clipboard/clipboard-content";
/**
 * Clipboard operations and portable format contracts. Whole-block selection is structural; text editing uses explicit single-block ranges.
 */
import {
  createStructuralSelection,
  hasBlockRanges,
  isStructuralSelection,
  RIVTO_CLIPBOARD_MIME,
  validateClipboardBundle,
  type BlockPastePlacement,
  type BlockPrepareErrorHandler,
  type ClipboardBundle,
  type Selection,
} from "@chulane/rivto";
import type { ReactPanelApi } from "../../../panels/types";
import { blockIdsOf } from "../../../elements/block-element-projection";
import { KEYBOARD_BINDING_IDS, matchesShortcut, parseShortcut } from "../../../managers";
import { findEdgelessRuntime } from "../selection/edgeless-runtime";
import { isNonBlockEditableClipboardEvent } from "./clipboard-target";
import { ElementPasteStrategy } from "./element-paste-strategy";

const ELEMENT_PASTE_STRATEGY_ID = "paste.elements";

/** Configuration for browser clipboard integration. */
export interface ClipboardExtensionOptions {
  /**
   * Block type used when plain text creates additional blocks.
   *
   * When omitted, uses `panel.defaultWritingBlockFactory.createEmptyBlock().type` at paste time.
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
 * Also registers the block menu's Copy, Cut, and Delete actions. Browser copies
 * carry structured data in both the custom MIME and an HTML envelope. Paste
 * prefers custom MIME, then the envelope, then the existing fallback; plain-text
 * paste bypasses all structured formats. Menu registrations follow extension
 * cleanup rather than the returned canvas-strategy disposer.
 *
 * @param reactEditor - React editor whose DOM events and clipboard managers are connected.
 * @param options - Plain-text fallback and invalid-block handling configuration.
 * @returns Disposer that unregisters the canvas paste strategy.
 */
export function registerClipboard(
  reactEditor: ReactEditorApi,
  options: ClipboardExtensionOptions = {},
): () => void {
  registerBlockClipboardActions(reactEditor);
  const unregisterElementPaste = reactEditor.pasteStrategies.register(
    ELEMENT_PASTE_STRATEGY_ID,
    new ElementPasteStrategy(reactEditor),
  );
  const resolveDefaultBlockType = (): string =>
    options.defaultBlockType ?? reactEditor.defaultWritingBlockFactory.createEmptyBlock().type;
  // ClipboardEvent does not expose keyboard modifiers. Remember only the
  // immediately preceding paste shortcut, then consume it in `paste` below.
  let pasteAsPlainText = false;
  // Firefox can omit custom MIME data when a later keyboard paste event is
  // dispatched without a native DOM range. Retain the exact last editor copy
  // as a fallback, but only use it when the browser's plain text still matches.
  let copiedClipboard: { structured: string; text: string } | null = null;

  const selectedCanvasElementIds = (reactPanel: ReactPanelApi): readonly string[] => {
    const snapshot = findEdgelessRuntime(reactPanel)?.get();
    return snapshot?.active ? snapshot.items : [];
  };

  /** Returns a core-compatible block selection for active canvas root objects. */
  const canvasSelection = (reactPanel: ReactPanelApi): Selection | undefined => {
    // Core mode may be edgeless while the active view is a page embedding.
    // Its clipboard actions must use the page selection, not canvas objects.
    if (reactPanel.getSurfaceType() !== "edgeless") {
      return undefined;
    }
    const snapshot = findEdgelessRuntime(reactPanel)?.get();
    const blockIds = snapshot?.active
      ? snapshot.items.flatMap((id) => {
          const element = reactPanel.elements.getElementNode(id);
          return element?.type === "block"
            ? blockIdsOf(element, reactPanel.blocks.getRootIds())
            : [];
        })
      : [];
    return blockIds.length ? createStructuralSelection(blockIds) : undefined;
  };

  /**
   * Writes the core-produced flavors into a native clipboard event.
   *
   * Caches the structured payload and plain text for later fallback even when
   * the event has no clipboardData. Does not call the asynchronous Clipboard API.
   *
   * @param reactPanel - Panel whose editor formats the portable clipboard flavors.
   * @param event - Native copy or cut event receiving the available formats.
   * @param bundle - Core-produced content to serialize and cache.
   * @returns After writing available event data and replacing the local fallback.
   * @throws If formatting, serialization, or a native clipboard write fails.
   */
  const writeClipboard = (
    reactPanel: ReactPanelApi,
    event: ClipboardEvent,
    bundle: ClipboardBundle,
  ): void => {
    const portable = browserClipboardFormats(reactPanel.editor, bundle);
    const structured = JSON.stringify(bundle);
    event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, structured);
    event.clipboardData?.setData("text/html", portable.html);
    event.clipboardData?.setData("text/markdown", portable.markdown);
    event.clipboardData?.setData("text/plain", portable.plain);
    copiedClipboard = {
      structured,
      text: portable.plain,
    };
    reactEditor.clipboard.writeProcessed(bundle, portable);
  };

  /** Recovers custom data only when the event still represents our last copy. */
  const fallbackStructuredClipboard = (event: ClipboardEvent): string | undefined => {
    if (event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)) {
      return;
    }
    const copied = copiedClipboard;
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    return copied && (!plain || plain === copied.text) ? copied.structured : undefined;
  };

  /** Publishes the exact native endpoints before an asynchronous event can lag. */
  const synchronizeSelection = (reactPanel: ReactPanelApi): void => {
    if (canvasSelection(reactPanel)) {
      return;
    }
    const selection = reactPanel.selection.readDOM();
    if (selection) {
      reactPanel.selection.set(selection);
    }
  };

  /**
   * Pastes either the richest clipboard flavor or one unbroken plain-text value.
   *
   * Consumes the pending plain-text override. Rich paste tries native structured
   * data, the HTML envelope, then the last-copy fallback. Invalid structured JSON
   * or bundles fall back to content parsing. Structural page paste restores focus
   * and schedules DOM selection restoration only while the resulting selection remains current.
   *
   * @param reactPanel - Destination panel supplying selection and insertion operations.
   * @param event - Native paste event supplying clipboard content.
   * @returns After invoking paste and scheduling any required selection restoration.
   * @throws If content parsing or delegated paste operations fail outside structured-data validation.
   */
  const pasteClipboard = (reactPanel: ReactPanelApi, event: ClipboardEvent): void => {
    const plainText = pasteAsPlainText;
    pasteAsPlainText = false;
    let structured: string | undefined;
    if (!plainText) {
      structured =
        event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME) ||
        readClipboardEnvelope(event.clipboardData?.getData("text/html") ?? "") ||
        fallbackStructuredClipboard(event);
    }
    const canvas = canvasSelection(reactPanel);
    // Paste has only two outcomes:
    // 1. Text is written into the current text selection.
    // 2. Complete blocks are inserted beside or inside the current block.
    let sourceBundle: ClipboardBundle | undefined;
    let parsedContent = false;
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
      const parsed = reactPanel.editor.clipboardFormats.parseContent(
        {
          html: event.clipboardData?.getData("text/html") ?? "",
          text: event.clipboardData?.getData("text/plain") ?? "",
        },
        {
          surface: reactPanel.getSurfaceType() === "edgeless" ? "edgeless" : "page",
          defaultBlockType: resolveDefaultBlockType(),
        },
      );
      if (parsed) {
        sourceBundle = clipboardContentBundle(parsed);
        parsedContent = true;
      }
    }
    // Calculate placement from the canvas selection without changing it before validation.
    // The completed paste replaces it with the newly selected content.
    const active = canvas ?? reactPanel.selection.get();
    const lengthOf = (id: string) => reactPanel.blocks.getBlockNode(id)?.content.length ?? 0;
    const ends = active ? BlockSelectionEndpoints.resolve(active, lengthOf) : undefined;
    const activeId = ends?.head.blockId ?? active?.focusBlockId;
    const activeBlock = activeId ? reactPanel.blocks.getBlockNode(activeId) : undefined;
    const expanded =
      reactPanel.editor.blockListProps.has("collapse") && activeBlock?.listProps.collapsed !== true;
    // Only whole-block paste needs a parent and sibling insertion position.
    // A native bundle marked `fromTextSelection` is pasted into text instead.
    const structuralSource =
      parsedContent ||
      Boolean(sourceBundle?.blocks.length && sourceBundle.fromTextSelection !== true);
    let placement: BlockPastePlacement | undefined;
    if (activeBlock && structuralSource) {
      if (
        !reactPanel.blocks.canRemove(activeBlock.id) ||
        (expanded && reactPanel.blocks.hasChildren(activeBlock.id))
      ) {
        placement = { parentId: activeBlock.id, afterId: null };
      } else {
        placement = {
          parentId: reactPanel.blocks.getParentId(activeBlock.id) ?? null,
          afterId: activeBlock.id,
        };
      }
    } else if (reactPanel.rootBlockId) {
      placement = { parentId: reactPanel.rootBlockId, afterId: null };
    }
    // Plain text and native Rivto clipboard data share this path. Text updates
    // the current text selection; a bundle of whole blocks inserts new blocks.
    reactPanel.clipboard.paste({
      textTarget:
        canvas ??
        (active && hasBlockRanges(active) && !isStructuralSelection(active) ? active : undefined),
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
    if (!canvas && isStructuralSelection(reactPanel.selection.get())) {
      const root = reactPanel.getRoot();
      // The paste event started in the old contenteditable, whose native caret
      // would override the newly selected blocks on the next keyboard event.
      // Move keyboard ownership to the surface, as pointer block selection does.
      root?.ownerDocument.getSelection()?.removeAllRanges();
      root?.focus({ preventScroll: true });
    }
    // Only restore DOM selection after paste; content insertion must stay outside this callback.
    const selectionManager = reactPanel.selection;
    selectionManager.scheduleIfSelectionUnchanged(() => selectionManager.restoreDOM());
  };

  /**
   * Copies selected canvas elements, whole blocks, or an exact text range.
   * @returns Portable payload, or undefined for an empty range.
   */
  const copyCurrent = (
    reactPanel: ReactPanelApi,
    operation: "copy" | "cut" = "copy",
  ): ClipboardBundle | undefined => {
    const canvasElementIds = selectedCanvasElementIds(reactPanel);
    if (canvasElementIds.length) {
      return reactEditor.clipboard.copyElements(canvasElementIds, reactPanel, operation);
    }
    const selection = reactPanel.selection.get();
    return selection ? reactEditor.clipboard.copy(selection, reactPanel, operation) : undefined;
  };

  /**
   * Deletes copied content and restores the resulting block-local caret.
   * @returns No value.
   */
  const deleteCopiedSelection = (reactPanel: ReactPanelApi): void => {
    reactPanel.selection.delete();
    // Capture before a delayed native selectionchange can report old DOM offsets.
    const selection = reactPanel.selection.get();
    // Only restore the post-cut caret/selection; cutting content has already completed.
    const selectionManager = reactPanel.selection;
    selectionManager.scheduleIfSelectionUnchanged(() => selectionManager.restoreDOM(selection));
  };

  reactEditor.events.register(
    {
      id: "clipboard.copy",
      type: "copy",
      scope: "surface",
      when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
    },
    ({ reactPanel, raw: event }) => {
      synchronizeSelection(reactPanel);
      const payload = copyCurrent(reactPanel);
      if (!payload) {
        return false;
      }
      writeClipboard(reactPanel, event, payload);
      return true;
    },
  );

  reactEditor.events.register(
    {
      id: "clipboard.cut",
      type: "cut",
      scope: "surface",
      when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
    },
    ({ reactPanel, raw: event }) => {
      synchronizeSelection(reactPanel);
      const canvasElementIds = selectedCanvasElementIds(reactPanel);
      const payload = copyCurrent(reactPanel, "cut");
      if (!payload) {
        return false;
      }
      writeClipboard(reactPanel, event, payload);
      if (!canvasElementIds.length) {
        deleteCopiedSelection(reactPanel);
      }
      if (
        canvasElementIds.length &&
        payload.blocks.every((block) => reactPanel.blocks.canRemove(block.id))
      ) {
        reactPanel.batchUpdates(() => {
          reactPanel.blocks.removeBlocks(payload.blocks.map((block) => block.id));
          reactPanel.elements.removeElements(canvasElementIds);
        });
        findEdgelessRuntime(reactPanel)?.clear();
      }
      return true;
    },
  );

  /** Handles Firefox clipboard events dispatched to body for block selection. */
  const handleDocumentClipboard = (
    reactPanel: ReactPanelApi,
    root: HTMLElement,
    event: ClipboardEvent,
    insideRoot: boolean,
  ): boolean => {
    if (insideRoot || isNonBlockEditableClipboardEvent(event)) {
      return false;
    }
    const activeElement = root.ownerDocument.activeElement;
    const editorHasFocus =
      activeElement === root || (activeElement !== null && root.contains(activeElement));
    const current = reactPanel.selection.get();
    const canvasElementIds = selectedCanvasElementIds(reactPanel);
    if (!editorHasFocus || (!canvasElementIds.length && !isStructuralSelection(current))) {
      return false;
    }
    let handled = false;
    if (event.type === "paste") {
      pasteClipboard(reactPanel, event);
      handled = true;
    } else {
      const payload = copyCurrent(reactPanel, event.type === "cut" ? "cut" : "copy");
      if (payload) {
        writeClipboard(reactPanel, event, payload);
        if (!canvasElementIds.length && event.type === "cut") {
          deleteCopiedSelection(reactPanel);
        }
        if (
          canvasElementIds.length &&
          event.type === "cut" &&
          payload.blocks.every((block) => reactPanel.blocks.canRemove(block.id))
        ) {
          reactPanel.batchUpdates(() => {
            reactPanel.blocks.removeBlocks(payload.blocks.map((block) => block.id));
            reactPanel.elements.removeElements(canvasElementIds);
          });
          findEdgelessRuntime(reactPanel)?.clear();
        }
        handled = true;
      }
    }
    return handled;
  };

  reactEditor.events.register(
    {
      id: "clipboard.document-copy",
      type: "copy",
      target: "document",
    },
    ({ reactPanel, raw: event, insideRoot, root }) =>
      handleDocumentClipboard(reactPanel, root, event, insideRoot),
  );
  reactEditor.events.register(
    {
      id: "clipboard.document-cut",
      type: "cut",
      target: "document",
    },
    ({ reactPanel, raw: event, insideRoot, root }) =>
      handleDocumentClipboard(reactPanel, root, event, insideRoot),
  );
  reactEditor.events.register(
    {
      id: "clipboard.document-paste",
      type: "paste",
      target: "document",
    },
    ({ reactPanel, raw: event, insideRoot, root }) =>
      handleDocumentClipboard(reactPanel, root, event, insideRoot),
  );

  const pasteAsPlainTextKeys = ["Primary+Shift+v"] as const;
  reactEditor.keyboard.register(
    {
      id: KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText,
      keys: pasteAsPlainTextKeys,
    },
    () => {
      pasteAsPlainText = true;
      return false;
    },
  );

  const clearPasteAsPlainText = (): boolean => {
    pasteAsPlainText = false;
    return false;
  };
  reactEditor.events.register(
    {
      id: "clipboard.paste-as-plain-text-release",
      type: "keyup",
      target: "window",
    },
    ({ reactPanel, raw }) => {
      const binding = reactPanel.keyboard
        .list()
        .find((item) => item.id === KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText);
      const keys = binding?.keys ?? pasteAsPlainTextKeys;
      if (keys.some((key) => matchesShortcut(parseShortcut(key), raw))) {
        return clearPasteAsPlainText();
      }
      return false;
    },
  );
  reactEditor.events.register(
    {
      id: "clipboard.paste-as-plain-text-blur",
      type: "blur",
      target: "window",
    },
    clearPasteAsPlainText,
  );

  reactEditor.events.register(
    {
      id: "clipboard.paste",
      type: "paste",
      scope: "surface",
      when: ({ raw }) => !isNonBlockEditableClipboardEvent(raw),
    },
    ({ reactPanel, raw: event }) => {
      synchronizeSelection(reactPanel);
      pasteClipboard(reactPanel, event);
      return true;
    },
  );
  return unregisterElementPaste;
}
