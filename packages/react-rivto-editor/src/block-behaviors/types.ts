import type { BlockStructuralBehavior, EditorBlock, Selection } from "@chulane/rivto";
import type { BlockDropPlacement } from "@chulane/rivto-page";
import type { ReactPanelApi } from "../panels/types";
import type { KeyboardSelectionTarget } from "../managers";

/** handled stops dispatch, unhandled continues the behavior chain, and rejected refuses the action. */
export type BlockBehaviorOutcome = "handled" | "unhandled" | "rejected";

/**
 * Block, selection, and DOM context supplied to a keyboard behavior method.
 *
 * `block` is a detached snapshot of the block whose data selected the behavior for this operation.
 * Selection is captured by the caller, while panel remains a live API.
 * Structural outline restrictions are dispatched separately by the core block manager,
 * while these handlers retain the DOM root needed for focus and keyboard editing.
 */
export interface BlockBehaviorContext {
  /** Editor view supplying selection, block behaviors, and shared writing factories. */
  readonly reactPanel: ReactPanelApi;
  /** Detached snapshot of the resolved block. */
  readonly block: EditorBlock;
  /** Structural parent, or `null` at the document root. */
  readonly parentId: string | null;
  /** Portable selection captured for this key or gesture. */
  readonly selection: Selection | undefined;
  /** Active page surface or edgeless card DOM root. */
  readonly root: HTMLElement;
}

/** Persisted block fields used for applicability without reading a recursive subtree. */
export type BlockBehaviorData = Readonly<Omit<EditorBlock, "children">>;

/**
 * Editing and movement operations supplied by an extension for one block type.
 *
 * Pass an instance as behavior in runtime.blockTypes.register alongside definition
 * and render. The registry selects applicable instances using isAvailable(block).
 * Independent registrations run by priority and may inspect the native type, properties,
 * current block data. Structural move checks use the core manager and the same
 * registered behavior. Matching blocks use the registered instance, so read block-specific state from context
 * rather than storing the last edited block on the behavior object. Rendering remains
 * in the extension's React component; mutations use the document managers.
 *
 * Returning "unhandled" asks dispatch to try the next applicable registered behavior. Returning "handled"
 * or "rejected" stops further editor handling; the keyboard handler can then prevent
 * the browser's default action. "handled" may also represent a deliberate no-op,
 * such as an editing action intentionally leaving content unchanged. "rejected"
 * explicitly refuses the action without applying its mutation. An "unhandled"
 * handler can defer to another applicable editing behavior. Structural deletion
 * policies and their preparatory mutations belong to the core manager. These results do not themselves create
 * a transaction or call preventDefault; the calling handler controls those steps.
 *
 * Omitted action methods defer to the next behavior. DefaultBlockBehavior is an
 * ordinary low-priority registration; inherited methods receive no special treatment.
 *
 * The React registry also registers the same behavior in the core editor for structural operations.
 */
export interface BlockBehavior extends BlockStructuralBehavior {
  /**
   * Chooses boundary depth for this block's direct child list.
   *
   * The first applicable behavior supplying a value wins; this does not affect
   * inside targets, nested lists, keyboard operations, or move permissions.
   *
   * @param block - Current detached fields of the child-list owner.
   * @returns A placement policy, or undefined to defer to lower-priority behavior.
   */
  childDropPlacement?(block: BlockBehaviorData): BlockDropPlacement | undefined;
  /**
   * Determines whether this block's children may be rendered or traversed.
   * Rendering, navigation, selection, Enter/Delete, and drag previews share this
   * policy so hidden descendants do not become visible interaction targets.
   * CollapseBlockBehavior supplies the collapsed-state rule when its extension is installed.
   * @param block - Persisted properties of the candidate block.
   * @returns False to hide children. Every applicable behavior must permit visibility.
   */
  childrenVisible?(block: BlockBehaviorData): boolean;
  /**
   * Splits the current block or inserts a sibling/child after Enter.
   *
   * The handling method owns continuation properties and document mutations;
   * the caller owns the transaction. Returning "unhandled" delegates the entire
   * split to the next applicable behavior rather than merging property patches.
   *
   * @param context - Resolved block and editing runtime.
   * @param target - Caret or structural keyboard target that qualified Enter.
   * @returns Whether the behavior handled, refused, or deferred the split.
   */
  onSplit?(context: BlockBehaviorContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
  /**
   * Outdents a nested block when Backspace is pressed at offset zero.
   *
   * @param context - Nested block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the behavior handled, refused, or deferred the outdent.
   */
  onOutdentAtStart?(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome;
  /**
   * Merges a root block backward into the previous editable sibling.
   *
   * @param context - Root block that owns the caret.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the behavior handled, refused, or deferred the merge.
   */
  onMergeBackward?(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome;
  /**
   * Merges the next editable sibling into the current block.
   *
   * @param context - Block that owns a caret at its content end.
   * @param target - Collapsed caret at the block end.
   * @returns Whether the behavior handled, refused, or deferred the merge.
   */
  onMergeForward?(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome;
  /**
   * Converts the first empty custom block to the host writing type.
   *
   * @param context - Empty custom block with no previous editable sibling.
   * @param target - Collapsed caret at offset zero.
   * @returns Whether the behavior handled, refused, or deferred the reset.
   */
  onResetEmpty?(
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): BlockBehaviorOutcome;
}

/** Behavior methods the page dispatchers may fall back through. */
export type BlockBehaviorAction =
  "onSplit" | "onOutdentAtStart" | "onMergeBackward" | "onMergeForward" | "onResetEmpty";
