/**
 * Plain-text editor extension.
 *
 * Install after `standardPreset` (or `indentExtension`) so Tab can be retargeted
 * at the visible outline. The surface is the `"plain"` editor mode.
 *
 * @module
 */
import { PageDragBlockWrapper } from "../block-drag";
import { DEFAULT_WRITING_BLOCK_TYPE } from "../built-ins/page/default-writing-block";
import type { ReactEditorExtension } from "../../managers";
import { PlainSurface } from "./plain-surface";
import { registerPlainIndent } from "./register-indent";

/** Stable extension id for the plain-text projection. */
export const PLAIN_EDITOR_EXTENSION_ID = "rivto.plain";

/** Options for {@link plainEditorExtension}. */
export interface PlainEditorOptions {
  /**
   * Block types rendered in the column.
   *
   * Defaults to the writing paragraph. Add further text types here; anything
   * else, including blocks nested inside those omitted types, stays hidden.
   */
  readonly blockTypes?: readonly string[];
  /** Draws a horizontal rule between sibling blocks. Defaults to off. */
  readonly separators?: boolean;
  /**
   * Draws a bullet on nested blocks that do not already have a list marker.
   *
   * Defaults to on. Set false when the marker collides with a custom renderer.
   */
  readonly bullets?: boolean;
}

/**
 * Registers the plain-text surface, its indent policy, and drag wrappers.
 *
 * Drag reuse depends on `pageDragExtension()` being installed as well: this
 * extension only attaches the existing per-block wrapper to plain mode. The
 * shared drag provider stays with the drag extension so page mode is unchanged.
 *
 * @param options - Visible types and presentation toggles.
 * @returns Extension installed by `createReactEditor`.
 */
export function plainEditorExtension(options: PlainEditorOptions = {}): ReactEditorExtension {
  const blockTypes = new Set(options.blockTypes?.length ? options.blockTypes : [DEFAULT_WRITING_BLOCK_TYPE]);
  const bullets = options.bullets !== false;
  const initialSeparators = options.separators === true;
  return {
    id: PLAIN_EDITOR_EXTENSION_ID,
    setup(reactEditor) {
      reactEditor.surfaces.register("plain", function PlainEditorSurface() {
        return (
          <PlainSurface
            blockTypes={blockTypes}
            bullets={bullets}
            initialSeparators={initialSeparators}
          />
        );
      });
      // Page drag registers its wrapper only for block and edgeless. Plain mode
      // needs the same wrapper or the handle slot has no drag registration.
      reactEditor.surfaces.registerBlockWrapper("plain", PageDragBlockWrapper);
      registerPlainIndent(reactEditor, blockTypes);
    },
  };
}
