import type { EditorBlock as Block, Selection } from "@chulane/rivto";
import type { ReactPanelApi } from "../../../../../panels/types";

/** One block's location in the visible outline. */
export interface PageBlockEntry {
  readonly block: Block;
  readonly parentId: string | null;
  readonly siblings: Block[];
}

/** Extension-owned decision that hides one block's descendants. */
export type IsCollapsedBlock = (block: Block) => boolean;

/** Roots moved by a drag or keyboard command. */
export interface SelectedMoveRoots {
  readonly ids: string[];
  readonly grouped: boolean;
  readonly selection?: Selection;
}

/** Concrete placement used by Alt+Shift+Up/Down. */
export interface KeyboardMovePlacement {
  readonly targetId: string;
  readonly position: "before" | "after";
}

/** Vertical page-navigation direction. */
export type VerticalDirection = "up" | "down";

/** Panel hierarchy read used to find the root that owns a block. */
export interface NavigationParentSource {
  /** Reads the direct parent of a block. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getParentId">;
}

/** Block and element reads used to resolve a canvas card. */
export interface NavigationCardSource extends NavigationParentSource {
  /** Reads roots and ancestry in the receiving occurrence. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getRootIds" | "getParentId">;
  /** Reads canvas cards for occurrence-local outline boundaries. */
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes">;
}

/** Block and element reads used to resolve a displayed outline. */
export interface NavigationOutlineSource extends NavigationCardSource {
  /** Reads roots and ancestry in the receiving occurrence. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlocks" | "getRootIds" | "getParentId">;
}

/** A displayed occurrence with its current surface type. */
export interface NavigationScopePanel
  extends NavigationOutlineSource, Pick<ReactPanelApi, "getSurfaceType"> {}

/** Shared visibility policy borrowed by keyboard navigation. */
export interface NavigationEditor {
  /** Checks whether a block's descendants are visible. */
  readonly blockBehaviors: Pick<ReactPanelApi["editor"]["blockBehaviors"], "childrenVisible">;
}

/** Document hierarchy reads used by keyboard navigation. */
export interface NavigationDocument {
  /** Reads block content, parents, and insertion positions. */
  readonly blocks: Pick<
    ReactPanelApi["document"]["blocks"],
    "getBlockNode" | "getParentId" | "getInsertionDestinationAfter"
  >;
}

/** Selection operations used to publish and focus a caret. */
export interface NavigationCaretPanel {
  /** Publishes the caret and focuses its rendered content. */
  readonly selection: Pick<ReactPanelApi["selection"], "set" | "focusBlock">;
}

/** Operations used to extend a text range through visual lines. */
export interface NavigationTextPanel {
  /** Reads the current block's text length. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode">;
  /** Reads and extends the current text selection. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "get" | "readDOM" | "verticalCaretPosition" | "selectTextRange"
  >;
}

/** Panel operations borrowed by caret and structural keyboard navigation. */
export interface NavigationPanel extends NavigationScopePanel {
  /** Reads the displayed outline and moves its selected blocks. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    keyof NavigationOutlineSource["blocks"] | "getBlockNode" | "moveBlocks"
  >;
  /** Shared hierarchy reads used to resolve movement destinations. */
  readonly document: NavigationDocument;
  /** Shared visibility policy. */
  readonly editor: NavigationEditor;
  /** Reads and restores selection and caret positions. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    | "get"
    | "readDOM"
    | "set"
    | "focusBlock"
    | "focusBlockSelection"
    | "selectableBlockIds"
    | "adjacentCaretPosition"
    | "verticalCaretPosition"
    | "focusAdjacentEditor"
    | "selectTextRange"
    | "scheduleIfSelectionUnchanged"
    | "restoreDOM"
  >;
}
