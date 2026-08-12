import { createPortal } from "react-dom";
import { useEditor, useEditorRoot, useReactEditor } from "../../hooks";
import { PAGE_END_SLOT_SELECTOR } from "../../constants";
import { focusBlock } from "../../managers";

/** Properties for the page-end insertion targets. */
export interface TrailingBlockProps {
  /** Number of insertion targets shown after the document roots. */
  readonly count: number;
}

/** Page-end controls that create every writing block up to the activated row. */
export function TrailingBlock({ count }: TrailingBlockProps) {
  const editor = useEditor();
  const reactEditor = useReactEditor();
  const { element: root } = useEditorRoot();
  const slot = root?.querySelector<HTMLElement>(PAGE_END_SLOT_SELECTOR);
  if (!root || !slot) return null;

  return createPortal(
    Array.from({ length: count }, (_, index) => {
      const amount = index + 1;
      return (
        <button
          key={amount}
          type="button"
          className="page-trailing-block"
          aria-label={amount === 1 ? "Add block" : `Add ${amount} blocks`}
          onClick={() => {
            let id = "";
            editor.batchUpdates(() => {
              for (let current = 0; current < amount; current += 1) {
                id = reactEditor.blocks.insertBlock(
                  reactEditor.createDefaultBlock(),
                  id || undefined,
                );
              }
            });
            if (!id) return;
            editor.selection.set([{
              type: "text",
              anchor: { blockId: id, offset: 0 },
              head: { blockId: id, offset: 0 },
            }]);
            requestAnimationFrame(() => focusBlock(root, id, 0));
          }}
        >
          + Add block
        </button>
      );
    }),
    slot,
  );
}
