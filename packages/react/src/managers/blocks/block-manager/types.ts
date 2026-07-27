import type {
  BlockDefinition,
  SlashCommandContext,
} from "@chulane/rivto";
import type { BlockRenderer } from "../renderer-manager";

/** Optional slash conversion installed with a React block registration. */
export interface ReactBlockSlashCommand {
  /** Stable command ID; defaults to `type.<block type>`. */
  readonly id?: string;
  /** User-visible command label. */
  readonly title: string;
  /** Optional menu group used by the slash popup. */
  readonly group?: string;
  /** Alternative normalized search terms. */
  readonly keywords?: readonly string[];
  /** Additional contextual condition evaluated after type eligibility. */
  readonly isAvailable?: (context: SlashCommandContext) => boolean;
}

/** Atomic model, renderer, and conversion registration for one block type. */
export interface ReactBlockRegistration {
  /** Framework-neutral definition registered with the core block registry. */
  readonly definition: BlockDefinition;
  /** React content renderer selected by all registered surfaces. */
  readonly render: BlockRenderer;
  /** Optional in-place conversion entry added to the shared slash manager. */
  readonly slashCommand?: ReactBlockSlashCommand;
}
