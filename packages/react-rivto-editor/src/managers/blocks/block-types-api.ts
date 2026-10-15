import type { BlockDragOptions } from "../../extensions/block-drag/block-drag-options";
import type { BlockDefinition } from "@chulane/rivto";
import type { ReactBlockRegistration } from "./types";

/** Atomic React block-type and presentation registration. */
export interface BlockTypesApi {
  /**
   * Registers a block definition with its React presentation and optional interaction behavior.
   *
   * @param registration - Block definition, renderer, and optional React integrations to register.
   * @returns A function that unregisters the owned block registration.
   */
  register(registration: ReactBlockRegistration): () => void;
  /**
   * Unregisters the React block integration and releases the resources owned by that registration.
   *
   * @param type - Persisted block type registered through this manager.
   * @returns Whether a registration was removed.
   */
  delete(type: string): boolean;
  /**
   * Reads optional page-drag geometry without enabling dragging.
   * @param type - Persisted native block type.
   * @returns Registered geometry, or undefined when the type has no drag options.
   */
  getDragOptions(type: string): BlockDragOptions | undefined;
  /** Reports whether a registered type partitions root block elements. */
  separatesBlockElements(type: string): boolean;
  /** Returns the first separator type registered for automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined;
  /** Returns one registered native block definition. */
  getDefinition(type: string): BlockDefinition | undefined;
  /** Validates and returns native block properties. */
  validateBlockProps(type: string, props: Record<string, unknown>): Record<string, unknown>;
}
