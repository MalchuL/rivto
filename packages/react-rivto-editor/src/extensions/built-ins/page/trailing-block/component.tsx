/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { createPortal } from "react-dom";
import { useEditorRoot, useReactEditor } from "../../../../hooks";
import { PAGE_END_SLOT_SELECTOR } from "../../../../constants";
import { focusBlock } from "../../../../managers";
import type { TrailingBlockProps } from "./types";

export type { TrailingBlockProps } from "./types";

const TRAILING_BLOCK_CLASS = "page-trailing-block";

/** Page-end controls that create every writing block up to the activated row. */
export function TrailingBlock({ count }: TrailingBlockProps) {
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
          className={TRAILING_BLOCK_CLASS}
          aria-label={amount === 1 ? "Add block" : `Add ${amount} blocks`}
          onClick={() => {
            let id = "";
            reactEditor.history.batchUpdates(() => {
              for (let current = 0; current < amount; current += 1) {
                id = reactEditor.blocks.insertBlock(
                  reactEditor.createDefaultBlock(),
                  id || undefined,
                );
              }
            });
            if (!id) return;
            reactEditor.selection.set(createCaretSelection(id, 0));
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
