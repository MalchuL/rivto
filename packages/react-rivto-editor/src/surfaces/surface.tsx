import { createContext, type ReactNode } from "react";
import type { EditorMode } from "@chulane/rivto";
import { useEditorView } from "../hooks/editor/use-editor-view";

/** Presentation kind supplied by an explicit surface, never stored on an editor. */
export const SurfaceContext = createContext<EditorMode>("block");

/**
 * Composes shared extensions around one explicitly selected surface.
 * @param props - Immutable surface kind and its rendered children.
 * @returns Surface context, registered wrappers, and local extension UI.
 */
export function SurfaceBoundary({ type, children }: { readonly type: EditorMode; readonly children: ReactNode }) {
  const editor = useEditorView();
  let content = <>{editor.extensions.getComponents("beforeSurface").map((Component, index) => <Component key={`before-${index}`} />)}{children}{editor.extensions.getComponents("afterSurface").map((Component, index) => <Component key={`after-${index}`} />)}</>;
  const wrappers = editor.surfaces.getEditorWrappers(type);
  for (let index = wrappers.length - 1; index >= 0; index -= 1) {
    const Wrapper = wrappers[index]!;
    content = <Wrapper>{content}</Wrapper>;
  }
  return <SurfaceContext.Provider value={type}>{content}</SurfaceContext.Provider>;
}
