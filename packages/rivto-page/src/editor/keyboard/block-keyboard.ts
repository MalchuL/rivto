import { getBrowserPrimaryModifier } from "@chulane/rivto-root/browser";
import { HeldKeys, HeldKeyBinding, KeyboardRuntime } from "@chulane/rivto-root";
import type { KeyboardBindingSnapshot, KeymapOverrides } from "@chulane/rivto-root";
import type { BlockEditorEventsApi } from "../events/types";
import type { BlockEditorResourceOwner } from "../extensions/block-editor-resource-owner";
import type { BlockKeyboardDefinition } from "./types";
import { BlockKeyboardEvent } from "./block-keyboard-event";
import { BlockKeyboardTransport } from "./block-keyboard-transport";

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
    const held = new HeldKeys(getBrowserPrimaryModifier());
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
    return new HeldKeyBinding(
      this.list().find((entry) => entry.id === id)?.keys ?? [],
      this.held.primaryModifier,
    );
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
