import type { BlockDefinition } from "@chulane/rivto";
import type { ReactBlockRegistration } from "./types";

/** Atomic React block-type and presentation registration. */
export interface BlockTypesApi {
  register(registration: ReactBlockRegistration): () => void;
  delete(type: string): boolean;
  /** Reports whether a registered type partitions root block elements. */
  separatesBlockElements(type: string): boolean;
  /** Returns the first separator type registered for automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined;
  /** Returns one registered native block definition. */
  getDefinition(type: string): BlockDefinition | undefined;
  /** Validates and returns native block properties. */
  validateBlockProps(type: string, props: Record<string, unknown>): Record<string, unknown>;
}
