import type { BlockDestination } from "@chulane/document-model";
import type { EditorBlock, Selection } from "@chulane/rivto";
import type { ReactPanelApi } from "../panels/types";
import type { ReactEditorApi } from "../editor/types";
import type { KeyboardSelectionTarget } from "../managers";

/** handled stops dispatch, unhandled continues the behavior chain, and rejected refuses the action. */
export type BlockBehaviorOutcome = "handled" | "unhandled" | "rejected";

/**
 * Block, selection, and DOM context supplied to a keyboard behavior method.
 *
 * `block` is a detached snapshot of the block whose data selected the behavior for this operation.
 * Selection is captured by the caller, while panel remains a live API.
 * Handlers inspect ancestors separately when they need a parent or a container
 * whose onChildOutdent handler prevents children from being outdented further.
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

/** Shallow operation context shared by child and parent outline handlers. */
export interface BlockOutlineContext {
  /** Live occurrence supplying document commands and selection. */
  readonly reactPanel: ReactPanelApi;
  /** Detached leading block, or its parent when invoking an onChild handler. */
  readonly block: BlockBehaviorData;
  /** Parent of the context block, or null at the document root. */
  readonly parentId: string | null;
  /** Selection captured for the complete group operation. */
  readonly selection: Selection | undefined;
}

/** Current block data for selecting a behavior, shared by every method. */
export interface BlockBehaviorAvailabilityContext {
  /** Runtime owning this block, or the destination runtime when inspecting foreign move sources. */
  readonly editor: ReactEditorApi;
  /** Detached block fields; moves check each source and the receiving parent separately. */
  readonly block: BlockBehaviorData;
}

/** Arguments supplied only to a movement permission method. */
export interface BlockMoveContext {
  /** Detached moved-root fields, possibly from another document; IDs are not resolved locally. */
  readonly sources: readonly BlockBehaviorData[];
  /** Core insertion position: before a child, or appended when beforeId is omitted. */
  readonly destination: BlockDestination;
  /** Runtime owning the destination document. */
  readonly editor: ReactEditorApi;
  /** Current receiving parent resolved once by the registry, or null at the document root. */
  readonly parent: BlockBehaviorData | null;
}

/**
 * Editing and movement operations supplied by an extension for one block type.
 *
 * Pass an instance as behavior in runtime.blockTypes.register alongside definition
 * and render. The registry selects applicable instances using isAvailable(context).
 * Independent registrations run by priority and may inspect the native type, properties,
 * current block data. Move checks select against each source and receiving parent,
 * then pass sources and destination only to canMove. Matching blocks use the registered instance, so read block-specific state from context
 * rather than storing the last edited block on the behavior object. Rendering remains
 * in the extension's React component; mutations use the document managers.
 *
 * Returning "unhandled" asks dispatch to try the next applicable registered behavior. Returning "handled"
 * or "rejected" stops further editor handling; the keyboard handler can then prevent
 * the browser's default action. "handled" may also represent a deliberate no-op,
 * such as refusing to indent past a container limit. "rejected" explicitly refuses
 * the action without applying its mutation. An "unhandled" handler may perform
 * preparatory mutations, such as relocating column contents before generic deletion
 * completes the action. These results do not themselves create
 * a transaction or call preventDefault; the calling handler controls those steps.
 *
 * Omitted action methods defer to the next behavior. DefaultBlockBehavior is an
 * ordinary low-priority registration; inherited methods receive no special treatment.
 *
 * The separate canMove method returns a boolean. Every applicable permission
 * must allow movement; geometry and input handling remain owned by extensions.
 */
export interface BlockBehavior {
  /**
   * Determines whether this behavior applies to the supplied block, independently of the called method.
   * @param context - Current detached block fields and owning runtime; foreign movement sources are supplied directly.
   * @returns True to participate. This synchronous predicate must not mutate the document;
   * availability is reevaluated for each call and is not cached by native type. Method names,
   * movement arguments, and operation discriminators are not part of this context.
   */
  isAvailable(context: BlockBehaviorAvailabilityContext): boolean;
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
   * Nests the supplied identifiers under their previous sibling.
   *
   * @param context - Resolved block (typically the first selected root).
   * @param ids - Outline identifiers to indent together.
   * @returns Whether the behavior handled, refused, or deferred the indent.
   */
  onIndent?(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Lifts the supplied identifiers to their grandparent.
   *
   * @param context - Resolved block (typically the first selected root).
   * @param ids - Outline identifiers to outdent together.
   * @returns Whether the behavior handled, refused, or deferred the outdent.
   */
  onOutdent?(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Intercepts indent of the leading block's children before their own behavior runs.
   *
   * Handlers may perform their own mutation and return handled, refuse with
   * rejected, or continue with unhandled. The caller owns the transaction. Use
   * panel block commands for custom execution, not the semantic indent helper,
   * which would dispatch this operation again.
   *
   * @param context - Current parent fields and live panel, without reading its subtree.
   * @param ids - Complete identifiers requested by this group operation.
   * @returns Whether the parent handled, rejected, or deferred the entire operation.
   */
  onChildIndent?(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Intercepts outdent of the leading block's children before their own behavior runs.
   *
   * Enter, Backspace and explicit outdent share this path. Handlers may mutate
   * through panel commands and claim the operation; they must not call the semantic
   * outdent helper recursively. The caller owns the transaction.
   *
   * @param context - Current parent fields and live panel, without reading its subtree.
   * @param ids - Complete identifiers requested by this group operation.
   * @returns Whether the parent handled, rejected, or deferred the entire operation.
   */
  onChildOutdent?(context: BlockOutlineContext, ids: readonly string[]): BlockBehaviorOutcome;
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
  /**
   * Prepares structurally selected blocks immediately before they are deleted.
   *
   * Registry dispatch consults this behavior on its first matching selected block
   * and skips it for later blocks in the same request. Every handler receives the
   * whole group. The first handled or rejected outcome claims the selection;
   * generic deletion runs only when all applicable handlers defer.
   *
   * @param context - One selected block whose behavior was resolved, with its full snapshot.
   * @param ids - Complete structural selection about to be removed, in the supplied order.
   * @returns Handled when the behavior claims deletion, rejected to refuse it, or unhandled to defer.
   */
  onStructuralDelete?(context: BlockBehaviorContext, ids: readonly string[]): BlockBehaviorOutcome;
  /**
   * Reports whether the supplied roots may move to this insertion position.
   * @param context - Sources and destination with a resolved parent; source IDs may belong to another document.
   * @returns False to veto the move. Each registration matching any source or receiving parent
   * is called at most once per check. The first veto stops further permission hooks;
   * every applicable hook must permit the move, regardless of priority.
   * This synchronous query must not mutate state; core commands still validate hierarchy.
   */
  canMove?(context: BlockMoveContext): boolean;
}

/** Behavior methods the page dispatchers may fall back through. */
export type BlockBehaviorAction =
  | "onSplit"
  | "onIndent"
  | "onOutdent"
  | "onChildIndent"
  | "onChildOutdent"
  | "onOutdentAtStart"
  | "onMergeBackward"
  | "onMergeForward"
  | "onResetEmpty"
  | "onStructuralDelete";
