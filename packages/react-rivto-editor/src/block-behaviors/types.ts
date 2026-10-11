/**
 * Behavior contract for one block type's outline and drop semantics.
 *
 * The BlockView component in `blocks/block-view/block-view.tsx` renders the DOM.
 * Page Enter/Tab/Backspace and drag handlers consult block behaviors so container
 * extensions can override split, indent, and drop without type switches in
 * those modules. Behaviors call `block-behaviors/ops` primitives and never touch
 * internal document storage directly.
 *
 * @module
 */
import type { EditorBlock, Selection } from "@chulane/rivto";
import type { EditorViewApi } from "../editor-view/types";
import type { EditorRuntime } from "../editor/editor-runtime";
import type { KeyboardSelectionTarget } from "../managers/index";

/** handled stops dispatch, default requests the generic behavior, and rejected refuses the action. */
export type BlockBehaviorOutcome = "handled" | "default" | "rejected";

/** Layout direction used to compare child positions during dragging: rows, columns, or a grid. */
export type DropAxis = "vertical" | "horizontal" | "grid";

/** Optional drag-placement tuning supplied by one block behavior. */
export interface BlockDropPlacementOptions {
  /** Whether the block may receive a drop as a new child. Defaults to `true`. */
  readonly allowChildPlacement?: boolean;
  /** Horizontal pixels representing one requested child depth. */
  readonly childDropIndent?: number;
  /** Pixels at an item's edges reserved for sibling placement. */
  readonly gapDropZone?: number;
}

/**
 * Block, selection, and DOM context supplied to a keyboard behavior method.
 *
 * `block` is a detached snapshot of the block whose type selected the behavior.
 * Selection is captured by the caller, while editorView remains a live API.
 * Handlers inspect ancestors separately when they need a parent or a container
 * whose outlineFloor metadata prevents children from being outdented further.
 */
export interface BlockBehaviorContext {
  /** Editor view supplying selection, block behaviors, and shared writing factories. */
  readonly editorView: EditorViewApi;
  /** Detached snapshot of the resolved block. */
  readonly block: EditorBlock;
  /** Structural parent, or `null` at the document root. */
  readonly parentId: string | null;
  /** Portable selection captured for this key or gesture. */
  readonly selection: Selection | undefined;
  /** Active page surface or edgeless card DOM root. */
  readonly root: HTMLElement;
}

/** A stable destination in one parent's ordered child list. */
export type BlockDropDestination = {
  readonly kind: "between";
  readonly parentId: string | null;
  readonly previousId: string | null;
  readonly nextId: string | null;
  readonly depth: number;
} | {
  readonly kind: "inside";
  readonly parentId: string;
};

/** Arguments for a drop-acceptance check against the destination parent. */
export interface BlockDropContext {
  /** Runtime used to read live block types and parents. */
  readonly editor: EditorRuntime;
  /** Exact destination, shared by feedback and commit. */
  readonly destination: BlockDropDestination;
  /** Source snapshots, including when they belong to another document. */
  readonly sources: readonly EditorBlock[];
}

/**
 * Keyboard and drag operations supplied by an extension for one block type.
 *
 * Pass an instance as behavior in runtime.blockTypes.register alongside definition
 * and render. The registry selects it using the stored block.type. Every block of
 * that type uses the registered instance, so read block-specific state from context
 * rather than storing the last edited block on the behavior object. Rendering remains
 * in the extension's React component; mutations use the document managers.
 *
 * Returning "default" asks dispatch to try DefaultBlockBehavior. Returning "handled"
 * or "rejected" stops further editor handling; the keyboard handler can then prevent
 * the browser's default action. "handled" may also represent a deliberate no-op,
 * such as refusing to indent past a container limit. "rejected" explicitly refuses
 * the action without applying its mutation. These results do not themselves create
 * a transaction or call preventDefault; the calling handler controls those steps.
 *
 * The separate acceptsDrop method returns a boolean. Drag checks the destination's
 * allowed child types and each source's allowed parent types before calling it.
 */
export interface BlockBehavior {
  /** Layout direction of this block's children, used to choose a drop position; it does not reorder the model. */
  readonly dropAxis?: DropAxis;
  /** Permitted direct child types during dragging; omitted means unrestricted. */
  readonly dropChildTypes?: readonly string[];
  /** Allowed parent block types when dragging this block; omitted means unrestricted, while a list excludes document-root drops. */
  readonly dropParentTypes?: readonly string[];
  /** Optional overrides for shared page-drag placement defaults. */
  readonly dropPlacement?: BlockDropPlacementOptions;
  /** Whether this type's complete BlockView is a drop target, including empty lanes. */
  readonly acceptsDropContainer?: boolean;
  /**
   * Splits the current block or inserts a sibling/child after Enter.
   *
   * @param context - Resolved block and editing runtime.
   * @param target - Caret or structural keyboard target that qualified Enter.
   * @returns Whether the behavior handled, refused, or deferred the split.
   */
  onSplit(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
  /**
   * Nests the supplied identifiers under their previous sibling.
   *
   * @param context - Resolved block (typically the first selected root).
   * @param ids - Outline identifiers to indent together.
   * @returns Whether the behavior handled, refused, or deferred the indent.
   */
  onIndent(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Lifts the supplied identifiers to their grandparent.
   *
   * @param context - Resolved block (typically the first selected root).
   * @param ids - Outline identifiers to outdent together.
   * @returns Whether the behavior handled, refused, or deferred the outdent.
   */
  onOutdent(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Outdents a nested block when Backspace is pressed at offset zero.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the behavior handled, refused, or deferred the outdent.
   */
  onOutdentAtStart(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
  /**
   * Merges a root block backward into the previous editable sibling.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the behavior handled, refused, or deferred the merge.
   */
  onMergeBackward(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
  /**
   * Merges the next editable sibling into the current block.
   *
   * @param context - Block that owns a caret at its content end.
   * @param target - Collapsed caret at the block end.
   * @returns Whether the behavior handled, refused, or deferred the merge.
   */
  onMergeForward(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
  /**
   * Converts the first empty custom block to the host writing type.
   *
   * @param context - Empty custom block with no previous editable sibling.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the behavior handled, refused, or deferred the reset.
   */
  onResetEmpty(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
  /**
   * Prepares structurally selected blocks immediately before they are deleted.
   *
   * @param context - One selected block whose behavior was resolved.
   * @param ids - Complete structural selection about to be removed.
   * @returns `"handled"` when the behavior already deleted, otherwise `"default"`.
   */
  onStructuralDelete(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Reports whether this destination may receive the dragged roots.
   *
   * @param context - Destination runtime and parent position, plus source block snapshots.
   * @returns `true` when the behavior accepts this destination for the supplied blocks; used for both feedback and drop validation.
   */
  acceptsDrop(context: BlockDropContext): boolean;
}

/** Behavior methods the page dispatchers may fall back through. */
export type BlockBehaviorAction =
  | "onSplit"
  | "onIndent"
  | "onOutdent"
  | "onOutdentAtStart"
  | "onMergeBackward"
  | "onMergeForward"
  | "onResetEmpty"
  | "onStructuralDelete";
