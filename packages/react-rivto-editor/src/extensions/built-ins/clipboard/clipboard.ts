import { getBrowserPrimaryModifier } from "@chulane/rivto-root/browser";
import { BlockSelectionEndpoints } from "@chulane/rivto-page";
import { registerBlockClipboardActions } from "../block-handle/actions";
import {
  browserClipboardFormats,
  readClipboardEnvelope,
} from "../../../managers/clipboard/browser-clipboard";
import type {
  ClipboardData,
  ClipboardInput,
  ClipboardTarget,
  InputRoot,
} from "@chulane/rivto-root";
import type { ReactEditorExtensionApi } from "../../../editor/types";
import type { PanelInputRegistration } from "../../../panels/types";
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
import type { ClipboardEventPanel } from "./types";
import { blockIdsOf } from "../../../elements/block-element-projection";
import { KEYBOARD_BINDING_IDS, matchesShortcut, parseShortcut } from "../../../managers";
import { findEdgelessRuntime } from "../selection/edgeless-runtime";
import { isIndependentClipboardTarget } from "./clipboard-target";
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
  reactEditor: ReactEditorExtensionApi,
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

  const selectedCanvasElementIds = (reactPanel: ClipboardEventPanel): readonly string[] => {
    const snapshot = findEdgelessRuntime(reactPanel)?.get();
    return snapshot?.active ? snapshot.items : [];
  };

  /** Returns a core-compatible block selection for active canvas root objects. */
  const canvasSelection = (reactPanel: ClipboardEventPanel): Selection | undefined => {
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
   * Writes the core-produced flavors through the current clipboard capabilities.
   *
   * Caches the structured payload and plain text for later fallback even when
   * the browser supplies no clipboard data. Does not call the asynchronous Clipboard API.
   *
   * @param reactPanel - Panel whose editor formats the portable clipboard flavors.
   * @param clipboard - Synchronous format access, or null when unavailable.
   * @param bundle - Core-produced content to serialize and cache.
   * @returns After writing available event data and replacing the local fallback.
   * @throws If formatting, serialization, or a native clipboard write fails.
   */
  const writeClipboard = (
    reactPanel: ClipboardEventPanel,
    clipboard: ClipboardData | null,
    bundle: ClipboardBundle,
  ): void => {
    const portable = browserClipboardFormats(reactPanel.editor, bundle);
    const structured = JSON.stringify(bundle);
    clipboard?.write(RIVTO_CLIPBOARD_MIME, structured);
    clipboard?.write("text/html", portable.html);
    clipboard?.write("text/markdown", portable.markdown);
    clipboard?.write("text/plain", portable.plain);
    copiedClipboard = {
      structured,
      text: portable.plain,
    };
  };

  /**
   * Recovers custom data only when the clipboard still represents our last copy.
   *
   * A present custom format wins. The cached bundle is used when plain text is
   * absent or matches the cached copy; different plain text rejects the fallback.
   *
   * @param clipboard - Synchronous format access, or null when unavailable.
   * @returns Cached structured data when it matches, otherwise undefined.
   * @throws Propagates browser clipboard read failures.
   */
  const fallbackStructuredClipboard = (clipboard: ClipboardData | null): string | undefined => {
    if (clipboard?.read(RIVTO_CLIPBOARD_MIME)) {
      return;
    }
    const copied = copiedClipboard;
    const plain = clipboard?.read("text/plain") ?? "";
    return copied && (!plain || plain === copied.text) ? copied.structured : undefined;
  };

  /** Publishes the exact native endpoints before an asynchronous event can lag. */
  const synchronizeSelection = (reactPanel: ClipboardEventPanel): void => {
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
   * @param clipboard - Synchronous format access, or null when unavailable.
   * @param inputRoot - Browser capabilities for the occurrence receiving this paste.
   * @param inputRegistration - Routing lifetime captured by the initiating clipboard input.
   * @returns After invoking paste and scheduling any required selection restoration.
   * @throws If content parsing or delegated paste operations fail outside structured-data validation.
   */
  const pasteClipboard = (
    reactPanel: ClipboardEventPanel,
    clipboard: ClipboardData | null,
    inputRoot: Pick<InputRoot, "isAttached" | "clearSelection" | "focus">,
    inputRegistration: PanelInputRegistration,
  ): void => {
    const plainText = pasteAsPlainText;
    pasteAsPlainText = false;
    let structured: string | undefined;
    if (!plainText) {
      structured =
        clipboard?.read(RIVTO_CLIPBOARD_MIME) ||
        readClipboardEnvelope(clipboard?.read("text/html") ?? "") ||
        fallbackStructuredClipboard(clipboard);
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
          html: clipboard?.read("text/html") ?? "",
          text: clipboard?.read("text/plain") ?? "",
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
    if (!inputRegistration.isCurrent(inputRoot)) {
      return;
    }
    reactPanel.clipboard.paste({
      textTarget:
        canvas ??
        (active && hasBlockRanges(active) && !isStructuralSelection(active) ? active : undefined),
      defaultBlockType: resolveDefaultBlockType(),
      structured,
      text: clipboard?.read("text/plain"),
      bundle: sourceBundle,
      onPrepareError: options.onPrepareError,
      placement: {
        ...placement,
        mergeText: canvas ? false : undefined,
        preserveNewlines: plainText || undefined,
      },
    });
    if (!inputRegistration.isCurrent(inputRoot)) {
      return;
    }
    if (!canvas && isStructuralSelection(reactPanel.selection.get())) {
      // The paste event started in the old contenteditable, whose native caret
      // would override the newly selected blocks on the next keyboard event.
      // Move keyboard ownership to the surface, as pointer block selection does.
      inputRoot.clearSelection();
      if (inputRegistration.isCurrent(inputRoot)) {
        inputRoot.focus();
      }
    }
    // Only restore DOM selection after paste; content insertion must stay outside this callback.
    const selectionManager = reactPanel.selection;
    if (inputRegistration.isCurrent(inputRoot)) {
      selectionManager.scheduleIfSelectionUnchanged(() => {
        if (inputRegistration.isCurrent(inputRoot)) {
          selectionManager.restoreDOM();
        }
      });
    }
  };

  /**
   * Copies selected canvas elements, whole blocks, or an exact text range.
   * @returns Portable payload, or undefined for an empty range.
   */
  const copyCurrent = (
    reactPanel: ClipboardEventPanel,
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
   *
   * @param reactPanel - Occurrence containing the copied selection.
   * @param inputRoot - Root that received the cut input.
   * @param inputRegistration - Routing lifetime captured by the cut input.
   * @returns After deletion and, while current, scheduling caret restoration.
   * @throws Propagates deletion, selection, and scheduling failures.
   */
  const deleteCopiedSelection = (
    reactPanel: ClipboardEventPanel,
    inputRoot: Pick<InputRoot, "isAttached">,
    inputRegistration: PanelInputRegistration,
  ): void => {
    reactPanel.selection.delete();
    if (!inputRegistration.isCurrent(inputRoot)) {
      return;
    }
    // Capture before a delayed native selectionchange can report old DOM offsets.
    const selection = reactPanel.selection.get();
    // Only restore the post-cut caret/selection; cutting content has already completed.
    const selectionManager = reactPanel.selection;
    selectionManager.scheduleIfSelectionUnchanged(() => {
      if (inputRegistration.isCurrent(inputRoot)) {
        selectionManager.restoreDOM(selection);
      }
    });
  };

  reactEditor.events.register(
    {
      id: "clipboard.copy",
      type: "copy",
      scope: "surface",
      when: ({ clipboardTarget }) => !isIndependentClipboardTarget(clipboardTarget),
    },
    ({ reactPanel, clipboard }) => {
      synchronizeSelection(reactPanel);
      const payload = copyCurrent(reactPanel);
      if (!payload) {
        return false;
      }
      writeClipboard(reactPanel, clipboard, payload);
      return true;
    },
  );

  reactEditor.events.register(
    {
      id: "clipboard.cut",
      type: "cut",
      scope: "surface",
      when: ({ clipboardTarget }) => !isIndependentClipboardTarget(clipboardTarget),
    },
    ({ reactPanel, clipboard, inputRoot, inputRegistration }) => {
      synchronizeSelection(reactPanel);
      const canvasElementIds = selectedCanvasElementIds(reactPanel);
      const payload = copyCurrent(reactPanel, "cut");
      if (!payload) {
        return false;
      }
      writeClipboard(reactPanel, clipboard, payload);
      if (!inputRegistration.isCurrent(inputRoot)) {
        return true;
      }
      if (!canvasElementIds.length) {
        deleteCopiedSelection(reactPanel, inputRoot, inputRegistration);
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

  /**
   * Routes a document-level clipboard operation to the focused occurrence.
   *
   * Firefox can dispatch to the body while a panel owns a structural selection.
   * Independent text hosts retain their native clipboard handling.
   *
   * @param reactPanel - Occurrence providing document operations and selection.
   * @param operation - Copy, cut, or paste operation registered for this callback.
   * @param target - Live browser target and focus checks, if supplied.
   * @param insideRoot - Whether the input was already routed through the surface.
   * @param inputRoot - Capability identifying the receiving occurrence and its focus.
   * @param inputRegistration - Routing lifetime captured by the clipboard input.
   * @param clipboard - Synchronous clipboard access, or null when unavailable.
   * @returns True when the operation is handled by the editor.
   * @throws Propagates clipboard, selection, and document operation failures.
   */
  const handleDocumentClipboard = (
    reactPanel: ClipboardEventPanel,
    operation: ClipboardInput["type"],
    target: ClipboardTarget | undefined,
    insideRoot: boolean,
    inputRoot: Pick<InputRoot, "isAttached" | "clearSelection" | "focus" | "hasFocus">,
    inputRegistration: PanelInputRegistration,
    clipboard: ClipboardData | null,
  ): boolean => {
    if (insideRoot || isIndependentClipboardTarget(target)) {
      return false;
    }
    const editorHasFocus = inputRoot.hasFocus();
    const current = reactPanel.selection.get();
    const canvasElementIds = selectedCanvasElementIds(reactPanel);
    if (!editorHasFocus || (!canvasElementIds.length && !isStructuralSelection(current))) {
      return false;
    }
    let handled = false;
    if (operation === "paste") {
      pasteClipboard(reactPanel, clipboard, inputRoot, inputRegistration);
      handled = true;
    } else {
      const payload = copyCurrent(reactPanel, operation === "cut" ? "cut" : "copy");
      if (payload) {
        writeClipboard(reactPanel, clipboard, payload);
        if (!inputRegistration.isCurrent(inputRoot)) {
          return true;
        }
        if (!canvasElementIds.length && operation === "cut") {
          deleteCopiedSelection(reactPanel, inputRoot, inputRegistration);
        }
        if (
          canvasElementIds.length &&
          operation === "cut" &&
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
    ({ reactPanel, clipboardTarget, insideRoot, inputRoot, inputRegistration, clipboard }) =>
      handleDocumentClipboard(
        reactPanel,
        "copy",
        clipboardTarget,
        insideRoot,
        inputRoot,
        inputRegistration,
        clipboard,
      ),
  );
  reactEditor.events.register(
    {
      id: "clipboard.document-cut",
      type: "cut",
      target: "document",
    },
    ({ reactPanel, clipboardTarget, insideRoot, inputRoot, inputRegistration, clipboard }) =>
      handleDocumentClipboard(
        reactPanel,
        "cut",
        clipboardTarget,
        insideRoot,
        inputRoot,
        inputRegistration,
        clipboard,
      ),
  );
  reactEditor.events.register(
    {
      id: "clipboard.document-paste",
      type: "paste",
      target: "document",
    },
    ({ reactPanel, clipboardTarget, insideRoot, inputRoot, inputRegistration, clipboard }) =>
      handleDocumentClipboard(
        reactPanel,
        "paste",
        clipboardTarget,
        insideRoot,
        inputRoot,
        inputRegistration,
        clipboard,
      ),
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
    ({ reactPanel, keyboardInput }) => {
      if (!keyboardInput) {
        return false;
      }
      const binding = reactPanel.keyboard
        .list()
        .find((item) => item.id === KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText);
      const keys = binding?.keys ?? pasteAsPlainTextKeys;
      if (
        keys.some((key) =>
          matchesShortcut(parseShortcut(key), keyboardInput, getBrowserPrimaryModifier()),
        )
      ) {
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
      when: ({ clipboardTarget }) => !isIndependentClipboardTarget(clipboardTarget),
    },
    ({ reactPanel, clipboard, inputRoot, inputRegistration }) => {
      synchronizeSelection(reactPanel);
      pasteClipboard(reactPanel, clipboard, inputRoot, inputRegistration);
      return true;
    },
  );
  return unregisterElementPaste;
}
