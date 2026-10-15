import type { BlockDragOptions } from "../../extensions/block-drag/block-drag-options";
import type { BlockDefinition } from "@chulane/rivto";
import type { SlashCommandContext } from "../slash";
import type { BlockRenderer } from "./renderer-types";
import type { BlockBehavior } from "../../block-behaviors/types";
import type { BlockClipboardConverter } from "../clipboard/types";

/** React-owned outline policy stored as opaque core definition metadata. */
export interface BlockContainment {
  /** Whether direct children may change depth through outline interactions. */
  readonly childOutline?: "free" | "fixed";
  /** Whether descendants may be lifted past this block through outline interactions. */
  readonly outlineFloor?: boolean;
}

/** Known React annotations plus metadata owned by other integrations. */
export type ReactBlockDefinitionMetadata = Readonly<
  {
    containment?: BlockContainment;
  } & Record<string, unknown>
>;

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
export function getBlockContainment(
  definition: BlockDefinition | undefined,
): BlockContainment | undefined {
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
  /** Clipboard data conversion and portable formats installed with this type. */
  readonly clipboard?: BlockClipboardConverter;
  /** Framework-neutral definition registered with the core block registry. */
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
   * "default" continue to later applicable instances through the behavior dispatcher.
   */
  readonly behavior?: BlockBehavior;
  /** Optional geometry consumed only when the page-drag extension is installed. */
  readonly drag?: BlockDragOptions;
  /** Optional in-place conversion entry added to the shared slash manager. */
  readonly slashCommand?: ReactBlockSlashCommand;
  /** Whether root blocks of this type partition React's edgeless block elements. */
  readonly separatesBlockElements?: boolean;
}
