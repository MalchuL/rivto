import type { KeyboardKeyInput, KeyboardTarget } from "@chulane/rivto-root";
import type { EditorMode, Selection } from "@chulane/rivto";
import type { PanelInputRegistration } from "../../panels/types";
import type { DOMEventDefinition } from "../events/types";
import { matchesEventContext } from "../events/matches-event-context";
import type {
  KeyboardEventPhase,
  KeyboardEventTarget,
  KeyboardEditorEventInit,
  KeyboardEventInputRoot,
  KeyboardPanel,
  KeyboardTargetState,
} from "./types";
import { BLOCK_CONTENT_SELECTOR, BLOCK_ID_ATTRIBUTE, BLOCK_ID_SELECTOR } from "../../constants";

/** Keyboard input and panel context for a single synchronous dispatch. */
export class KeyboardEditorEvent {
  readonly #target: KeyboardTarget;
  readonly #insideContent: boolean;
  /** Receiving panel borrowed for this dispatch. */
  readonly reactPanel: KeyboardPanel;
  /** Surface mode captured when the input was routed. */
  readonly mode: EditorMode;
  /** Panel selection captured when the input was routed. */
  readonly selection: Selection | undefined;
  /** Listener realm that received this input. */
  readonly eventTarget: KeyboardEventTarget;
  /** Whether the input target was inside the receiving surface. */
  readonly insideRoot: boolean;
  /** Whether a block marker was resolved when this input was routed. */
  readonly insideBlock: boolean;
  /** Captured block identity, when a block marker was resolved. */
  readonly blockId: string | undefined;
  /** Browser operations borrowed from the exact panel attachment. */
  readonly inputRoot: KeyboardEventInputRoot;
  /** Exact routing lifetime captured for this delivery. */
  readonly inputRegistration: PanelInputRegistration;
  /** Copied key, modifiers and composition state. */
  readonly keyboard: KeyboardKeyInput;
  /** Formatted shortcut for this delivery. */
  readonly shortcut: string;
  /** Keyboard phase that produced this delivery. */
  readonly phase: KeyboardEventPhase;

  /**
   * Captures panel context and copied keyboard data for predicates and handlers.
   *
   * The root browser adapter owns native input. Target checks read its live ancestry,
   * while mode, selection and scope are captured.
   *
   * @param init - Captured panel, scope, keyboard data, and target capabilities for this delivery.
   */
  constructor(init: KeyboardEditorEventInit) {
    this.#target = init.keyboardTarget;
    this.insideBlock = init.insideBlock;
    this.#insideContent = init.insideContent;
    this.reactPanel = init.reactPanel;
    this.mode = init.mode;
    this.selection = init.selection;
    this.eventTarget = init.eventTarget;
    this.insideRoot = init.insideRoot;
    this.blockId = init.blockId;
    this.inputRoot = init.inputRoot;
    this.inputRegistration = init.inputRegistration;
    this.keyboard = init.keyboardInput;
    this.shortcut = init.shortcut;
    this.phase = init.phase;
  }

  /**
   * Checks captured panel mode and target scope against a registration.
   *
   * @param definition - Optional mode and scope restrictions.
   * @returns Whether both restrictions match the captured context.
   */
  matches(definition: Pick<DOMEventDefinition, "mode" | "scope">): boolean {
    return matchesEventContext(
      definition,
      this.mode,
      this.insideRoot,
      this.insideBlock,
      this.#insideContent,
    );
  }

  /**
   * Checks whether the current target belongs to marked block content.
   *
   * The target ancestry is read when called, so changes made by earlier
   * handlers affect subsequent eligibility checks. A content marker must
   * have an ancestor block with a nonempty ID; editability is not inspected.
   * Delegated events arrive after bubbling while the target identifies the
   * deepest originating element. The lookup walks upward to the content and
   * then its block shell. Events outside marked content remain available to
   * buttons, menus, and other controls.
   *
   * @returns Whether the native target currently resolves to block content.
   */
  readonly isBlockContentTarget = (): boolean => {
    if (!this.#target.isCurrentRealmElement()) {
      return false;
    }
    return Boolean(
      this.#target.closestAncestorAttribute(
        BLOCK_CONTENT_SELECTOR,
        BLOCK_ID_SELECTOR,
        BLOCK_ID_ATTRIBUTE,
      ),
    );
  };

  /**
   * Checks whether the event was targeted directly at this panel's surface.
   *
   * Descendants do not match, including content and controls inside the panel.
   *
   * @returns Whether the native event target is the captured panel root.
   */
  readonly isRootTarget = (): boolean => this.#target.isRoot();

  /**
   * Reads the current keyboard target's control and editability properties.
   *
   * The structural element check accepts nodes from other documents. The realm
   * flag preserves the current JavaScript realm check used by navigation.
   * Properties are read at each call rather than captured at dispatch.
   *
   * @returns Copied target properties, or undefined when the target is not an element with a tag name.
   */
  readonly readTarget = (): KeyboardTargetState | undefined => this.#target.read();

  /**
   * Checks the current target and its ancestors against a selector.
   *
   * @param selector - Browser selector for the target or an ancestor.
   * Text targets are checked through their parent element.
   *
   * @returns Whether a matching element exists; false without element ancestry.
   * @throws If the browser rejects the selector.
   */
  readonly targetHasAncestor = (selector: string): boolean => this.#target.hasAncestor(selector);
}
