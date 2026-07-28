import { useRef } from "react";
import {
  DEFAULT_BLOCK_TYPE,
  RIVTO_CLIPBOARD_MIME,
  type ClipboardPayload,
} from "@chulane/rivto";
import { useEditor, useReactEditor } from "../hooks/editor/use-editor";
import { useDOMEvent } from "../hooks/editor/use-dom-event";
import { useKeyboardEvent } from "../hooks/editor/use-keyboard-event";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import {
  BUILTIN_KEYMAP,
  KEYBOARD_BINDING_IDS,
} from "../managers";

/** Configuration for browser clipboard integration. */
export interface ClipboardPluginProps {
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
 * modifier fields; that shortcut explicitly keeps copied partial text as
 * blocks. Normal paste follows the copied selection type.
 *
 * DOM selection is synchronized immediately before each action because the
 * browser's `selectionchange` event may arrive after a keyboard clipboard event.
 * Event listeners are delegated to the active surface root and are removed by
 * the unified event runtime when this component unmounts.
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
export function ClipboardPlugin({ defaultBlockType = DEFAULT_BLOCK_TYPE }: ClipboardPluginProps) {
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const { element: root } = useEditorRoot();
  // ClipboardEvent does not expose keyboard modifiers. Remember only the
  // immediately preceding paste shortcut, then consume it in `paste` below.
  const pasteTextAsBlocks = useRef(false);
  // Firefox can omit custom MIME data when a later keyboard paste event is
  // dispatched without a native DOM range. Retain the exact last editor copy
  // as a fallback, but only use it when the browser's plain text still matches.
  const copiedClipboard = useRef<{ structured: string; text: string } | null>(null);

  /** Writes the three core-produced flavors into a native clipboard event. */
  const writeClipboard = (event: ClipboardEvent, payload: ClipboardPayload): void => {
    const structured = JSON.stringify(payload.bundle);
    event.clipboardData?.setData(RIVTO_CLIPBOARD_MIME, structured);
    event.clipboardData?.setData("text/html", payload.html);
    event.clipboardData?.setData("text/plain", payload.text);
    copiedClipboard.current = {
      structured,
      text: payload.text,
    };
  };

  /** Recovers custom data only when the event still represents our last copy. */
  const fallbackStructuredClipboard = (event: ClipboardEvent): string | undefined => {
    if (event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)) return;
    const copied = copiedClipboard.current;
    const plain = event.clipboardData?.getData("text/plain") ?? "";
    return copied && (!plain || plain === copied.text) ? copied.structured : undefined;
  };

  /** Publishes the exact native endpoints before an asynchronous event can lag. */
  const synchronizeSelection = (): void => {
    if (!root) return;
    const selection = reactEditor.selection.readDOM();
    if (selection) editor.selection.set(selection);
  };

  useDOMEvent({
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

  useDOMEvent({
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
  const handleDocumentClipboard = (event: ClipboardEvent, insideRoot: boolean): boolean => {
    if (!root || insideRoot) return false;
    const activeElement = root.ownerDocument.activeElement;
    const editorHasFocus = activeElement === root ||
      (activeElement !== null && root.contains(activeElement));
    const current = editor.selection.get();
    if (!editorHasFocus || !current.length || current.some((item) => item.type === "text")) return false;
    if (event.type === "paste") {
      const mergeText = !pasteTextAsBlocks.current;
      pasteTextAsBlocks.current = false;
      editor.clipboard.paste({
        defaultBlockType,
        mergeText,
        structured: event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)
          || fallbackStructuredClipboard(event),
        text: event.clipboardData?.getData("text/plain"),
      });
      return true;
    }
    const payload = event.type === "cut"
      ? editor.clipboard.cut()
      : editor.clipboard.copy();
    if (!payload) return false;
    writeClipboard(event, payload);
    return true;
  };

  useDOMEvent({
    id: "clipboard.document-copy",
    type: "copy",
    target: "document",
  }, ({ raw: event, insideRoot }) => (
    handleDocumentClipboard(event, insideRoot)
  ));
  useDOMEvent({
    id: "clipboard.document-cut",
    type: "cut",
    target: "document",
  }, ({ raw: event, insideRoot }) => (
    handleDocumentClipboard(event, insideRoot)
  ));
  useDOMEvent({
    id: "clipboard.document-paste",
    type: "paste",
    target: "document",
  }, ({ raw: event, insideRoot }) => (
    handleDocumentClipboard(event, insideRoot)
  ));

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsBlocks,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.clipboardPasteAsBlocks]!,
  }, () => {
    pasteTextAsBlocks.current = true;
    return false;
  });

  useKeyboardEvent({
    id: KEYBOARD_BINDING_IDS.clipboardPasteAsBlocksRelease,
    keys: BUILTIN_KEYMAP[KEYBOARD_BINDING_IDS.clipboardPasteAsBlocksRelease]!,
    phase: "keyup",
    target: "window",
  }, () => {
    pasteTextAsBlocks.current = false;
    return false;
  });

  useDOMEvent({
    id: "clipboard.paste",
    type: "paste",
    scope: "surface",
  }, ({ raw: event }) => {
    synchronizeSelection();
    const mergeText = !pasteTextAsBlocks.current;
    pasteTextAsBlocks.current = false;
    editor.clipboard.paste({
      defaultBlockType,
      mergeText,
      structured: event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME)
        || fallbackStructuredClipboard(event),
      text: event.clipboardData?.getData("text/plain"),
    });
    return true;
  });

  return null;
}
