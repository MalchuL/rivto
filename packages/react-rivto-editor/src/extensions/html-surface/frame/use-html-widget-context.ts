/**
 * Presentation context posted to a widget as `rivto.context`.
 *
 * @module
 */
import { useContext, useMemo } from "react";
import { SurfaceContext } from "../../../surfaces/surface";
import type { HtmlWidgetContext } from "../types";

/**
 * Builds the presentation context a widget sees as `rivto.context`.
 *
 * `mode` comes from the surface the occurrence is rendered in (Page or
 * Edgeless, including nested surfaces); `selected` and `preview` come from the
 * caller, which already knows them. Outside any surface, the mode is `block`.
 *
 * The object keeps its identity until a field changes. The frame posts a
 * context update whenever the identity changes, so this avoids redundant posts.
 *
 * @param selected - Whether the whole owning block or element is selected.
 * @param preview - Whether this is a placement preview. Defaults to false.
 * @returns The context, memoized.
 */
export function useHtmlWidgetContext(selected: boolean, preview = false): HtmlWidgetContext {
  const mode = useContext(SurfaceContext);
  return useMemo(() => ({ mode, selected, preview }), [mode, selected, preview]);
}
