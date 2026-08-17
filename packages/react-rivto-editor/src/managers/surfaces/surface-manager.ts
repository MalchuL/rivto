import type { EditorMode } from "@chulane/rivto";
import type { ComponentType } from "react";
import type { BlockWrapperComponent } from "../../blocks/block-wrapper";
import type { SurfacesCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import { RevisionStore } from "../../internal-store";
import type {
  BlockWrapperRegistration,
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  EditorWrapper,
  EditorWrapperRegistration,
  ElementSlotProps,
  ElementSlotRegistration,
  SlotPosition,
  SurfaceComponent,
} from "./types";
import { BLOCK_FLOW_SLOT_POSITIONS, SLOT_POSITIONS } from "./types";

const SLOT_POSITION_SET = new Set<SlotPosition>(SLOT_POSITIONS);
const BLOCK_SLOT_POSITION_SET = new Set<BlockSlotPosition>([
  ...SLOT_POSITIONS,
  ...BLOCK_FLOW_SLOT_POSITIONS,
]);

/**
 * Owns mode-specific surface composition.
 *
 * Root surfaces, per-block decorators, and editor-wide wrappers share this
 * manager because EditorView resolves all three from the active mode. Plugins
 * remain independent: they call this public manager but ExtensionManager never
 * imports or queries it.
 */
export class SurfaceManager implements SurfacesCapability {
  private readonly store = new RevisionStore();
  private readonly surfaces = new Map<EditorMode, {
    readonly surface: SurfaceComponent;
    dispose: () => void;
  }>();
  private readonly blockWrappers = new Map<EditorMode, BlockWrapperRegistration[]>();
  private readonly editorWrappers: EditorWrapperRegistration[] = [];
  private readonly blockSlots: BlockSlotRegistration[] = [];
  private readonly elementSlots: ElementSlotRegistration[] = [];

  /**
   * Creates empty presentation registries.
   *
   * @param reactEditor - Complete owning runtime used for lifecycle ownership
   * and React invalidation.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Registers the single root renderer for one editor mode.
   *
   * @param mode - Presentation mode resolved by EditorView.
   * @param surface - Component rendering the complete active surface.
   * @returns Idempotent disposer removing only this registration.
   */
  register(mode: EditorMode, surface: SurfaceComponent): () => void {
    this.reactEditor.extensions.assertActive();
    if (this.surfaces.has(mode)) throw new Error(`Surface ${mode} is already registered`);
    const registration: {
      readonly surface: SurfaceComponent;
      dispose: () => void;
    } = {
      surface,
      dispose: () => undefined,
    };
    this.surfaces.set(mode, registration);
    this.store.changed();
    registration.dispose = this.reactEditor.extensions.own(() => {
      if (this.surfaces.get(mode) !== registration) return;
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
    this.reactEditor.extensions.assertActive();
    const registration = this.surfaces.get(mode);
    if (!registration) return false;
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
  registerBlockWrapper(
    mode: EditorMode,
    wrapper: BlockWrapperComponent,
  ): () => void {
    this.reactEditor.extensions.assertActive();
    const wrappers = this.blockWrappers.get(mode) ?? [];
    const registration = { wrapper };
    wrappers.push(registration);
    this.blockWrappers.set(mode, wrappers);
    this.store.changed();
    return this.reactEditor.extensions.own(() => {
      const current = this.blockWrappers.get(mode);
      if (!current) return;
      const index = current.indexOf(registration);
      if (index < 0) return;
      current.splice(index, 1);
      if (current.length) this.blockWrappers.set(mode, current);
      else this.blockWrappers.delete(mode);
      this.store.changed();
    });
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
   * Registers one priority-ordered component at a block-row anchor.
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
    this.blockSlots.push(registration);
    this.store.changed();
    return this.reactEditor.extensions.own(() => {
      const index = this.blockSlots.indexOf(registration);
      if (index < 0) return;
      this.blockSlots.splice(index, 1);
      this.store.changed();
    });
  }

  /**
   * Resolves matching block-slot components from nearest to farthest.
   *
   * @param position - Perimeter or in-flow anchor being rendered.
   * @param props - Current block presentation context.
   * @returns Defensive ordered component list.
   */
  getBlockSlots(
    position: BlockSlotPosition,
    props: BlockSlotProps,
  ): readonly ComponentType<BlockSlotProps>[] {
    return this.resolveSlots(this.blockSlots, position, props).map(({ component }) => component);
  }

  /**
   * Registers one priority-ordered component at a canvas-element perimeter anchor.
   *
   * @param registration - Component, anchor, ordering, and optional filters.
   * @returns Idempotent disposer removing this exact contribution.
   */
  registerElementSlot(registration: ElementSlotRegistration): () => void {
    this.validateSlotRegistration(
      registration.position,
      registration.priority,
      SLOT_POSITION_SET,
    );
    this.elementSlots.push(registration);
    this.store.changed();
    return this.reactEditor.extensions.own(() => {
      const index = this.elementSlots.indexOf(registration);
      if (index < 0) return;
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
    return this.resolveSlots(this.elementSlots, position, props).map(({ component }) => component);
  }

  /** Validates the shared public fields of a slot registration. */
  private validateSlotRegistration<Position extends string>(
    position: Position,
    priority: number | undefined,
    positions: ReadonlySet<Position>,
  ): void {
    this.reactEditor.extensions.assertActive();
    if (!positions.has(position)) throw new Error(`Unsupported slot position ${position}`);
    if (priority !== undefined && !Number.isFinite(priority)) {
      throw new Error("Slot priority must be finite");
    }
  }

  /** Filters and stably orders one owner-kind registration list. */
  private resolveSlots<
    Props extends { readonly mode: EditorMode },
    Position extends string,
    Registration extends {
      readonly position: Position;
      readonly priority?: number;
      readonly mode?: EditorMode | readonly EditorMode[];
      readonly when?: (props: Props) => boolean;
    },
  >(
    registrations: readonly Registration[],
    position: Position,
    props: Props,
  ): Registration[] {
    return registrations
      .filter((registration) => registration.position === position &&
        matchesMode(registration.mode, props.mode) &&
        (!registration.when || registration.when(props)))
      .sort((left, right) => (right.priority ?? 0) - (left.priority ?? 0));
  }

  /**
   * Registers an editor-wide wrapper with optional surface-mode restriction.
   *
   * The first active wrapper remains outermost when EditorView composes them.
   *
   * @param wrapper - Context or interaction boundary around complete editor UI.
   * @param mode - Optional mode or mode list restricting composition.
   * @returns Idempotent disposer for this exact ordered entry.
   */
  registerEditorWrapper(
    wrapper: EditorWrapper,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void {
    this.reactEditor.extensions.assertActive();
    const registration = { wrapper, mode };
    this.editorWrappers.push(registration);
    this.store.changed();
    return this.reactEditor.extensions.own(() => {
      const index = this.editorWrappers.indexOf(registration);
      if (index < 0) return;
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

  get revision(): number {
    return this.store.revision;
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
}

/** Returns whether an optional mode restriction includes the active mode. */
function matchesMode(
  modes: EditorMode | readonly EditorMode[] | undefined,
  mode: EditorMode,
): boolean {
  return !modes || (Array.isArray(modes) ? modes.includes(mode) : modes === mode);
}
