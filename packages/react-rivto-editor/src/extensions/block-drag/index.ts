/** Public entry point for page block drag behavior and placement calculations. */
export { pageDragExtension, type PageDragOptions } from "./extension";
export {
  PageDragProvider,
  type PageDragExtensionOptions,
} from "./provider";
export { registerPageDrag } from "./register";
export { PageDragBlockSlot, PageDragBlockWrapper } from "./surface";
export {
  dropMoveTarget,
  excludeDropSubtrees,
  resolveAfterDropPlacement,
  resolveBeforeDropPlacement,
  resolveBlockDropPlacementOptions,
  resolveInsideDropPlacement,
  resolveSiblingAfterDropPlacement,
  type CanonicalDropPlacement,
  type DropBlock,
  type DropMoveTarget,
  type ResolvedDropPlacementOptions,
} from "./placement";
export { resolveDropPlacement, type DropLayoutBlock, type DropLayoutOptions, type DropRect } from "./placement/resolver";
