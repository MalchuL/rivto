import {
  DEFAULT_BLOCK_TYPE,
  isStructuralSelection,
  RIVTO_CLIPBOARD_MIME,
  type ClipboardPayload,
} from "@chulane/rivto";
import type { ReactEditor } from "../types";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
} from "../managers";

/** Configuration for browser clipboard integration. */
export interface ClipboardExtensionOptions {
  /** Block type used when plain text creates additional blocks. */
  readonly defaultBlockType?: string;
}

/**
 * Routes browser copy, cut, and paste events through the core clipboard manager.
 *
 * Without this bridge, a contenteditable handles paste itself and sees only
 * `text/plain`; native block types, hierarchy, props, and plugin data are lost.
 * Core produces and consumes Rivto's structured clipboard MIME representation;
 * this component only transfers those portable values to and from the browser.
 * Ctrl/Cmd+Shift+V is remembered from keydown because ClipboardEvent has no
 * modifier fields; that shortcut ignores structured data and keeps multiline
 * plain text inside one block. Normal paste follows the copied selection type.
 *
 * DOM selection is synchronized immediately before each action because the
 * browser's `selectionchange` event may arrive after a keyboard clipboard event.
 * Event listeners are delegated to the active surface root and are removed by
 * the keyboard and DOM event runtimes when this component unmounts.
 *
 * @example
 * ```tsx
 * <EditorView editor={editor}>
 *   <TextSelectionPlugin />
 *   <ClipboardPlugin defaultBlockType={DEFAULT_BLOCK_TYPE} />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export function registerClipboard(
  reactEditor: ReactEditor,
  { defaultBlockType = DEFAULT_BLOCK_TYPE }: ClipboardExtensionOptions = {},
): void {
  const { editor } = reactEditor;
  // ClipboardEvent does not expose keyboard modifiers. Remember only the
  // immediately preceding paste shortcut, then consume it in `paste` below.
  let pasteAsPlainText = false;
  // Firefox can omit custom MIME data when a later keyboard paste event is
  // dispatched without a native DOM range. Retain the exact last editor copy
  // as a fallback, but only use it when the browser's plain text still matches.
  let copiedClipboard: { structured: string; text: string } | null = null;

  /** Writes the core-produced flavors into a native clipboard event. */
  const writeClipboard = (event: ClipboardEvent, payload: ClipboardPayload): void => {
    const structured = JSON.stringify(payload.bundle);
    event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, structured);
    event.clipboardData?.setData("text/html", payload.html);
    event.clipboardData?.setData("text/markdown", payload.markdown);
    event.clipboardData?.setData("text/plain", payload.text);
    copiedClipboard = {
      structured,
      text: payload.text,
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
    const selection = reactEditor.selection.readDOM();
    if (selection) editor.selection.set(selection);
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
    editor.clipboard.paste({
      defaultBlockType,
      preserveNewlines: plainText,
      structured,
      text: event.clipboardData?.getData("text/plain"),
    });
    requestAnimationFrame(() => reactEditor.selection.restoreDOM());
  };

  reactEditor.events.register({
    id: "clipboard.copy",
    type: "copy",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    const payload = editor.clipboard.copy();
    if (!payload) return false;
    writeClipboard(event, payload);
    return true;
  });

  reactEditor.events.register({
    id: "clipboard.cut",
    type: "cut",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    const payload = editor.clipboard.cut();
    if (!payload) return false;
    writeClipboard(event, payload);
    return true;
  });

  /** Handles Firefox clipboard events dispatched to body for block selection. */
  const handleDocumentClipboard = (root: HTMLElement, event: ClipboardEvent, insideRoot: boolean): boolean => {
    if (insideRoot) return false;
    const activeElement = root.ownerDocument.activeElement;
    const editorHasFocus = activeElement === root ||
      (activeElement !== null && root.contains(activeElement));
    const current = editor.selection.get();
    if (!editorHasFocus || !current.length || !isStructuralSelection(current)) return false;
    if (event.type === "paste") {
      pasteClipboard(event);
      return true;
    }
    const payload = event.type === "cut"
      ? editor.clipboard.cut()
      : editor.clipboard.copy();
    if (!payload) return false;
    writeClipboard(event, payload);
    return true;
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

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.clipboardPasteAsPlainText]!,
  }, () => {
    pasteAsPlainText = true;
    return false;
  });

  reactEditor.keyboard.register({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsPlainTextRelease,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.clipboardPasteAsPlainTextRelease]!,
    phase: "keyup",
    target: "window",
  }, () => {
    pasteAsPlainText = false;
    return false;
  });

  reactEditor.events.register({
    id: "clipboard.paste",
    type: "paste",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    pasteClipboard(event);
    return true;
  });
}
