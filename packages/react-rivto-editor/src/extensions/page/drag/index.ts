/** Public entry point for page block drag behavior and placement calculations. */
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
export {
  pickPointerDropTarget,
  type PointerDropCandidate,
  type PointerDropHit,
  type PointerDropReason,
} from "./pointer";
export {
  hitDropIntent,
  isStructuralLayout,
  resolveChromePlacement,
  resolveGridPlacement,
} from "./placement";
