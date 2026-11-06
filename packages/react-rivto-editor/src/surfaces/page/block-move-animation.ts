import { animate, type AnimationPlaybackControls } from "motion";
import type { BlockEditorApi } from "@chulane/rivto-page";

/** Addressed mounted-region lookup borrowed from a Page occurrence. */
type BlockMoveRegions = Pick<BlockEditorApi["regions"], "get">;

/**
 * Schedules movement in the receiving occurrence after its DOM commit.
 *
 * @param destination - Receiving Page root.
 * @param destinationRegions - Addressed regions owned by the receiving Page.
 * @param isCurrent - Optional check that both drag attachments remain current.
 * @returns The next-frame movement has been scheduled.
 */
type BlockMoveCompletion = (
  destination: HTMLElement,
  destinationRegions: BlockMoveRegions,
  isCurrent?: () => boolean,
) => void;

/** Viewport position retained for one mounted block. */
interface BlockMovePosition {
  readonly id: string;
  readonly left: number;
  readonly top: number;
}

/** Pending frame and animations owned by one source surface. */
interface BlockMoveAnimation {
  readonly root: HTMLElement;
  readonly view: Window;
  readonly positions: readonly BlockMovePosition[];
  readonly duration: number;
  frame?: number;
  readonly animations: BlockAnimation[];
}

/** Animation and the inline transform to restore when it stops. */
interface BlockAnimation {
  readonly block: HTMLElement;
  readonly animation: AnimationPlaybackControls;
  readonly transform: string;
}

const active = new WeakMap<HTMLElement, BlockMoveAnimation>();
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
 * Captures mounted source blocks before a structural move.
 *
 * A previous transition is sampled before cancellation so a rapid subsequent move
 * begins at its current visual position. Reduced-motion preferences skip movement.
 *
 * @param root - Source Page occurrence containing the moved blocks.
 * @param regions - Addressed region lookup owned by the source Page.
 * @param ids - Moved block IDs; unmounted blocks are ignored.
 * @param duration - Transition duration in seconds; zero or omission disables motion.
 * @returns A callback that animates matching blocks in the receiving root, or undefined when disabled.
 */
export function captureBlockMove(
  root: HTMLElement,
  regions: BlockMoveRegions,
  ids: readonly string[],
  duration: number | undefined,
): BlockMoveCompletion | undefined {
  const view = root.ownerDocument.defaultView;
  if (!duration || !view || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const positions = readBlockPositions(root, regions, ids);
  const previous = active.get(root);
  if (previous?.frame !== undefined) {
    previous.view.cancelAnimationFrame(previous.frame);
  }
  if (previous) {
    previous.animations.forEach(cancelBlockAnimation);
    previous.animations.length = 0;
  }
  const state: BlockMoveAnimation = { root, view, positions, duration, animations: [] };
  active.set(root, state);
  return (destination, destinationRegions, isCurrent) => {
    state.frame = view.requestAnimationFrame(() => {
      if (
        !root.isConnected ||
        !destination.isConnected ||
        active.get(root) !== state ||
        isCurrent?.() === false
      ) {
        if (active.get(root) === state) {
          active.delete(root);
        }
        return;
      }
      animateMovedBlocks(state, destination, destinationRegions);
    });
  };
}

/**
 * Moves mounted destination blocks from their captured viewport positions and jiggles them at rest.
 *
 * @param state - Source positions, duration, and owned animation references.
 * @param destination - Current receiving root.
 * @param regions - Addressed receiving region lookup.
 * @returns Starts eligible block transitions and releases them when they finish.
 */
function animateMovedBlocks(
  state: BlockMoveAnimation,
  destination: HTMLElement,
  regions: BlockMoveRegions,
): void {
  for (const position of state.positions) {
    const block = regions.get(position.id, "shell", destination);
    if (!block || state.view.getComputedStyle(block).transform !== "none") {
      continue;
    }
    const rect = block.getBoundingClientRect();
    const scale = block.offsetWidth ? rect.width / block.offsetWidth : 1;
    const x = (position.left - rect.left) / (scale || 1);
    const y = (position.top - rect.top) / (scale || 1);
    if (Math.abs(x) < 1 && Math.abs(y) < 1) {
      continue;
    }
    pendingTransformRestorations.delete(block);
    const transform = block.style.transform;
    const rebound = x < 0 ? -JIGGLE_DISTANCE_PX : JIGGLE_DISTANCE_PX;
    state.animations.push({
      block,
      transform,
      animation: animate(
        block,
        {
          transform: [
            `translate(${x}px, ${y}px)`,
            "translate(0px, 0px)",
            `translate(${rebound}px, 0px)`,
            "none",
          ],
        },
        {
          duration: state.duration,
          times: [0, 0.6, 0.8, 1],
          ease: [0.23, 1, 0.32, 1],
        },
      ),
    });
  }
  /**
   * Releases completed animation references for this occurrence.
   *
   * @returns No completed animations remain retained by this state.
   */
  const release = () => {
    state.animations.forEach(cancelBlockAnimation);
    state.animations.length = 0;
    if (active.get(state.root) === state) {
      active.delete(state.root);
    }
  };
  void Promise.all(state.animations.map(({ animation }) => animation.finished)).then(
    release,
    release,
  );
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
 * Samples the visible positions of mounted block blocks.
 *
 * @param root - Source occurrence to inspect.
 * @param regions - Addressed source region lookup.
 * @param ids - Block identities being moved.
 * @returns Current viewport positions for mounted blocks.
 */
function readBlockPositions(
  root: HTMLElement,
  regions: BlockMoveRegions,
  ids: readonly string[],
): BlockMovePosition[] {
  const selected = new Set(ids);
  return ids.flatMap((id) => {
    const block = regions.get(id, "shell", root);
    if (!block || hasSelectedAncestor(block, selected, root)) {
      return [];
    }
    const rect = block.getBoundingClientRect();
    return [{ id, left: rect.left, top: rect.top }];
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
