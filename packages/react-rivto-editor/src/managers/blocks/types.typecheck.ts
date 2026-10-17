/** Compile-time metadata checks included in the package's normal TypeScript validation. */
import type { ReactBlockDefinitionMetadata } from "./types";
import type { PAGE_DRAG_METADATA_KEY } from "../../extensions/block-drag/block-drag-options";
import type { BLOCK_HANDLE_METADATA_KEY } from "../../extensions/built-ins/block-handle/metadata";

/** Requires fixture annotations to satisfy the metadata registration contract. */
type Metadata<Value extends ReactBlockDefinitionMetadata> = Value;

/** Known extension namespaces are optional. */
export type EmptyMetadata = Metadata<Record<string, never>>;

/** Every currently supported drag and handle parameter is accepted. */
export type KnownMetadata = Metadata<{
  [PAGE_DRAG_METADATA_KEY]: {
    dropAxis: "horizontal";
    dropPlacement: { allowChildPlacement: false };
    acceptsDropContainer: true;
    fixed: true;
  };
  [BLOCK_HANDLE_METADATA_KEY]: { showOnContainerHover: true };
}>;

/** Additional namespaces retain arbitrary opaque runtime values. */
export type CustomMetadata = Metadata<{
  [PAGE_DRAG_METADATA_KEY]: { dropAxis: "grid" };
  "custom.extension": { values: Map<string, unknown>; callback: () => void };
}>;

/** Known drag axes reject unsupported values. */
export type InvalidAxis = Metadata<
  // @ts-expect-error The drag axis must be vertical, horizontal, or grid.
  { [PAGE_DRAG_METADATA_KEY]: { dropAxis: "diagonal" } }
>;

/** Known geometry flags reject non-boolean values. */
export type InvalidFixed = Metadata<
  // @ts-expect-error Fixed sorting is a boolean option.
  { [PAGE_DRAG_METADATA_KEY]: { fixed: "yes" } }
>;

/** Nested placement options are checked through the known namespace. */
export type InvalidChildPlacement = Metadata<
  // @ts-expect-error Child placement accepts a boolean option.
  { [PAGE_DRAG_METADATA_KEY]: { dropPlacement: { allowChildPlacement: "yes" } } }
>;

/** Known handle presentation flags reject non-boolean values. */
export type InvalidHandleHover = Metadata<
  // @ts-expect-error Container hover accepts a boolean option.
  { [BLOCK_HANDLE_METADATA_KEY]: { showOnContainerHover: "yes" } }
>;
