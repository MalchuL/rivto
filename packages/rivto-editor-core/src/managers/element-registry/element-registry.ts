import type { ElementDefinition } from "./types";

/** Document-editor-owned definitions; unknown persisted types remain readable and writable. */
export class ElementRegistry {
  private readonly definitions = new Map<string, ElementDefinition>();
  /** @param definition - Unique persisted type and its property rules. @returns Idempotent unregister callback. @throws For empty or duplicate types. */
  register(definition: ElementDefinition): () => void {
    if (!definition.type.trim()) {
      throw new Error("Element type is required");
    }
    if (this.definitions.has(definition.type)) {
      throw new Error(`Element type ${definition.type} is already registered`);
    }
    const entry = { ...definition, defaults: structuredClone(definition.defaults ?? {}) };
    this.definitions.set(entry.type, entry);
    return () => {
      if (this.definitions.get(entry.type) === entry) {
        this.definitions.delete(entry.type);
      }
    };
  }
  /** @param type - Persisted type. @returns Registered rules, or undefined for an unknown type. */
  get(type: string): ElementDefinition | undefined {
    return this.definitions.get(type);
  }
  /** @param type - Persisted type. @param props - Merged properties to validate. @returns Detached defaults and normalized properties. @throws If the definition rejects the properties. */
  validate(type: string, props: Record<string, unknown>): Record<string, unknown> {
    const definition = this.definitions.get(type);
    const merged = structuredClone({ ...definition?.defaults, ...props });
    return definition?.validate ? definition.validate(merged) : merged;
  }
  /** Releases definitions without modifying persisted elements. */
  destroy(): void {
    this.definitions.clear();
  }
}
