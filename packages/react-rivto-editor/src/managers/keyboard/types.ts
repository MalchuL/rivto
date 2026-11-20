import type { EditorEvent } from "../events/editor-event";
import type { DOMEventScope, EditorEventHandler } from "../events/types";
import type { KeyboardEditorEvent } from "./keyboard-editor-event";
import type { EditorMode, Selection } from "@chulane/rivto";
import type { PanelInputRegistration, ReactPanelApi } from "../../panels/types";
import type {
  BlockEditingDocument,
  BlockEditingEditor,
  BlockEditingPanel,
} from "../../block-behaviors/types";
import type { InputRoot, KeyboardKeyInput, KeyboardTarget } from "@chulane/rivto-root";

/** Occurrence operations borrowed by keyboard action handlers. */
export type KeyboardEventInputRoot = Pick<
  InputRoot,
  | "isAttached"
  | "focus"
  | "clearSelection"
  | "readAttribute"
  | "isFocused"
  | "getElementIdentity"
  | "readRegionViewportTop"
  | "readRegionValues"
  | "measureRegionViewportBounds"
  | "captureDocumentScroll"
  | "observeWindowWheel"
  | "captureFrameClock"
>;

/** One exact + separated shortcut such as Primary+Shift+Z. */
export type KeyboardShortcut = string;
/**
 * Runtime replacement keys indexed by stable semantic binding ID.
 *
 * Unknown IDs are retained for future registrations so a typo stays visible
 * in the inventory as an uninstalled override.
 */
export type KeymapOverrides = Readonly<Record<string, readonly KeyboardShortcut[]>>;

/** Immutable panel of one installed or orphan keyboard binding. */
export interface KeyboardBindingSnapshot {
  /** Stable semantic action identity. */
  readonly id: string;
  /** Declared shortcuts, empty for an uninstalled override. */
  readonly defaultKeys: readonly KeyboardShortcut[];
  /** Effective shortcuts after applying any override. */
  readonly keys: readonly KeyboardShortcut[];
  /** Whether the shared keymap supplies an override for this identity. */
  readonly overridden: boolean;
  /** Whether an explicit empty override disables this action. */
  readonly disabled: boolean;
  /** Whether at least one action with this semantic identity is registered. */
  readonly installed: boolean;
  /** Keyboard phase used to match the action. */
  readonly phase: KeyboardEventPhase;
  /** Surface or window receiving the input. */
  readonly target: KeyboardEventTarget;
  /** Optional required editing scope. */
  readonly scope?: DOMEventScope;
  /** Optional editor modes in which the action is eligible. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** Dispatch priority, with higher values evaluated first. */
  readonly priority: number;
  /** Other action identities that share a conflicting shortcut bucket. */
  readonly conflicts: readonly string[];
}
/** Keyboard input phase on which a binding is evaluated. */
export type KeyboardEventPhase = "keydown" | "keyup";
/** Policy used while the browser reports an active IME composition. */
export type KeyboardCompositionPolicy = "ignore" | "handle" | "prevent";
/** Keyboard listeners are attached to the surface or its window. */
export type KeyboardEventTarget = "surface" | "window";

/** Declarative semantic keyboard action. */
export interface KeyboardEventDefinition {
  /** Unique identity within the keyboard registry and keymap overrides. */
  readonly id: string;
  /** Default exact shortcuts, replaced by a matching keymap override. */
  readonly keys: KeyboardShortcut | readonly KeyboardShortcut[];
  /** Keyboard input phase; defaults to keydown. */
  readonly phase?: KeyboardEventPhase;
  /** Attachment realm; defaults to the active surface. */
  readonly target?: KeyboardEventTarget;
  /** Optional resolved surface, block, or content requirement. */
  readonly scope?: DOMEventScope;
  /** Editor modes in which this action is eligible. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** IME policy; defaults to ignore. */
  readonly composing?: KeyboardCompositionPolicy;
  /** Higher values run first; equal priorities retain registration order. */
  readonly priority?: number;
  /**
   * Checks dynamic availability after the shortcut matches.
   *
   * @param event - Normalized keyboard and receiving-panel context.
   * @returns Whether this binding may run for the current input.
   * @throws Propagates predicate failures during dispatch.
   */
  readonly when?: (event: KeyboardEditorEvent) => boolean;
}

/** Semantic keyboard registrations, inventory, and shared keymap settings. */
export interface KeyboardApi {
  /**
   * Registers one stable semantic action and returns its idempotent disposer.
   *
   * @param definition - Action ID, default shortcuts, and dispatch policies.
   * @param listener - Receives normalized keyboard context and may claim the action.
   * @returns Disposer releasing this registration and its ID.
   * @throws If the definition is invalid, its ID is already registered, or ownership is inactive.
   */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
  ): () => void;
  /**
   * Deletes a registered semantic action by ID.
   *
   * @param id - Registration identity in the current owner's namespace.
   * @returns Whether an existing registration was removed.
   * @throws Propagates registration cleanup failures.
   */
  delete(id: string): boolean;
  /**
   * Returns an immutable snapshot of installed bindings and orphan overrides.
   *
   * @returns Inventory snapshot retained until the next registry or override revision.
   */
  list(): readonly KeyboardBindingSnapshot[];
  /** Increments when registrations or overrides change. */
  readonly revision: number;
  /**
   * Subscribes to inventory revisions.
   *
   * @param listener - Called after registration or override changes.
   * @returns Disposer removing this subscription.
   */
  subscribe(listener: () => void): () => void;
  /**
   * Replaces every override, restoring defaults for omitted IDs.
   *
   * @param keymap - Complete override map; empty shortcut lists disable bindings.
   * @returns The shared override map and inventory have been updated.
   * @throws If the runtime is inactive or a shortcut is invalid.
   */
  replaceKeymap(keymap: KeymapOverrides): void;
  /**
   * Sets one override; an empty array disables it and undefined restores defaults.
   *
   * @param id - Existing or future semantic action identity.
   * @param keys - Replacement shortcuts, an empty list, or undefined to restore defaults.
   * @returns The shared override and inventory have been updated.
   * @throws If the runtime is inactive, the ID is invalid, or a shortcut is invalid.
   */
  setKeymapOverride(id: string, keys: readonly KeyboardShortcut[] | undefined): void;
}

/** Current target properties needed by keyboard navigation and canvas shortcuts. */
export type { KeyboardTargetState } from "@chulane/rivto-root";

/** Shared editor services borrowed by keyboard actions. */
export interface KeyboardEditor extends BlockEditingEditor {
  /** Identity of the shared extension owner, used to locate canvas selection. */
  readonly extensions: object;
}

/** Document-wide operations borrowed by keyboard actions. */
export interface KeyboardDocument extends BlockEditingDocument {
  /** Reads hierarchy and relocates blocks during structural editing. */
  readonly blocks: Pick<
    ReactPanelApi["document"]["blocks"],
    "getBlockNode" | "getParentId" | "moveBlocks" | "getInsertionDestinationAfter"
  >;
  /** Synchronous undo and redo operations. */
  readonly history: Pick<ReactPanelApi["document"]["history"], "undo" | "redo">;
  /** Checks and executes installed document commands. */
  readonly commands: Pick<ReactPanelApi["document"]["commands"], "has" | "execute">;
}

/** Panel operations borrowed by keyboard action handlers. */
export interface KeyboardPanel extends BlockEditingPanel {
  /** Reads and edits blocks within this occurrence. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | keyof BlockEditingPanel["blocks"]
    | "getBlocks"
    | "hasBlock"
    | "hasChildren"
    | "moveBlocks"
    | "removeBlocks"
    | "updateBlocks"
  >;
  /** Shared document editing, history, and commands. */
  readonly document: KeyboardDocument;
  /** Shared block editing policy and extension identity. */
  readonly editor: KeyboardEditor;
  /** Reads and updates canvas elements within this occurrence. */
  readonly elements: Pick<
    ReactPanelApi["elements"],
    keyof BlockEditingPanel["elements"] | "getElementNode" | "updateElements" | "removeElements"
  >;
  /** Reads, updates, and restores this occurrence's selection. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    | keyof BlockEditingPanel["selection"]
    | "snapshot"
    | "subscribe"
    | "clear"
    | "readDOM"
    | "delete"
    | "restoreDOM"
    | "focusBlockSelection"
    | "selectableBlockIds"
    | "adjacentCaretPosition"
    | "verticalCaretPosition"
    | "focusAdjacentEditor"
    | "selectTextRange"
    | "runWithViewportPreserved"
    | "scheduleIfSelectionUnchanged"
  >;
}

/** Captured values and capabilities required for one keyboard delivery. */
export interface KeyboardEditorEventInit {
  /** Receiving panel borrowed for this dispatch. */
  readonly reactPanel: KeyboardPanel;
  /** Exact receiving input registration. */
  readonly inputRoot: KeyboardEventInputRoot;
  /** Exact routing registration that produced this keyboard delivery. */
  readonly inputRegistration: PanelInputRegistration;
  /** Surface mode captured when input was routed. */
  readonly mode: EditorMode;
  /** Detached panel selection captured when input was routed. */
  readonly selection: Selection | undefined;
  /** Listener realm that received this input. */
  readonly eventTarget: KeyboardEventTarget;
  /** Whether the input target was inside the receiving surface. */
  readonly insideRoot: boolean;
  /** Whether a block marker was resolved when input was routed. */
  readonly insideBlock: boolean;
  /** Whether an editable content marker was resolved when input was routed. */
  readonly insideContent: boolean;
  /** Captured block identity, when a block marker was resolved. */
  readonly blockId: string | undefined;
  /** Copied key values captured by the routed event context. */
  readonly keyboardInput: KeyboardKeyInput;
  /** Live target queries owned by the browser adapter. */
  readonly keyboardTarget: KeyboardTarget;
  /** Exact shortcut normalized from copied keyboard input. */
  readonly shortcut: string;
  /** Keyboard phase which produced the dispatch. */
  readonly phase: KeyboardEventPhase;
}

export type KeyboardDOMEvent =
  | EditorEvent<"surface", "keydown">
  | EditorEvent<"surface", "keyup">
  | EditorEvent<"window", "keydown">
  | EditorEvent<"window", "keyup">;
