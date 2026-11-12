import { animate, type AnimationPlaybackControls, type AnimationSequence } from "motion";
import type { BlockEditorApi } from "@chulane/rivto-page";
import { UI_TRANSITION_DURATION } from "../../constants";

/** Addressed mounted-region lookup borrowed from a Page occurrence. */
type BlockMoveRegions = Pick<BlockEditorApi["regions"], "get">;

/** Viewport position and unscaled border-box size retained for one mounted block. */
interface BlockMovePosition {
  readonly id: string;
  readonly left: number;
  readonly top: number;
  /** Border-box width in unscaled CSS pixels. */
  readonly width: number;
  /** Border-box height in unscaled CSS pixels. */
  readonly height: number;
}

/** Pending frame and animations owned by one source surface. */
interface BlockMoveAnimation {
  readonly root: HTMLElement;
  readonly view: Window;
  readonly positions: readonly BlockMovePosition[];
  readonly grouped: boolean;
  frame?: number;
  readonly animations: BlockAnimation[];
  group?: BlockGroupAnimation;
}

/** Animation and the inline transform to restore when it stops. */
interface BlockAnimation {
  readonly block: HTMLElement;
  readonly animation: AnimationPlaybackControls;
  readonly transform: string;
}

/** One CSS property borrowed while a block's dimensions are held. */
interface BorrowedDimension {
  readonly value: string;
  readonly priority: string;
  readonly applied: string;
}

/** One shell and the inline styles borrowed by its group animation. */
interface BlockGroupItem {
  readonly block: HTMLElement;
  readonly transform: string;
  readonly width: BorrowedDimension;
  readonly height: BorrowedDimension;
  readonly boxSizing: BorrowedDimension;
  readonly position: BlockMovePosition;
}

/** One shared timeline and the inline styles borrowed from its block shells. */
interface BlockGroupAnimation {
  readonly animation: AnimationPlaybackControls;
  readonly blocks: readonly BlockGroupItem[];
}

const active = new WeakMap<HTMLElement, BlockMoveAnimation>();
const droppedBlocks = new WeakMap<HTMLElement, BlockAnimation>();
const pendingTransformRestorations = new WeakMap<HTMLElement, object>();
/** Horizontal rebound of indented blocks, in CSS pixels. */
const JIGGLE_DISTANCE_PX = 3;
/** Initial horizontal offset for dropped blocks, in CSS pixels. */
const DROP_OFFSET_PX = 6;
/** Duration of the drop feedback, in seconds. */
const DROP_DURATION = 0.15;

/**
 * Moves mounted dropped blocks right past their committed position and settles them back.
 *
 * @param destination - Receiving Page root.
 * @param regions - Addressed regions owned by the receiving Page.
 * @param ids - Dropped block identities; unmounted blocks are ignored.
 * @param isCurrent - Checks whether the drag attachments are still current.
 * @returns Schedules destination animation when a window exists and reduced motion is not requested.
 */
export function animateDroppedBlocks(
  destination: HTMLElement,
  regions: BlockMoveRegions,
  ids: readonly string[],
  isCurrent: () => boolean,
): void {
  const view = destination.ownerDocument.defaultView;
  if (!view || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
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
        { duration: DROP_DURATION, times: [0, 0.6, 0.8, 1], ease: [0.23, 1, 0.32, 1] },
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
 * @param grouped - Whether this move represents a multiple-block selection, including unmounted or nested members.
 * @returns A callback that schedules matching blocks in this occurrence, or undefined when none are mounted or motion is reduced.
 */
export function captureBlockMove(
  root: HTMLElement,
  regions: BlockMoveRegions,
  ids: readonly string[],
  grouped = false,
): (() => void) | undefined {
  const view = root.ownerDocument.defaultView;
  if (!ids.length || !view || view.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    return;
  }
  const positions = readBlockPositions(root, regions, ids);
  const previous = active.get(root);
  if (previous?.frame !== undefined) {
    previous.view.cancelAnimationFrame(previous.frame);
  }
  if (previous) {
    if (previous.group) {
      cancelGroupAnimation(previous.group);
      previous.group = undefined;
    }
    previous.animations.forEach(cancelBlockAnimation);
    previous.animations.length = 0;
  }
  const state: BlockMoveAnimation = { root, view, positions, grouped, animations: [] };
  active.set(root, state);
  return () => {
    state.frame = view.requestAnimationFrame(() => {
      if (!root.isConnected || active.get(root) !== state) {
        if (active.get(root) === state) {
          active.delete(root);
        }
        return;
      }
      animateMovedBlocks(state, root, regions);
    });
  };
}

/**
 * Moves mounted destination blocks from their captured viewport positions.
 *
 * A multi-block move shares one timeline and horizontal rebound without
 * reparenting React-owned nodes; a single moved block retains its existing effect.
 *
 * @param state - Source positions and owned animation references.
 * @param destination - Current receiving root.
 * @param regions - Addressed receiving region lookup.
 * @returns Starts eligible block transitions and releases them when they finish.
 */
function animateMovedBlocks(
  state: BlockMoveAnimation,
  destination: HTMLElement,
  regions: BlockMoveRegions,
): void {
  if (state.grouped) {
    state.group = animateBlockGroup(state, destination, regions);
  }
  if (!state.group) {
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
            duration: UI_TRANSITION_DURATION,
            times: [0, 0.6, 0.8, 1],
            ease: [0.23, 1, 0.32, 1],
          },
        ),
      });
    }
  }
  /**
   * Releases completed animation references for this occurrence.
   *
   * @returns No completed animations remain retained by this state.
   */
  const release = () => {
    if (state.group) {
      cancelGroupAnimation(state.group);
      state.group = undefined;
    }
    state.animations.forEach(cancelBlockAnimation);
    state.animations.length = 0;
    if (active.get(state.root) === state) {
      active.delete(state.root);
    }
  };
  const animations = state.group
    ? [state.group.animation]
    : state.animations.map(({ animation }) => animation);
  void Promise.all(animations.map((animation) => animation.finished)).then(release, release);
}

/**
 * Starts one interruptible timeline for the mounted blocks in a structural move.
 *
 * Every segment starts together and shares a horizontal rebound, while its captured
 * offset preserves geometry when blocks had different positions before reparenting.
 * Shell dimensions stay at their pre-move sizes until completion so deferred layout
 * cannot distort the group.
 * The DOM remains React-owned.
 *
 * @param state - Source positions and browser used to inspect the current view.
 * @param destination - Current root containing the moved blocks.
 * @param regions - Addressed lookup for mounted block shells.
 * @returns The shared animation and borrowed transforms, or undefined when no mounted block moved.
 */
function animateBlockGroup(
  state: BlockMoveAnimation,
  destination: HTMLElement,
  regions: BlockMoveRegions,
): BlockGroupAnimation | undefined {
  const blocks = lockGroupDimensions(state, destination, regions);
  const sequence: AnimationSequence = [];
  let rebound: number | undefined;
  // Apply every size before reading destination positions, so each measurement
  // sees its siblings' retained dimensions instead of intermediate layout.
  for (const { block, position } of blocks) {
    const rect = block.getBoundingClientRect();
    const scale = block.offsetWidth ? rect.width / block.offsetWidth : 1;
    const x = (position.left - rect.left) / (scale || 1);
    const y = (position.top - rect.top) / (scale || 1);
    if (Math.abs(x) < 1 && Math.abs(y) < 1) {
      continue;
    }
    rebound ??= x < 0 ? -JIGGLE_DISTANCE_PX : JIGGLE_DISTANCE_PX;
    sequence.push([
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
        at: 0,
        duration: UI_TRANSITION_DURATION,
        times: [0, 0.6, 0.8, 1],
        ease: [0.23, 1, 0.32, 1],
      },
    ]);
  }
  if (!sequence.length) {
    blocks.forEach(restoreGroupDimensions);
    return;
  }
  for (const { block } of blocks) {
    pendingTransformRestorations.delete(block);
  }
  try {
    return { animation: animate(sequence), blocks };
  } catch (error) {
    blocks.forEach(restoreGroupDimensions);
    throw error;
  }
}

/**
 * Retains the source dimensions of mounted shells while their group moves.
 *
 * Eligibility is read for every shell before changing any style, avoiding a
 * layout recalculation between writes when several selected blocks are mounted.
 *
 * @param state - Captured source geometry and its browser view.
 * @param destination - Current root containing the moved blocks.
 * @param regions - Addressed lookup for mounted block shells.
 * @returns Eligible shells with their original inline declarations.
 */
function lockGroupDimensions(
  state: BlockMoveAnimation,
  destination: HTMLElement,
  regions: BlockMoveRegions,
): BlockGroupItem[] {
  const targets = state.positions.flatMap((position) => {
    const block = regions.get(position.id, "shell", destination);
    return block && state.view.getComputedStyle(block).transform === "none"
      ? [{ block, position }]
      : [];
  });
  return targets.map(({ block, position }) => ({
    block,
    position,
    transform: block.style.transform,
    width: borrowDimension(block, "width", `${position.width}px`),
    height: borrowDimension(block, "height", `${position.height}px`),
    boxSizing: borrowDimension(block, "box-sizing", "border-box"),
  }));
}

/**
 * Temporarily fixes one inline size while retaining its original value and priority.
 *
 * @param block - React-owned shell whose inline style is borrowed.
 * @param property - Dimension property to override.
 * @param applied - Temporary CSS value to apply with priority over existing rules.
 * @returns The original declaration and applied value for conditional restoration.
 */
function borrowDimension(block: HTMLElement, property: string, applied: string): BorrowedDimension {
  const value = block.style.getPropertyValue(property);
  const priority = block.style.getPropertyPriority(property);
  block.style.setProperty(property, applied, "important");
  return { value, priority, applied: block.style.getPropertyValue(property) };
}

/**
 * Restores a group's borrowed dimensions unless another owner changed them.
 *
 * @param item - Shell and original inline declarations retained by the animation.
 * @returns Unchanged temporary declarations have been restored or removed.
 */
function restoreGroupDimensions(item: BlockGroupItem): void {
  for (const [property, original] of [
    ["width", item.width],
    ["height", item.height],
    ["box-sizing", item.boxSizing],
  ] as const) {
    if (
      item.block.style.getPropertyValue(property) !== original.applied ||
      item.block.style.getPropertyPriority(property) !== "important"
    ) {
      continue;
    }
    if (original.value) {
      item.block.style.setProperty(property, original.value, original.priority);
    } else {
      item.block.style.removeProperty(property);
    }
  }
}

/**
 * Cancels a shared movement and restores every borrowed inline transform.
 *
 * @param group - Timeline and block styles owned by the current move.
 * @returns The timeline is cancelled and each restoration is scheduled.
 */
function cancelGroupAnimation(group: BlockGroupAnimation): void {
  group.animation.cancel();
  for (const item of group.blocks) {
    restoreGroupDimensions(item);
    restoreBlockTransform(item.block, item.transform);
  }
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
  restoreBlockTransform(effect.block, effect.transform);
}

/**
 * Restores a shell's inline transform now and after Motion's queued render.
 *
 * @param block - Shell whose inline style was borrowed for an animation.
 * @param transform - Inline transform that existed before the animation.
 * @returns The original transform is restored unless a newer animation takes ownership.
 */
function restoreBlockTransform(block: HTMLElement, transform: string): void {
  block.style.transform = transform;
  const view = block.ownerDocument.defaultView;
  if (!view) {
    return;
  }
  const token = {};
  pendingTransformRestorations.set(block, token);
  view.requestAnimationFrame(() => {
    if (pendingTransformRestorations.get(block) === token) {
      block.style.transform = transform;
      pendingTransformRestorations.delete(block);
    }
  });
}

/**
 * Samples the viewport positions and unscaled border-box sizes of mounted blocks.
 *
 * @param root - Source occurrence to inspect.
 * @param regions - Addressed source region lookup.
 * @param ids - Block identities being moved.
 * @returns Current viewport positions and dimensions for mounted blocks.
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
    const scale = (block.offsetWidth ? rect.width / block.offsetWidth : 1) || 1;
    return [
      {
        id,
        left: rect.left,
        top: rect.top,
        width: rect.width / scale,
        height: rect.height / scale,
      },
    ];
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
