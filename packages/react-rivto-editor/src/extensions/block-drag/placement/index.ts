/** Public entry point for canonical page-drag placement calculations. */
export {
  dropMoveTarget,
  excludeDropSubtrees,
  resolveAfterDropPlacement,
  resolveBeforeDropPlacement,
  resolveBlockDropPlacementOptions,
  resolveInsideDropPlacement,
  resolveSiblingAfterDropPlacement,
} from "./utils";
export {
  hitDropIntent,
  isStructuralLayout,
  resolveChromePlacement,
  resolveGridPlacement,
} from "./intent";
export { resolveDropPlacement } from "./resolver";
export type {
  CanonicalDropPlacement,
  DropBlock,
  DropMoveTarget,
  DropPlacementInput,
  DropPlacementSource,
  DropPlacementTarget,
  PageDragData,
  PageDropTargetData,
  ResolvedDropPlacementOptions,
  ViewportRect,
} from "./types";
