import { HeldKeys, HeldKeyBinding, KeyboardRuntime } from "@chulane/rivto-keyboard";
import type {
  KeyboardBindingSnapshot,
  KeyboardDefinition,
  KeymapOverrides,
} from "@chulane/rivto-keyboard";
import type { BlockEditorEventsApi } from "../events/block-editor-events";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import { BlockKeyboardEvent } from "./block-keyboard-event";
import { BlockKeyboardTransport } from "./block-keyboard-transport";

/** Page action definition; no editor mode or persisted document metadata. */
export interface BlockKeyboardDefinition extends KeyboardDefinition<BlockKeyboardEvent> {
  readonly target?: "root" | "window";
}

/** Borrowed actions and held-state queries; transport teardown remains controller-owned. */
export type BlockKeyboardApi = Pick<
  BlockKeyboard,
  | "register"
  | "delete"
  | "list"
  | "subscribe"
  | "revision"
  | "replaceKeymap"
  | "setKeymapOverride"
  | "capture"
  | "isHeld"
  | "subscribeHeld"
>;

/** Owns Page keyboard transport and queryable held state with shared keymap inventory. */
export class BlockKeyboard extends KeyboardRuntime<
  BlockKeyboardEvent,
  BlockKeyboardDefinition,
  KeyboardBindingSnapshot
> {
  private readonly held: HeldKeys;
  /**
   * Creates action transport before feature extensions are installed.
   *
   * @param events - Borrowed Page input registration capability.
   * @param owner - Registration lifetime owner.
   * @param keymap - Initial overrides; defaults are supplied by host registrations.
   */
  constructor(
    events: Pick<BlockEditorEventsApi, "register" | "observe" | "onDetach">,
    owner: BlockEditorResourceOwner,
    keymap: KeymapOverrides = {},
  ) {
    const held = new HeldKeys();
    super(new BlockKeyboardTransport(events, held), owner, keymap);
    this.held = held;
  }

  /**
   * Captures effective keys for a gesture without freezing physical state.
   *
   * @param id - Semantic action ID, including an orphan override.
   * @returns Binding snapshot; unknown or disabled actions never match.
   */
  capture(id: string): HeldKeyBinding {
    return new HeldKeyBinding(this.list().find((entry) => entry.id === id)?.keys ?? []);
  }

  /**
   * Tests captured keys against current physical state.
   *
   * @param binding - Configuration captured at gesture start.
   * @returns Whether the captured combination is held now.
   */
  isHeld(binding: HeldKeyBinding): boolean {
    return binding.matches(this.held);
  }

  /**
   * Observes physical state independently of keymap revisions.
   *
   * @param listener - Callback invoked after tracking or reset.
   * @returns Disposer releasing the observer.
   */
  subscribeHeld(listener: () => void): () => void {
    return this.held.subscribe(listener);
  }
}
