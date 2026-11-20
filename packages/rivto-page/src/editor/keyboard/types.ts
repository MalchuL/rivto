import type { KeyboardDefinition } from "@chulane/rivto-root";
import type { BlockKeyboard } from "./block-keyboard";
import type { BlockKeyboardEvent } from "./block-keyboard-event";

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
