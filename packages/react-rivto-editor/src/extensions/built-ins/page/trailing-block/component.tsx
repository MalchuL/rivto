/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { createPortal } from "react-dom";
import { PlusIcon } from "lucide-react";
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
          className={`${TRAILING_BLOCK_CLASS} my-1 box-border flex h-(--rivto-default-block-height) w-full cursor-text items-center gap-1 rounded border-0 bg-transparent px-2 text-left [font:inherit] leading-normal text-transparent transition-colors outline-none hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/5 focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5`}
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
          <PlusIcon aria-hidden="true" />
          Add block
        </button>
      );
    }),
    slot,
  );
}
