import type { EditorMode } from "@chulane/rivto";
import type { BlockWrapperComponent } from "../../../blocks/block-wrapper";
import type { ReactEditor } from "../../../react-editor";
import type {
  BlockWrapperRegistration,
  EditorWrapper,
  EditorWrapperRegistration,
  SurfaceComponent,
} from "./types";

/**
 * Owns mode-specific surface composition.
 *
 * Root surfaces, per-block decorators, and editor-wide wrappers share this
 * manager because EditorView resolves all three from the active mode. Plugins
 * remain independent: they call this public manager but PluginManager never
 * imports or queries it.
 */
export class SurfaceManager {
  private readonly surfaces = new Map<EditorMode, {
    readonly surface: SurfaceComponent;
    dispose: () => void;
  }>();
  private readonly blockWrappers = new Map<EditorMode, BlockWrapperRegistration[]>();
  private readonly editorWrappers: EditorWrapperRegistration[] = [];

  /**
   * Creates empty presentation registries.
   *
   * @param reactEditor - Complete owning runtime used for lifecycle ownership
   * and React invalidation.
   */
  constructor(private readonly reactEditor: ReactEditor) {}

  /**
   * Registers the single root renderer for one editor mode.
   *
   * @param mode - Presentation mode resolved by EditorView.
   * @param surface - Component rendering the complete active surface.
   * @returns Idempotent disposer removing only this registration.
   */
  register(mode: EditorMode, surface: SurfaceComponent): () => void {
    this.reactEditor.plugins.assertActive();
    if (this.surfaces.has(mode)) throw new Error(`Surface ${mode} is already registered`);
    const registration: {
      readonly surface: SurfaceComponent;
      dispose: () => void;
    } = {
      surface,
      dispose: () => undefined,
    };
    this.surfaces.set(mode, registration);
    this.reactEditor.invalidate();
    registration.dispose = this.reactEditor.plugins.own(() => {
      if (this.surfaces.get(mode) !== registration) return;
      this.surfaces.delete(mode);
      this.reactEditor.invalidate();
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
    this.reactEditor.plugins.assertActive();
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
    this.reactEditor.plugins.assertActive();
    const wrappers = this.blockWrappers.get(mode) ?? [];
    const registration = { wrapper };
    wrappers.push(registration);
    this.blockWrappers.set(mode, wrappers);
    this.reactEditor.invalidate();
    return this.reactEditor.plugins.own(() => {
      const current = this.blockWrappers.get(mode);
      if (!current) return;
      const index = current.indexOf(registration);
      if (index < 0) return;
      current.splice(index, 1);
      if (current.length) this.blockWrappers.set(mode, current);
      else this.blockWrappers.delete(mode);
      this.reactEditor.invalidate();
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
    this.reactEditor.plugins.assertActive();
    const registration = { wrapper, mode };
    this.editorWrappers.push(registration);
    this.reactEditor.invalidate();
    return this.reactEditor.plugins.own(() => {
      const index = this.editorWrappers.indexOf(registration);
      if (index < 0) return;
      this.editorWrappers.splice(index, 1);
      this.reactEditor.invalidate();
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
}

/** Returns whether an optional mode restriction includes the active mode. */
function matchesMode(
  modes: EditorMode | readonly EditorMode[] | undefined,
  mode: EditorMode,
): boolean {
  return !modes || (Array.isArray(modes) ? modes.includes(mode) : modes === mode);
}
