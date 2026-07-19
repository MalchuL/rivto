import {
  useEditor,
  useEditorEvent,
  useEditorRoot,
} from "@chulane/rivto";

/** Finds a block's current editable element without interpolating its ID into CSS. */
function findBlockContent(root: HTMLElement, blockId: string): HTMLElement | null {
  for (const block of root.querySelectorAll<HTMLElement>("[data-block-id]")) {
    if (block.dataset.blockId === blockId) {
      return block.querySelector<HTMLElement>("[data-block-content]");
    }
  }
  return null;
}

/**
 * Installs page-specific Tab and Shift+Tab tree editing.
 *
 * This component renders nothing. It delegates one keydown listener from the
 * surface root, resolves the originating block through stable DOM markers, and
 * invokes existing editor commands. Other controls can prevent the event first;
 * the plugin only owns Tab presses inside editable block content.
 */
export function PageKeyboardPlugin() {
  const editor = useEditor();
  const { element: root } = useEditorRoot();

  useEditorEvent("keydown", (event) => {
    if (event.defaultPrevented || event.key !== "Tab") return;
    if (!(event.target instanceof Element)) return;

    const content = event.target.closest<HTMLElement>("[data-block-content]");
    const block = content?.closest<HTMLElement>("[data-block-id]");
    const blockId = block?.dataset.blockId;
    if (!content || !blockId || !root) return;

    event.preventDefault();
    if (event.shiftKey) editor.outdentBlock(blockId);
    else editor.indentBlock(blockId);

    // Moving between nesting containers can remount the editable element. Wait
    // for React to commit the new tree, then restore keyboard focus to the block.
    requestAnimationFrame(() => findBlockContent(root, blockId)?.focus());
  });

  return null;
}
