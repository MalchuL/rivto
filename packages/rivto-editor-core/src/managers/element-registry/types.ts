import type { EditorElementFrame, EditorElementNode } from "../../editor/model";

/** Persisted element properties and optional type-specific geometry behavior. */
export interface ElementDefinition {
  readonly type: string;
  readonly defaults?: Readonly<Record<string, unknown>>;
  /** Validates and normalizes merged properties; throw before mutation on invalid input. */
  readonly validate?: (props: Record<string, unknown>) => Record<string, unknown>;
  /** Returns property changes needed for an explicit frame update, such as scaled drawing points. */
  readonly resize?: (
    element: EditorElementNode,
    frame: EditorElementFrame,
  ) => Record<string, unknown>;
}

/** Definition lookup and property normalization needed by canvas commands. */
export interface ElementPropertyRegistry {
  /**
   * Looks up rules for a stored element type.
   *
   * @param type - Persisted type discriminator.
   * @returns The registered definition, or undefined for an unknown type.
   */
  get(type: string): ElementDefinition | undefined;
  /**
   * Merges registered defaults into a detached property record and applies validation.
   *
   * @param type - Persisted type discriminator.
   * @param props - Values supplied by the command.
   * @returns Normalized properties, or a detached copy for an unknown type.
   * @throws If copying or type-specific validation fails.
   */
  validate(type: string, props: Record<string, unknown>): Record<string, unknown>;
}

/** Editor-local registration and lookup of element definitions. */
export interface ElementRegistryApi extends ElementPropertyRegistry {
  /**
   * Installs a definition for a unique type for the lifetime of its registration.
   *
   * @param definition - Persisted type, default properties, and optional validation.
   * @returns Idempotent disposer for this registration.
   * @throws If the type is empty or already registered.
   */
  register(definition: ElementDefinition): () => void;
}
