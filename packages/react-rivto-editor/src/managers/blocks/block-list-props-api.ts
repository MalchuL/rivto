import type { BlockListPropsManagerApi } from "@chulane/rivto";

/** Core list-property policy whose registrations are owned by the active React extension. */
export type BlockListPropsRegistration = Parameters<BlockListPropsManagerApi["register"]>[0];

/** Core property defaults and validation owned by the active React extension. */
export interface BlockListPropsApi extends Omit<BlockListPropsManagerApi, "register"> {
  /** Registers property defaults and validation; returns their owned cleanup. */
  register(registration: BlockListPropsRegistration): () => void;
  /** Releases this React manager's registrations; caller-owned core policies remain installed.
   * @returns No value after removing owned property defaults and validation. */
  destroy(): void;
}
