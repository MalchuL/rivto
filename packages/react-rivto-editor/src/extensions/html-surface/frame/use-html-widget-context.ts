/**
 * Presentation context posted to a widget as `rivto.context`.
 *
 * @module
 */
import { useContext, useMemo } from "react";
import { SurfaceContext } from "../../../surfaces/surface";
import type { HtmlWidgetContext } from "../types";

/**
 * Builds a stable widget context for the current surface.
 *
 * The caller supplies selection from the block or element that owns it. The
 * returned object keeps its identity until a field changes, so the frame posts
 * a context update only when presentation actually changed. Outside a surface
 * boundary, `SurfaceContext` defaults to `block`.
 *
 * @param selected - Whether the whole owning block or element is selected.
 * @param preview - Whether this is a detached creation preview; defaults to false.
 * @returns The memoized context.
 */
export function useHtmlWidgetContext(selected: boolean, preview = false): HtmlWidgetContext {
  const mode = useContext(SurfaceContext);
  return useMemo(() => ({ mode, selected, preview }), [mode, selected, preview]);
}
