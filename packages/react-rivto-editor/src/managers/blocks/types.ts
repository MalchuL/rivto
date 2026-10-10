/**
 * Shared contracts for React block registration and containment metadata.
 */
import type {
  BlockDefinition,
} from "@chulane/rivto";
import type { SlashCommandContext } from "../slash";
import type { BlockRenderer } from "./renderer-types";
import type { BlockBehavior } from "../../block-behaviors/types";

/** React-owned outline policy stored as opaque core definition metadata. */
export interface BlockContainment {
  /** Whether direct children may change depth through outline interactions. */
  readonly childOutline?: "free" | "fixed";
  /** Whether descendants may be lifted past this block through outline interactions. */
  readonly outlineFloor?: boolean;
}

/** Known React annotations plus metadata owned by other integrations. */
export type ReactBlockDefinitionMetadata = Readonly<{
  containment?: BlockContainment;
} & Record<string, unknown>>;

/** Core definition refined with metadata understood by the React runtime. */
export interface ReactBlockDefinition extends BlockDefinition {
  /** Optional React annotations; unrelated extension metadata is preserved. */
  readonly metadata?: ReactBlockDefinitionMetadata;
}

/**
 * Reads React containment from an otherwise opaque core definition.
 *
 * @param definition - Registered definition, possibly supplied outside React.
 * @returns React outline policy, or `undefined` when none was declared.
 */
export function getBlockContainment(definition: BlockDefinition | undefined): BlockContainment | undefined {
  return definition?.metadata?.containment as BlockContainment | undefined;
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
  /** Framework-neutral definition registered with the core block registry. */
  readonly definition: ReactBlockDefinition;
  /** React content renderer selected by all registered surfaces. */
  readonly render: BlockRenderer;
  /**
   * Keyboard and drag operations for blocks with definition.type.
   *
   * The same instance is used for every block of this type in the document.
   * BlockTypeManager registers it with runtime.blockBehaviors and removes it with
   * this registration. Omit it to use DefaultBlockBehavior; methods returning
   * "default" also delegate to that implementation through the behavior dispatcher.
   */
  readonly behavior?: BlockBehavior;
  /** Optional in-place conversion entry added to the shared slash manager. */
  readonly slashCommand?: ReactBlockSlashCommand;
  /** Whether root blocks of this type partition React's edgeless block elements. */
  readonly separatesBlockElements?: boolean;
}
