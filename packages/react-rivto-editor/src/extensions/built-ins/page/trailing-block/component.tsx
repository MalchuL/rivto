import { Button } from "../../../../components/ui/button";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import { createCaretSelection } from "@chulane/rivto";
import { PlusIcon } from "lucide-react";
import { editorControlProps } from "../../../../constants";
import { useReactPanel } from "../../../../hooks";
import { PageEndPortal } from "../../../../surfaces/page/browser/page-end-portal";
import type { TrailingBlockProps } from "./types";

export type { TrailingBlockProps } from "./types";

const TRAILING_BLOCK_CLASS = "page-trailing-block";

/** Page-end controls that create every writing block up to the activated row. */
export function TrailingBlock({ count }: TrailingBlockProps) {
  const reactPanel = useReactPanel();
  return (
    <PageEndPortal>
      {Array.from({ length: count }, (value, index) => {
        const amount = index + 1;
        return (
          <Button
            variant="ghost"
            {...editorControlProps}
            key={amount}
            type="button"
            className={`${TRAILING_BLOCK_CLASS} my-1 box-border flex h-(--rivto-default-block-height) w-full cursor-text items-center justify-start gap-1 rounded border-0 bg-transparent px-2 py-0 text-left [font:inherit] leading-normal text-transparent transition-colors outline-none hover:bg-primary/5 hover:text-primary focus-visible:bg-primary/5 focus-visible:text-primary focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5`}
            aria-label={amount === 1 ? "Add block" : `Add ${amount} blocks`}
            onClick={() => {
              let id = "";
              reactPanel.batchUpdates(() => {
                for (let current = 0; current < amount; current += 1) {
                  id = reactPanel.blocks.insertBlock(
                    reactPanel.editor.defaultWritingBlockFactory.createEmptyBlock(),
                    reactPanel.blocks.getInsertionDestinationAfter(id || undefined),
                  ).id;
                }
              });
              if (!id) {
                return;
              }
              reactPanel.selection.set(createCaretSelection(id, 0));
              reactPanel.selection.scheduleIfSelectionUnchanged(() => {
                reactPanel.selection.restoreDOM();
              });
            }}
          >
            <PlusIcon aria-hidden="true" />
            Add block
          </Button>
        );
      })}
    </PageEndPortal>
  );
}
