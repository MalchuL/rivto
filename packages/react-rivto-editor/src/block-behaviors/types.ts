import type { BlockDestination } from "@chulane/document-model";
import type { DocumentEditorAPI, EditorBlock, PanelAPI, Selection } from "@chulane/rivto";
import type { PanelInputRegistration, ReactPanelApi } from "../panels/types";
import type { ReactEditorExtensionApi } from "../editor/types";
import type { KeyboardSelectionTarget } from "../managers";
import type { InputRoot } from "@chulane/rivto-root";

/** handled stops dispatch, unhandled continues the behavior chain, and rejected refuses the action. */
export type BlockBehaviorOutcome = "handled" | "unhandled" | "rejected";

/**
 * Detached block and selection context supplied to block behavior methods.
 *
 * `block` is a detached snapshot of the block whose data selected the behavior for this operation.
 * Selection is captured by the caller, while panel remains a live API.
 * Handlers inspect ancestors separately when they need a parent or a container
 * whose onChildOutdent handler prevents children from being outdented further.
 */
export interface BlockSnapshotContext<Panel extends BlockReadPanel = BlockSnapshotPanel> {
  /** Borrowed panel supplying scoped block reads and document relocation operations. */
  readonly reactPanel: Panel;
  /** Detached snapshot of the resolved block. */
  readonly block: EditorBlock;
  /** Structural parent, or `null` at the document root. */
  readonly parentId: string | null;
  /** Portable selection captured for this key or gesture. */
  readonly selection: Selection | undefined;
}

/** Document-wide insertion positions used by outline editing. */
export interface BlockEditingDocument {
  /** Resolves an insertion position in the complete document. */
  readonly blocks: Pick<ReactPanelApi["document"]["blocks"], "getInsertionDestinationAfter">;
}

/** Move policy borrowed by outline behavior. */
export interface BlockOutlineEditor {
  /** Checks whether the selected blocks may move to a destination. */
  readonly blockBehaviors: Pick<ReactPanelApi["editor"]["blockBehaviors"], "canMove">;
}

/** Shared editor services used by block editing behaviors. */
export interface BlockEditingEditor extends BlockOutlineEditor {
  /** Determines and creates the host writing block. */
  readonly defaultWritingBlockFactory: Pick<
    ReactPanelApi["editor"]["defaultWritingBlockFactory"],
    "isEmptyBlock" | "createEmptyBlock"
  >;
  /** Dispatches outline behavior and checks move and visibility policies. */
  readonly blockBehaviors: Pick<
    ReactPanelApi["editor"]["blockBehaviors"],
    "dispatch" | "childrenVisible" | "canMove"
  >;
}

/** Panel operations used by outline indentation and outdentation. */
export interface BlockOutlinePanel {
  /** Reads and moves selected outline blocks. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | "getBlockNode"
    | "getParentId"
    | "getRootIds"
    | "getChildIds"
    | "getOrderedIds"
    | "canRemove"
    | "canOutdent"
    | "indentBlocks"
    | "outdentBlocks"
    | "updateBlock"
  >;
  /** Reads document-wide insertion positions. */
  readonly document: BlockEditingDocument;
  /** Checks move permissions for the selected blocks. */
  readonly editor: BlockOutlineEditor;
}

/** Panel operations used by block editing behaviors. */
export interface BlockEditingPanel
  extends BlockOutlinePanel, Pick<ReactPanelApi, "inputRoot" | "batchUpdates" | "getSurfaceType"> {
  /** Reads and edits blocks within this occurrence. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | "getBlock"
    | "getBlockNode"
    | "getParentId"
    | "getRootIds"
    | "getChildIds"
    | "getOrderedIds"
    | "canRemove"
    | "canOutdent"
    | "getInsertionDestinationAfter"
    | "updateBlock"
    | "insertBlock"
    | "indentBlock"
    | "moveBlock"
    | "deleteListProps"
    | "mergeBlocks"
    | "setBlockType"
    | "indentBlocks"
    | "outdentBlocks"
    | "outdentBlock"
    | "removeBlock"
  >;
  /** Writing factory and behavior policy operations. */
  readonly editor: BlockEditingEditor;
  /** Reads and updates the canvas card range. */
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes" | "updateElement">;
  /** Reads and updates selection and restores caret focus. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    | "get"
    | "set"
    | "scheduleIfSelectionUnchanged"
    | "focusBlock"
    | "isRenderedBlockNested"
    | "adjacentEditableBlockId"
    | "runWithStructuralPredecessorFocus"
  >;
}

/**
 * Block snapshot and originating attachment used by keyboard editing behaviors.
 *
 * The panel remains live while the block and selection are captured by the
 * caller. Direct UI behavior invocations may omit the keyboard attachment.
 * When present, the attachment identifies the originating editing surface and
 * can become stale after the occurrence is replaced.
 */
export interface BlockKeyboardContext extends BlockSnapshotContext<BlockEditingPanel> {
  /** Exact originating keyboard attachment, absent for direct UI behavior invocations. */
  readonly inputRoot?: Pick<InputRoot, "isAttached">;
  /** Routing lifetime captured for keyboard input, absent for direct UI invocations. */
  readonly inputRegistration?: PanelInputRegistration;
}

/** Selection operations needed to defer caret focus. */
export interface CaretFocusPanel {
  /** Current input registration of the receiving occurrence, when mounted. */
  readonly inputRoot?: ReactPanelApi["inputRoot"];
  /** Schedules and applies caret focus within the receiving occurrence. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "scheduleIfSelectionUnchanged" | "focusBlock"
  >;
}

/** Selection operations needed to publish and defer caret focus. */
export interface CaretSelectionPanel extends CaretFocusPanel {
  /** Publishes the caret and schedules and applies its editing focus. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "set" | "scheduleIfSelectionUnchanged" | "focusBlock"
  >;
}

/** Panel operations borrowed by container writing insertion. */
export interface ContainerWritingPanel
  extends CaretFocusPanel, Pick<ReactPanelApi, "batchUpdates" | "inputRoot"> {
  /** Container expansion and insertion of its first writing child. */
  readonly blocks: Pick<ReactPanelApi["blocks"], "updateBlock" | "insertBlock">;
  /** Factory for the default writing child. */
  readonly editor: ContainerWritingEditor;
  /** Publishes the new caret and schedules its focus. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "set" | "scheduleIfSelectionUnchanged" | "focusBlock"
  >;
}

/** Default writing factory borrowed from the shared editor. */
export interface ContainerWritingEditor {
  readonly defaultWritingBlockFactory: Pick<
    ReactPanelApi["editor"]["defaultWritingBlockFactory"],
    "createEmptyBlock"
  >;
}

/** Container insertion context from keyboard or direct controls. */
export interface ContainerWritingContext {
  /** Borrowed operations for this occurrence. */
  readonly reactPanel: ContainerWritingPanel;
  /** Detached container snapshot. */
  readonly block: EditorBlock;
  /** Mounted or keyboard-registration capability captured when the action began. */
  readonly inputRoot?: Pick<InputRoot, "isAttached">;
  /** Routing lifetime captured for keyboard input, absent for direct UI invocations. */
  readonly inputRegistration?: PanelInputRegistration;
}

/** Block reads needed to resolve a behavior snapshot. */
export interface BlockReadPanel {
  /** Reads blocks and parents within this occurrence's panel. */
  readonly blocks: Pick<PanelAPI["blocks"], "getBlock" | "getBlockNode" | "getParentId">;
}

/** Block operations borrowed by structural deletion policy and context resolution. */
export interface BlockSnapshotPanel extends BlockReadPanel {
  /** Document operations used to relocate children when a structural container is removed. */
  readonly document: BlockRelocationDocument;
}

/** Document-wide block operations needed to preserve children during container deletion. */
export interface BlockRelocationDocument {
  /** Resolves container ancestry and moves surviving children in the document. */
  readonly blocks: Pick<DocumentEditorAPI["blocks"], "getBlockNode" | "getParentId" | "moveBlocks">;
}

/** Persisted block fields used for applicability without reading a recursive subtree. */
export type BlockBehaviorData = Readonly<Omit<EditorBlock, "children">>;

/** Shallow operation context shared by child and parent outline handlers. */
export interface BlockOutlineContext {
  /** Live occurrence supplying document commands and selection. */
  readonly reactPanel: BlockOutlinePanel;
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
  readonly editor: ReactEditorExtensionApi;
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
  readonly editor: ReactEditorExtensionApi;
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
  onSplit?(context: BlockKeyboardContext, target: KeyboardSelectionTarget): BlockBehaviorOutcome;
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
    context: BlockKeyboardContext,
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
    context: BlockKeyboardContext,
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
    context: BlockKeyboardContext,
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
    context: BlockKeyboardContext,
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
  onStructuralDelete?(context: BlockSnapshotContext, ids: readonly string[]): BlockBehaviorOutcome;
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
