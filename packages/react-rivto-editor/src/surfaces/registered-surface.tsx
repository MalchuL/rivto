import type { EditorMode } from "@chulane/rivto";
import { useSyncExternalStore } from "react";
import { useReactPanel } from "../hooks/editor/use-react-panel";

/** Explicit choice of the host registration rendered within the current panel. */
export interface RegisteredSurfaceProps {
  readonly mode: EditorMode;
}

/**
 * Renders the currently registered surface for an explicitly selected presentation mode.
 *
 * The host still chooses this component as EditorPanel content. Registration changes
 * replace the rendered surface; its React cleanup releases the old DOM attachment.
 * This component borrows registrations and never destroys the editor or its registry.
 *
 * @param props - Presentation mode selected by the host.
 * @param props.mode - Registry key to observe independently of the document's persisted state.
 * @returns Registered component, or null while no surface is registered for the mode.
 * @throws If called outside a panel, or the registered component fails while rendering.
 */
export function RegisteredSurface({ mode }: RegisteredSurfaceProps) {
  const { surfaces } = useReactPanel().editor;
  useSyncExternalStore(
    (listener) => surfaces.subscribe(listener),
    () => surfaces.revision,
    () => surfaces.revision,
  );
  const Surface = surfaces.get(mode);
  return Surface ? <Surface /> : null;
}
