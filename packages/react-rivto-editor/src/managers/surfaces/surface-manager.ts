import type { EditorMode } from "@chulane/rivto";
import type { ComponentType } from "react";
import type { BlockWrapperComponent } from "../../blocks/block-wrapper/block-wrapper";
import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../extensions/types";
import type { SurfacesApi } from "./api";
import type {
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  BlockWrapperRegistration,
  EditorWrapper,
  EditorWrapperRegistration,
  ElementSlotProps,
  ElementSlotRegistration,
  ResolvedSlot,
  SlotPosition,
  SurfaceComponent,
} from "./types";
import { BLOCK_FLOW_SLOT_POSITIONS, SLOT_POSITIONS } from "./types";

const SLOT_POSITION_SET = new Set<SlotPosition>(SLOT_POSITIONS);
const BLOCK_SLOT_POSITION_SET = new Set<BlockSlotPosition>([
  ...SLOT_POSITIONS,
  ...BLOCK_FLOW_SLOT_POSITIONS,
  // Below the block's main row, before its own children; used for the embedded source view.
  "body",
]);

/**
 * Owns mode-specific surface composition.
 *
 * Root surfaces, per-block decorators, and editor-wide wrappers share this
 * manager because EditorPanel resolves all three from the active mode. Plugins
 * remain independent: they call this public manager but ExtensionManager never
 * imports or queries it.
 */
export class SurfaceManager implements SurfacesApi {
  private readonly store = new RevisionStore();
  private readonly surfaces = new Map<
    EditorMode,
    {
      readonly surface: SurfaceComponent;
      dispose: () => void;
    }
  >();
  private readonly blockWrappers = new Map<EditorMode, BlockWrapperRegistration[]>();
  private readonly editorWrappers: EditorWrapperRegistration[] = [];
  private readonly blockSlots: Array<BlockSlotRegistration & { readonly id: number }> = [];
  private readonly elementSlots: Array<ElementSlotRegistration & { readonly id: number }> = [];
  private nextSlotId = 0;

  /**
   * Creates empty presentation registries.
   *
   * @param registrations - Extension lifecycle owning registered contributions.
   */
  constructor(private readonly registrations: RegistrationOwner) {}

  /**
   * Registers the single root renderer for one editor mode.
   *
   * @param mode - Presentation mode resolved by EditorPanel.
   * @param surface - Component rendering the complete active surface.
   * @returns Idempotent disposer removing only this registration.
   */
  register(mode: EditorMode, surface: SurfaceComponent): () => void {
    this.registrations.assertActive();
    if (this.surfaces.has(mode)) {
      throw new Error(`Surface ${mode} is already registered`);
    }
    const registration: {
      readonly surface: SurfaceComponent;
      dispose: () => void;
    } = {
      surface,
      dispose: () => undefined,
    };
    this.surfaces.set(mode, registration);
    this.store.changed();
    registration.dispose = this.registrations.registerCleanup(() => {
      if (this.surfaces.get(mode) !== registration) {
        return;
      }
      this.surfaces.delete(mode);
      this.store.changed();
    });
    return registration.dispose;
  }

  /**
   * Deletes the root surface registered for one mode.
   *
   * @param mode - Presentation mode whose root renderer is removed.
   * @returns True when a surface existed and was disposed.
   */
  delete(mode: EditorMode): boolean {
    this.registrations.assertActive();
    const registration = this.surfaces.get(mode);
    if (!registration) {
      return false;
    }
    registration.dispose();
    return true;
  }

  /** @param mode - Presentation mode to resolve. */
  get(mode: EditorMode): SurfaceComponent | undefined {
    return this.surfaces.get(mode)?.surface;
  }

  /**
   * Appends a block decorator for one mode.
   *
   * Registration identity, not component identity, permits intentionally
   * registering the same wrapper more than once.
   *
   * @param mode - Surface mode whose recursively rendered blocks are decorated.
   * @param wrapper - Decorator receiving block metadata and the next layer.
   * @returns Idempotent disposer for this exact ordered entry.
   */
  registerBlockWrapper(mode: EditorMode, wrapper: BlockWrapperComponent): () => void {
    this.registrations.assertActive();
    const wrappers = this.blockWrappers.get(mode) ?? [];
    const registration = Object.freeze({ wrapper });
    wrappers.push(registration);
    this.blockWrappers.set(mode, wrappers);
    const dispose = this.registrations.registerCleanup(() => {
      const current = this.blockWrappers.get(mode);
      if (!current) {
        return;
      }
      const index = current.indexOf(registration);
      if (index < 0) {
        return;
      }
      current.splice(index, 1);
      if (current.length) {
        this.blockWrappers.set(mode, current);
      } else {
        this.blockWrappers.delete(mode);
      }
      this.store.changed();
    });
    try {
      this.store.changed();
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Block wrapper publication and rollback failed",
        );
      }
      throw error;
    }
    return dispose;
  }

  /**
   * Returns a defensive ordered block-wrapper list for one mode.
   *
   * @param mode - Mode whose recursive block decorator chain is requested.
   */
  getBlockWrappers(mode: EditorMode): readonly BlockWrapperComponent[] {
    return (this.blockWrappers.get(mode) ?? []).map(({ wrapper }) => wrapper);
  }

  /**
   * Reads decorator entries without losing their individual registration identities.
   *
   * @param mode - Surface mode whose ordered decorators are requested.
   * @returns Defensive list of immutable entries, including repeated components.
   */
  getBlockWrapperRegistrations(mode: EditorMode): readonly Readonly<BlockWrapperRegistration>[] {
    return [...(this.blockWrappers.get(mode) ?? [])];
  }

  /**
   * Registers one priority-ordered component at a block-row or body anchor.
   *
   * @param registration - Component, anchor, ordering, and optional filters.
   * @returns Idempotent disposer removing this exact contribution.
   */
  registerBlockSlot(registration: BlockSlotRegistration): () => void {
    this.validateSlotRegistration(
      registration.position,
      registration.priority,
      BLOCK_SLOT_POSITION_SET,
    );
    const entry = Object.freeze({ ...registration, id: this.nextSlotId++ });
    this.blockSlots.push(entry);
    this.blockSlots.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
    const dispose = this.registrations.registerCleanup(() => {
      const index = this.blockSlots.indexOf(entry);
      if (index < 0) {
        return;
      }
      this.blockSlots.splice(index, 1);
      this.store.changed();
    });
    try {
      this.store.changed();
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Block slot publication and rollback failed",
        );
      }
      throw error;
    }
    return dispose;
  }

  /**
   * Resolves matching block-slot components from nearest to farthest.
   *
   * @param position - Perimeter, row-flow, or below-row body anchor being rendered.
   * @param props - Current block presentation context.
   * @returns Defensive ordered component list.
   */
  getBlockSlots(
    position: BlockSlotPosition,
    props: BlockSlotProps,
  ): readonly ComponentType<BlockSlotProps>[] {
    return this.getBlockSlotEntries(position, props).map(({ component }) => component);
  }

  /**
   * Reads installed block contributions before owner-specific filtering.
   *
   * Entry identity survives adjacent registrations so occurrence adapters retain
   * mounted components when unrelated extensions change.
   *
   * @returns A defensive priority-ordered list of immutable installed entries.
   */
  getBlockSlotRegistrations(): readonly Readonly<BlockSlotRegistration>[] {
    return [...this.blockSlots];
  }

  /**
   * Registers one priority-ordered component at a canvas-element perimeter anchor.
   *
   * @param registration - Component, anchor, ordering, and optional filters.
   * @returns Idempotent disposer removing this exact contribution.
   */
  registerElementSlot(registration: ElementSlotRegistration): () => void {
    this.validateSlotRegistration(registration.position, registration.priority, SLOT_POSITION_SET);
    const entry = { ...registration, id: this.nextSlotId++ };
    this.elementSlots.push(entry);
    this.elementSlots.sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
    this.store.changed();
    return this.registrations.registerCleanup(() => {
      const index = this.elementSlots.indexOf(entry);
      if (index < 0) {
        return;
      }
      this.elementSlots.splice(index, 1);
      this.store.changed();
    });
  }

  /**
   * Resolves matching element-slot components from nearest to farthest.
   *
   * @param position - Perimeter anchor being rendered.
   * @param props - Current element presentation context.
   * @returns Defensive ordered component list.
   */
  getElementSlots(
    position: SlotPosition,
    props: ElementSlotProps,
  ): readonly ComponentType<ElementSlotProps>[] {
    return this.getElementSlotEntries(position, props).map(({ component }) => component);
  }

  /**
   * Resolves ordered block slots while preserving each registration's React identity.
   * @param position - Anchor being rendered.
   * @param props - Current owner context, evaluated against each dynamic filter.
   * @returns Matching entries with IDs unchanged by neighboring registrations.
   */
  getBlockSlotEntries(
    position: BlockSlotPosition,
    props: BlockSlotProps,
  ): readonly ResolvedSlot<BlockSlotProps>[] {
    return this.resolveSlots(this.blockSlots, position, props);
  }

  /**
   * Resolves ordered element slots while preserving each registration's React identity.
   * @param position - Anchor being rendered.
   * @param props - Current owner context, evaluated against each dynamic filter.
   * @returns Matching entries with IDs unchanged by neighboring registrations.
   */
  getElementSlotEntries(
    position: SlotPosition,
    props: ElementSlotProps,
  ): readonly ResolvedSlot<ElementSlotProps>[] {
    return this.resolveSlots(this.elementSlots, position, props);
  }

  /**
   * Registers an editor-wide wrapper with optional surface-mode restriction.
   *
   * The first active wrapper remains outermost when EditorPanel composes them.
   *
   * @param wrapper - Context or interaction boundary around complete editor UI.
   * @param mode - Optional mode or mode list restricting composition.
   * @returns Idempotent disposer for this exact ordered entry.
   */
  registerEditorWrapper(
    wrapper: EditorWrapper,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void {
    this.registrations.assertActive();
    const registration = { wrapper, mode };
    this.editorWrappers.push(registration);
    this.store.changed();
    return this.registrations.registerCleanup(() => {
      const index = this.editorWrappers.indexOf(registration);
      if (index < 0) {
        return;
      }
      this.editorWrappers.splice(index, 1);
      this.store.changed();
    });
  }

  /**
   * Returns active editor wrappers from outermost to innermost.
   *
   * @param mode - Current mode used to filter restricted registrations.
   */
  getEditorWrappers(mode: EditorMode): EditorWrapper[] {
    return this.editorWrappers
      .filter((registration) => matchesMode(registration.mode, mode))
      .map((registration) => registration.wrapper);
  }

  /**
   * Reads the surface registry's observable revision.
   *
   * @returns Current revision number.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Observes surface and wrapper registration changes.
   *
   * @param listener - Callback invoked when the observed state changes.
   * @returns A function that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /** Validates the shared public fields of a slot registration. */
  private validateSlotRegistration<Position extends string>(
    position: Position,
    priority: number | undefined,
    positions: ReadonlySet<Position>,
  ): void {
    this.registrations.assertActive();
    if (!positions.has(position)) {
      throw new Error(`Unsupported slot position ${position}`);
    }
    if (priority !== undefined && !Number.isFinite(priority)) {
      throw new Error("Slot priority must be finite");
    }
  }

  /** Filters one owner-kind list whose stable priority order is maintained during registration. */
  private resolveSlots<
    Props extends { readonly mode: EditorMode },
    Position extends string,
    Registration extends {
      readonly position: Position;
      readonly priority?: number;
      readonly mode?: EditorMode | readonly EditorMode[];
      readonly when?: (props: Props) => boolean;
    },
  >(registrations: readonly Registration[], position: Position, props: Props): Registration[] {
    return registrations.filter(
      (registration) =>
        registration.position === position &&
        matchesMode(registration.mode, props.mode) &&
        (!registration.when || registration.when(props)),
    );
  }
}

/** Returns whether an optional mode restriction includes the active mode. */
function matchesMode(
  modes: EditorMode | readonly EditorMode[] | undefined,
  mode: EditorMode,
): boolean {
  return !modes || (Array.isArray(modes) ? modes.includes(mode) : modes === mode);
}
