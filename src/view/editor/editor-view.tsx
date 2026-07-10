import { createElement, useSyncExternalStore } from "react";
import type { RivtoEditorApi } from "../../editor";
import type { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { SurfaceRegistry } from "../managers/surface-registry";
import { RIVTO_EDITOR_ROOT_ATTR, RIVTO_SURFACE_ATTR } from "./dom";

/** Properties for the top-level React editor view connector. */
export interface EditorViewProps {
  /** Long-lived editor runtime owned by the host application. */
  readonly editor: RivtoEditorApi;
  /** Registered document-level surface components. */
  readonly surfaces: SurfaceRegistry;
  /** Registered block-level renderer components. */
  readonly renderers: BlockRendererRegistry;
}

/**
 * Connects the editor runtime to registered React surface components.
 *
 * The component owns subscription to editor revisions. Surface and block
 * rendering stay delegated to their registries.
 */
export function EditorView({ editor, surfaces, renderers }: EditorViewProps) {
  useSyncExternalStore(
    (listener) => editor.subscribe(listener),
    () => editor.revision,
    () => editor.revision,
  );

  const surfaceType = editor.mode.get();
  const surface = surfaces.get(surfaceType);
  if (!surface) return null;

  return createElement(
    "div",
    {
      [RIVTO_EDITOR_ROOT_ATTR]: "",
      [RIVTO_SURFACE_ATTR]: surfaceType,
    },
    createElement(surface.component, {
      editor,
      renderers,
    }),
  );
}
