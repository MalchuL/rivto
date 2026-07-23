import { useEffect, useRef } from "react";
import { DEFAULT_BLOCK_TYPE } from "@chulane/rivto";
import { RIVTO_CLIPBOARD_MIME } from "@chulane/rivto";
import { useEditor } from "../hooks/editor/use-editor";
import { useEditorEvent } from "../hooks/editor/use-editor-event";
import { useEditorRoot } from "../hooks/editor/use-editor-root";
import { readEditorDOMSelection } from "../hooks/utils/editor-dom-selection";

/** Configuration for browser clipboard integration. */
export interface ClipboardPluginProps {
  /** Block type used when plain text creates additional blocks. */
  readonly defaultBlockType?: string;
}

/**
 * Routes browser copy, cut, and paste events through editor commands.
 *
 * Without this bridge, a contenteditable handles paste itself and sees only
 * `text/plain`; native block types, hierarchy, props, and plugin data are lost.
 * The editor commands additionally read Rivto's structured clipboard MIME type.
 * Its selection marker distinguishes copied text from complete copied blocks.
 * Ctrl/Cmd+Shift+V is remembered from keydown because ClipboardEvent has no
 * modifier fields; that shortcut explicitly keeps copied partial text as
 * blocks. Normal paste follows the copied selection type: text merges into a
 * text target, while complete blocks remain blocks.
 *
 * DOM selection is synchronized immediately before each command because the
 * browser's `selectionchange` event may arrive after a keyboard clipboard event.
 * Event listeners are delegated to the active surface root and are removed by
 * `useEditorEvent` when this component unmounts.
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
  const { element: root } = useEditorRoot();
  // ClipboardEvent does not expose keyboard modifiers. Remember only the
  // immediately preceding paste shortcut, then consume it in `paste` below.
  const pasteTextAsBlocks = useRef(false);
  // Firefox can omit custom MIME data when a later keyboard paste event is
  // dispatched without a native DOM range. Retain the exact last editor copy
  // as a fallback, but only use it when the browser's plain text still matches.
  const copiedClipboard = useRef<{ structured: string; text: string } | null>(null);

  /** Remembers the portable representations just written by a copy or cut. */
  const rememberClipboard = (event: ClipboardEvent): void => {
    const structured = event.clipboardData?.getData(RIVTO_CLIPBOARD_MIME) ?? "";
    if (!structured) return;
    copiedClipboard.current = {
      structured,
      text: event.clipboardData?.getData("text/plain") ?? "",
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
    const selection = readEditorDOMSelection(root);
    if (selection) editor.execute("selection.set", { selection });
  };

  useEditorEvent("copy", (event) => {
    if (event.defaultPrevented) return;
    synchronizeSelection();
    editor.execute("clipboard.copy", { event });
    rememberClipboard(event);
  });

  useEditorEvent("cut", (event) => {
    if (event.defaultPrevented) return;
    synchronizeSelection();
    editor.execute("clipboard.cut", { event });
    rememberClipboard(event);
  });

  useEffect(() => {
    if (!root) return;
    const document = root.ownerDocument;

    /**
     * Handles Firefox's block-selection clipboard target.
     *
     * A whole-block selection deliberately has no native DOM Range. Firefox
     * dispatches its copy, cut, and paste events to `body`, so root-delegated
     * listeners cannot observe them. Restricting this fallback to a focused
     * root with a block-only editor selection keeps clipboard events from
     * root (or one of its block cards) with a block-only editor selection keeps
     * clipboard events from unrelated controls outside this editor untouched.
     */
    const handleBlockClipboard = (event: ClipboardEvent): void => {
      const activeElement = document.activeElement;
      const editorHasFocus = activeElement === root || (activeElement !== null && root.contains(activeElement));
      if (event.defaultPrevented || root.contains(event.target as Node) || !editorHasFocus) return;
      const current = editor.selection.get();
      if (!current.length || current.some((item) => item.type === "text")) return;
      if (event.type === "paste") {
        const mergeText = !pasteTextAsBlocks.current;
        pasteTextAsBlocks.current = false;
        editor.execute("clipboard.paste", {
          event,
          defaultBlockType,
          mergeText,
          structured: fallbackStructuredClipboard(event),
        });
        return;
      }
      editor.execute(event.type === "cut" ? "clipboard.cut" : "clipboard.copy", { event });
      rememberClipboard(event);
    };

    document.addEventListener("copy", handleBlockClipboard);
    document.addEventListener("cut", handleBlockClipboard);
    document.addEventListener("paste", handleBlockClipboard);
    return () => {
      document.removeEventListener("copy", handleBlockClipboard);
      document.removeEventListener("cut", handleBlockClipboard);
      document.removeEventListener("paste", handleBlockClipboard);
    };
  }, [defaultBlockType, editor, root]);

  useEditorEvent("keydown", (event) => {
    if (event.key.toLowerCase() !== "v") return;
    pasteTextAsBlocks.current = event.shiftKey && (event.ctrlKey || event.metaKey);
  });

  useEditorEvent("keyup", (event) => {
    if (event.key.toLowerCase() === "v") pasteTextAsBlocks.current = false;
  });

  useEditorEvent("paste", (event) => {
    if (event.defaultPrevented) return;
    synchronizeSelection();
    const mergeText = !pasteTextAsBlocks.current;
    pasteTextAsBlocks.current = false;
    editor.execute("clipboard.paste", {
      event,
      defaultBlockType,
      mergeText,
      structured: fallbackStructuredClipboard(event),
    });
  });

  return null;
}
