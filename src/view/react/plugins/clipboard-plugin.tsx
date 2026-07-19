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
 * When copied content begins with partial text and the destination is a text
 * selection, only the first copied block's text merges into the current block;
 * every remaining copied item is inserted as a block. Content copied as whole
 * blocks always stays blocks, including when pasted at a text caret.
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
 *   <ClipboardPlugin defaultBlockType="paragraph" />
 *   <PageSurface />
 * </EditorView>
 * ```
 */
export function ClipboardPlugin({ defaultBlockType = "paragraph" }: ClipboardPluginProps) {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

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
  });

  useEditorEvent("cut", (event) => {
    if (event.defaultPrevented) return;
    synchronizeSelection();
    editor.execute("clipboard.cut", { event });
  });

  useEditorEvent("paste", (event) => {
    if (event.defaultPrevented) return;
    synchronizeSelection();
    editor.execute("clipboard.paste", { event, defaultBlockType });
  });

  return null;
}
