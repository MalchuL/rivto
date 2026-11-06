import { animate } from "motion";
import { useLayoutEffect, useRef } from "react";
import { useBlockEditorController } from "./use-block-editor-controller";

/**
 * Fades newly added, mounted block subtrees in one addressed child or root list.
 *
 * The first snapshot is treated as existing content. Unmounted virtual roots and
 * children hidden by collapse are left alone; their later mount is not an insertion.
 *
 * @param blockIds - Current ordered IDs supplied by the list owner.
 * @param visible - Whether the list currently renders its descendants.
 * @returns No value; active animations are cancelled on the next list change or unmount.
 */
export function useAnimateAddedBlocks(blockIds: readonly string[], visible = true): void {
  const { regions, movingBlocks, animations: settings } = useBlockEditorController();
  const duration = settings?.blockInsert ?? 0;
  const previous = useRef(blockIds);
  useLayoutEffect(() => {
    const oldIds = previous.current;
    previous.current = blockIds;
    if (!visible || !duration || oldIds === blockIds) {
      return;
    }
    const oldSet = new Set(oldIds);
    const animations = blockIds.flatMap((id) => {
      if (oldSet.has(id) || movingBlocks.has(id)) {
        return [];
      }
      return ([regions.get(id, "row"), regions.get(id, "children")] as const).flatMap((element) => {
        if (!element) {
          return [];
        }
        const view = element.ownerDocument.defaultView;
        const reduced = view?.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
        const opacity = Number(view?.getComputedStyle(element).opacity || 1);
        return [
          animate(
            element,
            { opacity: [opacity * 0.6, opacity] },
            {
              duration: reduced ? duration / 2 : duration,
              ease: [0.23, 1, 0.32, 1],
            },
          ),
        ];
      });
    });
    return () => {
      for (const animation of animations) {
        animation.cancel();
      }
    };
  }, [blockIds, regions, movingBlocks, visible, duration]);
}
