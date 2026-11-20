import type {
  ContentInput,
  DOMEventDefinition,
  DOMEventName,
  DOMEventTarget,
  EditorEventInit,
  EditorEventInputRoot,
  EventPanel,
  IsFocusWithinBlock,
  ReadContentText,
} from "./types";
/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type { EditorMode, Selection } from "@chulane/rivto";
import type { PanelInputRegistration } from "../../panels/types";
import type {
  ClipboardData,
  ClipboardTarget,
  KeyboardKeyInput,
  KeyboardTarget,
  MouseInput,
  PointerInput,
  TextInputData,
} from "@chulane/rivto-root";
import { matchesEventContext } from "./matches-event-context";

/**
 * Immutable-by-convention value passed through one editor event dispatch.
 *
 * This class stores captured context and evaluates mode/scope filters against it.
 * Registration, ordering, claiming, and cleanup remain responsibilities of EventManager.
 */
export class EditorEvent<
  Target extends DOMEventTarget = DOMEventTarget,
  Type extends DOMEventName = DOMEventName,
> {
  readonly reactPanel: EventPanel;
  /** Browser operations borrowed from the exact panel attachment. */
  readonly inputRoot: EditorEventInputRoot;
  /** Exact routing lifetime captured for this delivery. */
  readonly inputRegistration: PanelInputRegistration;
  /** Copied editing fields, or undefined when no editing snapshot was supplied. */
  readonly textInput: TextInputData | undefined;
  /** Synchronous clipboard access, or null for non-clipboard or unavailable data. */
  readonly clipboard: ClipboardData | null;
  /** Live target and focused-host queries for clipboard deliveries. */
  readonly clipboardTarget: ClipboardTarget | undefined;
  /** Copied pointer input and capabilities for pointer deliveries. */
  readonly pointerInput: PointerInput | undefined;
  /** Copied mouse input and target queries for mouse deliveries. */
  readonly mouseInput: MouseInput | undefined;
  /** Copied keyboard values, or undefined for non-keyboard input. */
  readonly keyboardInput: KeyboardKeyInput | undefined;
  /** Live target queries, or undefined for non-keyboard input. */
  readonly keyboardTarget: KeyboardTarget | undefined;
  readonly mode: EditorMode;
  readonly selection: Selection | undefined;
  readonly eventTarget: Target;
  readonly insideRoot: boolean;
  /** Whether a block marker was resolved when the event was routed. */
  readonly insideBlock: boolean;
  readonly blockId: string | undefined;
  /** Whether a content marker was resolved when the event was routed. */
  readonly insideContent: boolean;
  /** Reads current text from a beforeinput delivery's captured content host, when present. */
  readonly readContentText: ReadContentText | undefined;
  /** Captured content operations for an input delivery, when present. */
  readonly contentInput: ContentInput | undefined;
  /** Checks the related focus target against the captured block on focusout. */
  readonly isFocusWithinBlock: IsFocusWithinBlock | undefined;

  /**
   * Creates one normalized snapshot from registry-resolved values.
   *
   * Values are retained as supplied, without querying live panel state or cloning
   * the selection. The caller supplies the detached selection snapshot.
   *
   * @param init - Captured panel, DOM and selection context for this delivery.
   */
  constructor(init: EditorEventInit<Target, Type>) {
    this.reactPanel = init.reactPanel;
    this.inputRoot = init.inputRoot;
    this.inputRegistration = init.inputRegistration;
    this.textInput = init.textInput;
    this.clipboard = init.clipboard ?? null;
    this.clipboardTarget = init.clipboardTarget;
    this.pointerInput = init.pointerInput;
    this.mouseInput = init.mouseInput;
    this.keyboardInput = init.keyboardInput;
    this.keyboardTarget = init.keyboardTarget;
    this.mode = init.mode;
    this.selection = init.selection;
    this.eventTarget = init.eventTarget;
    this.insideRoot = init.insideRoot;
    this.insideBlock = init.insideBlock;
    this.blockId = init.blockId;
    this.insideContent = init.insideContent;
    this.readContentText = init.readContentText;
    this.contentInput = init.contentInput;
    this.isFocusWithinBlock = init.isFocusWithinBlock;
  }
  /**
   * Checks host mode and DOM scope restrictions against this captured context.
   *
   * Omitted restrictions accept every mode or scope, including outside-root events.
   * Dynamic availability predicates remain the dispatcher's responsibility.
   *
   * @param definition - Optional mode and scope restrictions from a DOM or keyboard registration.
   * @returns Whether both restrictions match the receiving panel and target markers.
   */
  matches(definition: Pick<DOMEventDefinition, "mode" | "scope">): boolean {
    return matchesEventContext(
      definition,
      this.mode,
      this.insideRoot,
      this.insideBlock,
      this.insideContent,
    );
  }
}
