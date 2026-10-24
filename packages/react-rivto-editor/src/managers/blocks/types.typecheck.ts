/** Compile-time metadata checks included in the package's normal TypeScript validation. */
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
