/** Shared page-navigation utilities owned by sibling navigation extensions. */
export {
  adjacentBlockSelection,
  blockSelection,
  extendBlockSelection,
  toggleBlockSelection,
} from "./block-selection";
export { reconcileCollapsedSelection } from "./collapsed-selection";
export { keyboardMovePlacement } from "./move-placement";
export { selectedMoveRoots } from "./move-roots";
export { pageEntries } from "./outline";
export {
  navigationDomRoot,
  navigationOutlineBlocks,
  owningBlockElement,
  owningRootId,
} from "./scope";
export type {
  IsCollapsedBlock,
  KeyboardMovePlacement,
  PageBlockEntry,
  SelectedMoveRoots,
  VerticalDirection,
} from "./types";
