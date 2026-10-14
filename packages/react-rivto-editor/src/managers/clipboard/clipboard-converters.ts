import type { RegistrationOwner } from "../extensions/types";
import type { BlockClipboardConverter, ClipboardParsers, ElementClipboardConverter } from "./types";

/** Per-type clipboard registrations shared by a runtime's panels. */
export class ClipboardConverters {
  private readonly blockTypes = new Map<string, BlockClipboardConverter>();
  private readonly elementTypes = new Map<string, ElementClipboardConverter>();
  private readonly parsers: ClipboardParsers[] = [];
  /** Current block registrations; callers cannot change registry membership. */
  get blocks(): ReadonlyMap<string, BlockClipboardConverter> {
    return this.blockTypes;
  }
  /** Current element registrations; callers cannot change registry membership. */
  get elements(): ReadonlyMap<string, ElementClipboardConverter> {
    return this.elementTypes;
  }
  /** Returns parser contributions in registration order across both kinds of type. */
  getParsers(): readonly ClipboardParsers[] {
    return this.parsers;
  }
  /**
   * Binds converter registrations to their cleanup owner.
   *
   * @param registrations - Registration owner providing active-state checks and destruction cleanup.
   */
  constructor(private readonly registrations: RegistrationOwner) {}

  /**
   * Registers one block converter; disposal removes only this registration.
   * @param type - Persisted block type handled by the converter.
   * @param converter - Synchronous clipboard methods for that type.
   * @returns Idempotent disposer also owned by the active extension lifecycle.
   * @throws If the type is empty, already registered, or the owner is destroyed.
   */
  registerBlock(type: string, converter: BlockClipboardConverter): () => void {
    return this.register(this.blockTypes, type, converter);
  }
  /**
   * Registers one element converter; disposal removes only this registration.
   * @param type - Persisted canvas element type handled by the converter.
   * @param converter - Synchronous clipboard methods for that type.
   * @returns Idempotent disposer also owned by the active extension lifecycle.
   * @throws If the type is empty, already registered, or the owner is destroyed.
   */
  registerElement(type: string, converter: ElementClipboardConverter): () => void {
    return this.register(this.elementTypes, type, converter);
  }
  /**
   * Registers a typed converter and adds it to parser order under the registration owner.
   *
   * @param map - Type-indexed converter registry to update.
   * @param type - Native event or registered editor type name.
   * @param converter - Clipboard converter to register for the type.
   * @returns Cleanup that removes only this registration.
   * @throws If the owner is inactive, the type is blank, or the type is already registered.
   */
  private register<T extends ClipboardParsers>(
    map: Map<string, T>,
    type: string,
    converter: T,
  ): () => void {
    this.registrations.assertActive();
    if (!type.trim() || map.has(type)) {
      throw new Error(`Clipboard converter ${type || "<empty>"} is already registered`);
    }
    map.set(type, converter);
    this.parsers.push(converter);
    return this.registrations.registerCleanup(() => {
      if (map.get(type) !== converter) {
        return;
      }
      map.delete(type);
      const index = this.parsers.indexOf(converter);
      if (index >= 0) {
        this.parsers.splice(index, 1);
      }
    });
  }
}
