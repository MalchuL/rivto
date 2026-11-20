import type { EditorMode, Selection } from "@chulane/rivto";
import type { PanelInputRegistration, PanelRegistration, ReactPanelApi } from "../../panels/types";
import type { EventManager } from "./event-manager";
import type { EditorEvent } from "./editor-event";
import type { KeyboardEditor, KeyboardEventInputRoot, KeyboardPanel } from "../keyboard/types";
import type {
  BrowserInputMap,
  BrowserInputRootApi,
  ClipboardData,
  ClipboardTarget,
  CustomEventDefinition,
  EventResult,
  KeyboardKeyInput,
  KeyboardTarget,
  MouseInput,
  PointerInput,
  TextInputData,
} from "@chulane/rivto-root";

/** Native listener realm supported by the active editor surface. */
export type DOMEventTarget = "surface" | "document" | "window";

/** Optional resolved presentation boundary required by a registration. */
export type DOMEventScope = "surface" | "block" | "content";

/** Root-normalized input names accepted by an editor listener. */
export type DOMEventName = Extract<keyof BrowserInputMap, string>;

/** Declarative DOM registration with stable identity and optional filtering. */
export interface DOMEventDefinition<
  Target extends DOMEventTarget = "surface",
  Type extends DOMEventName = DOMEventName,
> {
  /** Unique identity within the DOM registry. */
  readonly id: string;
  /** Root-normalized input name observed at the selected target. */
  readonly type: Type;
  /** Attachment realm; defaults to the active surface. */
  readonly target?: Target;
  /** Resolved boundary which must contain the native target. */
  readonly scope?: DOMEventScope;
  /** Editor modes in which this registration participates. */
  readonly mode?: EditorMode | readonly EditorMode[];
  /** Native capture option. */
  readonly capture?: boolean;
  /** Cancel the browser default when handled; defaults to true. False still stops later editor handlers. */
  readonly preventDefault?: boolean;
  /** Native passive option. */
  readonly passive?: boolean;
  /**
   * Checks dynamic availability immediately before the handler.
   *
   * @param event - Normalized input and receiving-panel context.
   * @returns Whether the handler may run for this delivery.
   * @throws Propagates predicate failures during dispatch.
   */
  readonly when?: (event: EditorEvent<Target, Type>) => boolean;
}

/** Document-wide subscriptions borrowed during extension setup. */
export interface ExtensionEventsApi<CustomEvents extends object> extends Pick<
  EventManager<CustomEvents>,
  "observe" | "delete"
> {
  /**
   * Registers a handler for normalized browser input in the receiving panel.
   *
   * @param definition - Document-wide registration ID, input name, and delivery filters.
   * @param listener - Receives the routed input and may claim delivery.
   * @returns Idempotent disposer also released by the installing extension.
   * @throws If the manager is inactive, registration fails, or the ID is invalid or in use.
   */
  register<Target extends DOMEventTarget = "surface", Type extends DOMEventName = DOMEventName>(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
  ): () => void;

  /**
   * Registers a handler for a typed event published by the document's host.
   *
   * @param definition - Registration ID, custom event name, and optional priority.
   * @param listener - Receives the producer's payload and may claim delivery.
   * @returns Idempotent disposer also released by the installing extension.
   * @throws If the manager is inactive or the registration ID or priority is invalid.
   */
  register<K extends Extract<keyof CustomEvents, string>>(
    definition: CustomEventDefinition<K>,
    listener: (event: CustomEvents[K]) => EventResult | void,
  ): () => void;
}

/** Panel operations borrowed by browser event handlers. */
export interface EventPanel extends KeyboardPanel, Pick<ReactPanelApi, "rootBlockId"> {
  /** Pastes into this occurrence without exposing clipboard registration. */
  readonly clipboard: Pick<ReactPanelApi["clipboard"], "paste">;
  /** Selection reads, changes, and content-host lookup for event handlers. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    keyof KeyboardPanel["selection"] | "contentInput"
  >;
  /** Shared policies and clipboard formatting needed by event handlers. */
  readonly editor: EventEditor;
  /** Reads shortcut bindings without registering or changing them. */
  readonly keyboard: Pick<ReactPanelApi["keyboard"], "list">;
}

/** Shared editor operations used by browser event handlers. */
export interface EventEditor extends KeyboardEditor {
  /** Formats copied content and parses external clipboard data. */
  readonly clipboardFormats: Pick<
    ReactPanelApi["editor"]["clipboardFormats"],
    "formatBundle" | "parseContent"
  >;
  /** Checks whether list behavior is installed. */
  readonly blockListProps: Pick<ReactPanelApi["editor"]["blockListProps"], "has">;
}

/**
 * Reads the current text of the content host captured for an input delivery.
 *
 * The host identity is captured once; reads reflect later changes to that same
 * host. Use this synchronously during dispatch rather than retaining it.
 *
 * @returns The host's current text, or an empty string when it has no text.
 */
export type ReadContentText = () => string;

/**
 * Checks whether the other focus target remains inside the captured block.
 *
 * @returns True only while the focus target belongs to that block.
 */
export type IsFocusWithinBlock = () => boolean;

export type {
  ContentBounds,
  ContentCaret,
  ContentCaretGeometry,
  ContentViewport,
  TextHost as ContentInput,
  TextHostIdentity as ContentHostIdentity,
} from "@chulane/rivto-root";
import type { TextHost as ContentInput } from "@chulane/rivto-root";

/** Callback used by DOM and keyboard event registrations. */
export type EditorEventHandler<EventValue> = (event: EventValue) => boolean | void;

/** Occurrence operations borrowed by editor event handlers. */
export type EditorEventInputRoot = KeyboardEventInputRoot &
  Pick<
    BrowserInputRootApi,
    | "hasFocus"
    | "isDocumentFocused"
    | "readViewport"
    | "isConnected"
    | "setTemporaryAttribute"
    | "findRegions"
  >;

/**
 * Constructor values for one normalized editor event.
 *
 * PanelEventFactory resolves these values once per native listener group delivery.
 * The resulting event is then shared by availability predicates and ordered
 * handlers; later native groups capture their own current panel context.
 */
export interface EditorEventInit<
  Target extends DOMEventTarget = DOMEventTarget,
  Type extends DOMEventName = DOMEventName,
> {
  /** React editor owning browser interaction and focused document capabilities. */
  readonly reactPanel: EventPanel;
  /** Browser capabilities borrowed from the exact panel attachment. */
  readonly inputRoot: EditorEventInputRoot;
  /** Exact routing registration retained for this delivery. */
  readonly inputRegistration: PanelInputRegistration;
  /** Copied editing fields for input and beforeinput deliveries, when supplied. */
  readonly textInput?: TextInputData;
  /** Clipboard formats for copy, cut, or paste; absent when unavailable. */
  readonly clipboard?: ClipboardData | null;
  /** Live target and focused-host queries for clipboard deliveries. */
  readonly clipboardTarget?: ClipboardTarget;
  /** Copied pointer input and capabilities for pointer deliveries. */
  readonly pointerInput?: PointerInput;
  /** Copied mouse input and target queries for mouse deliveries. */
  readonly mouseInput?: MouseInput;
  /** Copied key and modifier values for keydown or keyup delivery. */
  readonly keyboardInput?: KeyboardKeyInput;
  /** Live target queries for keydown or keyup delivery. */
  readonly keyboardTarget?: KeyboardTarget;
  /** Editor mode captured for this dispatch, supplied by the receiving panel's rendered surface. */
  readonly mode: EditorMode;
  /** Detached structured selection captured for this dispatch. */
  readonly selection: Selection | undefined;
  /** Realm on which the native listener is attached. */
  readonly eventTarget: Target;
  /** Whether the native target belongs to the active surface. */
  readonly insideRoot: boolean;
  /** Whether a block marker was resolved inside the active surface. */
  readonly insideBlock: boolean;
  /** Persisted identity read from the captured block marker. */
  readonly blockId: string | undefined;
  /** Whether an editable content marker was resolved inside the active surface. */
  readonly insideContent: boolean;
  /** Live text of the captured content host for beforeinput, when one exists. */
  readonly readContentText?: ReadContentText;
  /** Captured input content with normalized caret and geometry operations. */
  readonly contentInput?: ContentInput;
  /** Live focus-out target containment within the captured block, when applicable. */
  readonly isFocusWithinBlock?: IsFocusWithinBlock;
}

/** Normalized browser fields captured before editor-specific routing context is added. */
export type EditorEventInputFields = Pick<
  EditorEventInit,
  | "keyboardInput"
  | "keyboardTarget"
  | "clipboard"
  | "clipboardTarget"
  | "pointerInput"
  | "mouseInput"
  | "textInput"
  | "readContentText"
  | "isFocusWithinBlock"
>;

export type AnyEditorEvent = EditorEvent<DOMEventTarget, never>;

/** Type-erased custom payloads indexed by event group identity. */
export interface CustomEventPayloads {
  readonly [group: string]: unknown;
}

export interface DOMRegistration {
  readonly id: string;
  /** False immediately on removal, including in snapshots retained by an ongoing event. */
  active: boolean;
  readonly owner?: Pick<PanelRegistration, "id" | "inputRoot">;
  readonly type: string;
  readonly target: DOMEventTarget;
  readonly scope?: DOMEventScope;
  readonly listener: EditorEventHandler<AnyEditorEvent>;
  readonly mode?: EditorMode | readonly EditorMode[];
  readonly capture: boolean;
  readonly passive: boolean;
  readonly preventDefault: boolean;
  readonly when?: (event: AnyEditorEvent) => boolean;
}
