import { EdgelessSurface, PageSurface, useEditorMode } from "@chulane/rivto-react";

/**
 * Renders the presentation selected on this document's core editor.
 * @returns Page or edgeless surface, updated by the existing mode subscription hook.
 */
export function DemoEditorSurface() {
  const { mode } = useEditorMode();
  if (mode === "edgeless") return <EdgelessSurface />;
  return <PageSurface />;
}
