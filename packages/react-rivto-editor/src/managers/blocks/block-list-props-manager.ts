import type { BlockListPropsManagerApi, EditorBlock, EditorBlockNode } from "@chulane/rivto";
import type { BlockListPropsCapability, BlockListPropsRegistration } from "../../capabilities";
import type { EditorRuntime } from "../../editor-runtime";
import type { BlockViewContext } from "../../views/types";

/** Owns React list behavior while the core manager validates persisted properties. */
export class BlockListPropsManager implements BlockListPropsCapability {
  private readonly registrations = new Set<BlockListPropsRegistration>();

  /** @param editor - Extension lifecycle owner. @param core - Existing property validation manager. */
  constructor(private readonly editor: EditorRuntime, private readonly core: BlockListPropsManagerApi) {}

  /**
   * Registers property validation and optional outline behavior as one owned resource.
   * @param registration - Defaults, validation, and optional rendering/split callbacks.
   * @returns Idempotent cleanup removing both validation and behavior.
   * @throws When the core rejects a duplicate or invalid registration.
   */
  register(registration: BlockListPropsRegistration): () => void {
    this.editor.extensions.assertActive();
    const release = this.core.register({ id: registration.id, defaults: registration.defaults, isValid: registration.isValid });
    this.registrations.add(registration);
    return this.editor.extensions.own(() => {
      this.registrations.delete(registration);
      release();
    });
  }

  /** @param id - Property registration identity. @returns Whether it is installed. */
  has(id: string): boolean { return this.core.has(id); }
  /** @param candidate - Properties to validate. @returns The core validation result. */
  validate(candidate: Parameters<BlockListPropsManagerApi["validate"]>[0]): ReturnType<BlockListPropsManagerApi["validate"]> {
    return this.core.validate(candidate);
  }
  /** @param candidate - Properties to merge with active defaults. @returns Prepared core properties. */
  prepare(candidate: Parameters<BlockListPropsManagerApi["prepare"]>[0]): ReturnType<BlockListPropsManagerApi["prepare"]> {
    return this.core.prepare(candidate);
  }

  /** @param block - Source of a text split. @returns Inherited properties, or undefined to retain writing defaults. */
  prepareSplit(block: EditorBlock): Record<string, unknown> | undefined {
    let properties: Record<string, unknown> | undefined;
    for (const registration of this.registrations) {
      if (registration.prepareSplit) properties = { ...properties, ...registration.prepareSplit(block) };
    }
    return properties;
  }

  /** @param context - Current block and view. @returns True when an extension handled the split. */
  onSplit(context: BlockViewContext): boolean {
    for (const registration of this.registrations) {
      if (registration.onSplit?.(context)) return true;
    }
    return false;
  }

  /** @param block - Block properties being rendered or traversed. @returns Whether every installed behavior permits its children. */
  childrenVisible(block: Pick<EditorBlockNode, "listProps">): boolean {
    for (const registration of this.registrations) {
      if (registration.childrenVisible?.(block) === false) return false;
    }
    return true;
  }
}
