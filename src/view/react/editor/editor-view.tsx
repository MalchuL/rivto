import { createElement, useRef, useSyncExternalStore } from "react";
import type { RivtoEditorApi } from "../../../editor";
import type { BlockRendererRegistry } from "../managers/block-renderer-registry";
import type { SurfaceRegistry } from "../managers/surface-registry";
import { RIVTO_EDITOR_ROOT_ATTR, RIVTO_SURFACE_ATTR } from "./dom";
import { EventsBridge } from "./events-bridge";
import { SelectionBridge, type SelectionBridgeApi } from "./selection-bridge";

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
 * The component owns only subscription to editor revisions, surface selection,
 * root DOM markers, and bridge mounting. Surface and block rendering are
 * delegated to their registries.
 */
export function EditorView({ editor, surfaces, renderers }: EditorViewProps) {
  const root = useRef<HTMLDivElement>(null);
  const selectionBridge = useRef<SelectionBridgeApi | null>(null);
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
      ref: root,
      [RIVTO_EDITOR_ROOT_ATTR]: "",
      [RIVTO_SURFACE_ATTR]: surfaceType,
    },
    createElement(SelectionBridge, {
      editor,
      root,
      surfaceType,
      api: selectionBridge,
    }),
    createElement(EventsBridge, {
      editor,
      root,
      selectionBridge,
    }),
    createElement(surface.component, {
      editor,
      renderers,
    }),
  );
}
