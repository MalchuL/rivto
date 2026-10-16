import type { BlockDefinition } from "@chulane/rivto";
import type { SlashCommandContext } from "../slash";
import type { BlockRenderer } from "./renderer-types";
import type { BlockBehavior } from "../../block-behaviors/types";
import type { BlockClipboardConverter } from "../clipboard/types";

/** Opaque runtime annotations interpreted only by their owning integrations. */
export type ReactBlockDefinitionMetadata = Readonly<Record<string, unknown>>;

/** Complete core definition, including annotations supplied by its owning React registration. */
export interface ReactBlockDefinition extends BlockDefinition {
  /** Runtime annotations, conventionally keyed by the owning extension's stable ID. */
  readonly metadata?: ReactBlockDefinitionMetadata;
}

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
  /** Clipboard data conversion and portable formats installed with this type. */
  readonly clipboard?: BlockClipboardConverter;
  /** Complete framework-neutral definition; its native type must be absent from the core registry. */
  readonly definition: ReactBlockDefinition;
  /** React content renderer selected by all registered surfaces. */
  readonly render: BlockRenderer;
  /**
   * Editing and movement integration owned together with this block definition.
   *
   * The same instance is reused for every block selected by isAvailable(context).
   * BlockTypeManager registers it with runtime.blockBehaviors and removes it with
   * this registration. The instance must select its own native types; registration
   * does not add an implicit definition.type guard. Omit it to let other applicable
   * registrations, including DefaultBlockBehavior, handle operations. Methods returning
   * "unhandled" continue to later applicable instances through the behavior dispatcher.
   */
  readonly behavior?: BlockBehavior;
  /** Optional in-place conversion entry added to the shared slash manager. */
  readonly slashCommand?: ReactBlockSlashCommand;
  /** Whether root blocks of this type partition React's edgeless block elements. */
  readonly separatesBlockElements?: boolean;
}
