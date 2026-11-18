/** Compile-time metadata checks included in the package's normal TypeScript validation. */
import type { BlockStructuralContext } from "@chulane/rivto";
import type { BlockBehaviorContext } from "../../block-behaviors/types";
import type { KeyboardSelectionTarget } from "../keyboard";
import type { BlockBehaviorsApi } from "./block-behaviors-api";
import type { ReactBlockDefinitionMetadata } from "./types";
import type { BLOCK_TEXT_METADATA_KEY } from "../selection/block-text-metadata";

/** Requires fixture annotations to satisfy the metadata registration contract. */
type Metadata<Value extends ReactBlockDefinitionMetadata> = Value;

/** Known extension namespaces are optional. */
export type EmptyMetadata = Metadata<Record<string, never>>;

/** The current selectable-text annotation is accepted. */
export type KnownMetadata = Metadata<{
  [BLOCK_TEXT_METADATA_KEY]: true;
}>;

/** Additional namespaces retain arbitrary opaque runtime values. */
export type CustomMetadata = Metadata<{
  "custom.extension": { values: Map<string, unknown>; callback: () => void };
}>;

/** Known selectable-text annotations reject non-boolean values. */
export type InvalidTextMetadata = Metadata<
  // @ts-expect-error Selectable text accepts a boolean annotation.
  { [BLOCK_TEXT_METADATA_KEY]: "yes" }
>;

/**
 * Checks the argument pairs accepted by the public dispatch overloads during type checking.
 *
 * @param registry - Public behavior dispatch API under test.
 * @param keyboard - Context captured by a keyboard interaction.
 * @param structural - Scoped context supplied to a structural hook.
 * @param target - Captured keyboard selection target.
 * @param ids - Ordered block group for a structural hook.
 * @returns The fixture is compiled without being invoked.
 */
export function checkDispatchOverloads(
  registry: BlockBehaviorsApi,
  keyboard: BlockBehaviorContext,
  structural: BlockStructuralContext,
  target: KeyboardSelectionTarget,
  ids: readonly string[],
): void {
  registry.dispatch("onSplit", keyboard, target);
  registry.dispatch("onIndent", structural, ids);
  // @ts-expect-error A structural action requires its scoped block context.
  registry.dispatch("onIndent", keyboard, ids);
  // @ts-expect-error A keyboard action requires a captured keyboard target.
  registry.dispatch("onSplit", keyboard, ids);
  // @ts-expect-error Keyboard hooks cannot receive a structural context.
  registry.dispatch("onSplit", structural, target);
  // @ts-expect-error A structural hook receives the complete group of block IDs.
  registry.dispatch("onIndent", structural, target);
}
