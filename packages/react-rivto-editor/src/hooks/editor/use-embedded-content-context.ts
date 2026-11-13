import { useContext, useMemo } from "react";
import type { EmbeddedContentContext } from "../../components/embedded-content-context";
import { SurfaceContext } from "../../surfaces/surface";

/**
 * Builds stable presentation state for embedded content on the current surface.
 *
 * The caller supplies selection from its existing block, element, or container
 * owner. For a detached creation preview, pass `preview: true` and `selected: false`.
 * Outside a surface boundary, the existing SurfaceContext default is `block`.
 *
 * @param selected - Whether the complete owning item is selected.
 * @param preview - Whether this occurrence is a detached creation preview; defaults to false.
 * @returns A stable context until the surface, selection, or preview state changes.
 */
export function useEmbeddedContentContext(
  selected: boolean,
  preview = false,
): EmbeddedContentContext {
  const mode = useContext(SurfaceContext);
  return useMemo(() => ({ mode, selected, preview }), [mode, selected, preview]);
}
