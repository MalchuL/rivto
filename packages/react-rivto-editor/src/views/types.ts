/**
 * Behavior contract for one block type's outline and drop semantics.
 *
 * A view is not the DOM shell in `blocks/block-view/block-view.tsx`. It is the bridge
 * that page Enter/Tab/Backspace/drag dispatchers consult so container
 * extensions can override split, indent, and drop without type switches in
 * those modules. Views call `views/ops` primitives and never touch
 * internal document storage directly.
 *
 * @module
 */
import type { EditorBlock, Selection } from "@chulane/rivto";
import type { KeyboardSelectionTarget } from "../managers";
import type { ReactEditor } from "../types";

/** Result of one semantic view action. */
export type BlockViewOutcome = "handled" | "default" | "rejected";

/** Sibling-sort axis a parent view advertises to the shared drag resolver. */
export type DropAxis = "vertical" | "horizontal" | "grid";

/** Optional drag-placement tuning supplied by one block view. */
export interface BlockDropPlacementOptions {
  /** Whether the block may receive a drop as a new child. Defaults to `true`. */
  readonly allowChildPlacement?: boolean;
  /** Horizontal pixels representing one requested child depth. */
  readonly childDropIndent?: number;
  /** Pixels at an item's edges reserved for sibling placement. */
  readonly gapDropZone?: number;
}

/**
 * Runtime snapshot handed to every view method.
 *
 * `block` is the block whose registered view was resolved. Dispatchers walk
 * ancestors separately when they need a parent or floor.
 */
export interface BlockViewContext {
  /** Complete React runtime that owns views, selection, and writing factories. */
  readonly reactEditor: ReactEditor;
  /** Detached snapshot of the resolved block. */
  readonly block: EditorBlock;
  /** Structural parent, or `null` at the document root. */
  readonly parentId: string | null;
  /** Portable selection captured for this key or gesture. */
  readonly selection: Selection | undefined;
  /** Active page surface or edgeless card DOM root. */
  readonly root: HTMLElement;
}

/** Arguments for a drop-acceptance check against one destination view. */
export interface BlockViewDropContext {
  /** Runtime used to read live block types and parents. */
  readonly reactEditor: ReactEditor;
  /** Block that would receive or sit beside the drop. */
  readonly targetId: string;
  /** Subtree roots being moved. */
  readonly sourceIds: readonly string[];
}

/**
 * Per-type outline, split, merge, delete, and drop behavior.
 *
 * Returning `"default"` lets the dispatcher run {@link BaseBlockView}.
 * `"handled"` claims the event after applying an action. `"rejected"` claims
 * the event without mutating so Tab/Enter do not fall through to the browser.
 */
export interface BlockViewBehavior {
  /** How this type sorts its own children during drag, if it owns a layout. */
  readonly dropAxis?: DropAxis;
  /** Optional overrides for shared page-drag placement defaults. */
  readonly dropPlacement?: BlockDropPlacementOptions;
  /** Whether this type's complete BlockView is a drop target, including empty lanes. */
  readonly acceptsDropContainer?: boolean;
  /**
   * Splits the current block or inserts a sibling/child after Enter.
   *
   * @param context - Resolved block and editing runtime.
   * @param target - Caret or structural keyboard target that qualified Enter.
   * @returns Whether the view handled, refused, or deferred the split.
   */
  onSplit(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome;
  /**
   * Nests the supplied identifiers under their previous sibling.
   *
   * @param context - Resolved block (typically the first selected root).
   * @param ids - Outline identifiers to indent together.
   * @returns Whether the view handled, refused, or deferred the indent.
   */
  onIndent(context: BlockViewContext, ids: readonly string[]): BlockViewOutcome;
  /**
   * Lifts the supplied identifiers to their grandparent.
   *
   * @param context - Resolved block (typically the first selected root).
   * @param ids - Outline identifiers to outdent together.
   * @returns Whether the view handled, refused, or deferred the outdent.
   */
  onOutdent(context: BlockViewContext, ids: readonly string[]): BlockViewOutcome;
  /**
   * Outdents a nested block when Backspace is pressed at offset zero.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the view handled, refused, or deferred the outdent.
   */
  onOutdentAtStart(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome;
  /**
   * Merges a root block backward into the previous editable sibling.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the view handled, refused, or deferred the merge.
   */
  onMergeBackward(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome;
  /**
   * Merges the next editable sibling into the current block.
   *
   * @param context - Block that owns a caret at its content end.
   * @param target - Collapsed caret at the block end.
   * @returns Whether the view handled, refused, or deferred the merge.
   */
  onMergeForward(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome;
  /**
   * Converts the first empty custom block to the host writing type.
   *
   * @param context - Empty custom block with no previous editable sibling.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the view handled, refused, or deferred the reset.
   */
  onResetEmpty(context: BlockViewContext, target: KeyboardSelectionTarget): BlockViewOutcome;
  /**
   * Prepares structurally selected blocks immediately before they are deleted.
   *
   * @param context - One selected block whose view was resolved.
   * @param ids - Complete structural selection about to be removed.
   * @returns `"handled"` when the view already deleted, otherwise `"default"`.
   */
  onStructuralDelete(context: BlockViewContext, ids: readonly string[]): BlockViewOutcome;
  /**
   * Reports whether this destination may receive the dragged roots.
   *
   * @param context - Drop target and source identifiers.
   * @returns `true` when the shared drag resolver may highlight this target.
   */
  acceptsDrop(context: BlockViewDropContext): boolean;
}

/** View methods the page dispatchers may fall back through. */
export type BlockViewAction =
  | "onSplit"
  | "onIndent"
  | "onOutdent"
  | "onOutdentAtStart"
  | "onMergeBackward"
  | "onMergeForward"
  | "onResetEmpty"
  | "onStructuralDelete";
