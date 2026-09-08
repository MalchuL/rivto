/** Block-local context supplied when listing or executing a slash command. */
export interface SlashCommandContext {
  /** Stable ID of the block containing the command trigger. */
  readonly blockId: string;
}

/** One application-provided action available to a slash-command surface. */
export interface SlashCommand {
  /** Stable registration and execution ID. */
  readonly id: string;
  /** Human-readable menu label. */
  readonly title: string;
  /** Optional menu section label. */
  readonly group?: string;
  /** Additional terms considered by slash-command search. */
  readonly keywords?: readonly string[];
  /** Hides commands that are not meaningful for the current block. */
  readonly isAvailable?: (context: SlashCommandContext) => boolean;
  /** Performs the command for the current block. */
  readonly execute: (context: SlashCommandContext) => void;
}

/** Listener notified when the slash-command revision changes. */
export type SlashCommandRevisionListener = () => void;
