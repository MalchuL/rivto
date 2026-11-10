import { animate, type AnimationPlaybackControls } from "motion";
import type { BlockEditorApi } from "@chulane/rivto-page";

/** Addressed mounted-region lookup borrowed from a Page occurrence. */
type BlockMoveRegions = Pick<BlockEditorApi["regions"], "get">;

/** Animation and the inline transform to restore when it stops. */
interface BlockAnimation {
  readonly block: HTMLElement;
  readonly animation: AnimationPlaybackControls;
  readonly transform: string;
}

const droppedBlocks = new WeakMap<HTMLElement, BlockAnimation>();
const pendingTransformRestorations = new WeakMap<HTMLElement, object>();
/** Horizontal rebound of indented blocks, in CSS pixels. */
const JIGGLE_DISTANCE_PX = 3;
/** Initial horizontal offset for dropped blocks, in CSS pixels. */
const DROP_OFFSET_PX = 6;

/**
 * Moves mounted dropped blocks right past their committed position and settles them back.
 *
 * @param destination - Receiving Page root.
 * @param regions - Addressed regions owned by the receiving Page.
 * @param ids - Dropped block identities; unmounted blocks are ignored.
 * @param duration - Transition duration in seconds; zero or omission disables motion.
 * @param isCurrent - Checks whether the drag attachments are still current.
 * @returns The destination animation has been scheduled when motion is enabled.
 */
export function animateDroppedBlocks(
  destination: HTMLElement,
  regions: BlockMoveRegions,
  ids: readonly string[],
  duration: number | undefined,
  isCurrent: () => boolean,
): void {
  const view = destination.ownerDocument.defaultView;
  if (!duration || !view || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  view.requestAnimationFrame(() => {
    if (!destination.isConnected || !isCurrent()) {
      return;
    }
    const selected = new Set(ids);
    for (const id of ids) {
      const block = regions.get(id, "shell", destination);
      if (!block || hasSelectedAncestor(block, selected, destination)) {
        continue;
      }
      const previous = droppedBlocks.get(block);
      if (previous) {
        cancelBlockAnimation(previous);
        droppedBlocks.delete(block);
      }
      if (view.getComputedStyle(block).transform !== "none") {
        continue;
      }
      pendingTransformRestorations.delete(block);
      const transform = block.style.transform;
      const animation = animate(
        block,
        {
          transform: [
            `translateX(-${DROP_OFFSET_PX}px)`,
            "translateX(0px)",
            `translateX(${JIGGLE_DISTANCE_PX}px)`,
            "none",
          ],
        },
        { duration, times: [0, 0.6, 0.8, 1], ease: [0.23, 1, 0.32, 1] },
      );
      const current = { block, animation, transform };
      droppedBlocks.set(block, current);
      /**
       * Releases this block's animation when it finishes or is cancelled.
       *
       * @returns The block's reference is removed unless a newer animation replaced it.
       */
      const release = () => {
        if (droppedBlocks.get(block) === current) {
          cancelBlockAnimation(current);
          droppedBlocks.delete(block);
        }
      };
      void animation.finished.then(release, release);
    }
  });
}

/**
 * Stops a block animation and restores the inline transform it replaced.
 *
 * Restores again on the next frame after Motion's queued render, unless a newer
 * animation has taken ownership of the same block.
 *
 * @param effect - Animation and its original inline transform.
 * @returns The animation is cancelled and restoration is scheduled.
 */
function cancelBlockAnimation(effect: BlockAnimation): void {
  effect.animation.cancel();
  effect.block.style.transform = effect.transform;
  const view = effect.block.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const token = {};
  pendingTransformRestorations.set(effect.block, token);
  view.requestAnimationFrame(() => {
    if (pendingTransformRestorations.get(effect.block) === token) {
      effect.block.style.transform = effect.transform;
      pendingTransformRestorations.delete(effect.block);
    }
  });
}

/**
 * Checks whether another selected block already moves this subtree.
 *
 * @param block - Mounted block shell to inspect.
 * @param selected - IDs participating in the current structural move.
 * @param root - Boundary of the current Page occurrence.
 * @returns True when a selected ancestor inside this occurrence contains the block.
 */
function hasSelectedAncestor(
  block: HTMLElement,
  selected: ReadonlySet<string>,
  root: HTMLElement,
): boolean {
  let ancestor = block.parentElement?.closest<HTMLElement>("[data-block-id]");
  while (ancestor && root.contains(ancestor)) {
    if (ancestor.dataset.blockId && selected.has(ancestor.dataset.blockId)) {
      return true;
    }
    ancestor = ancestor.parentElement?.closest<HTMLElement>("[data-block-id]");
  }
  return false;
}
