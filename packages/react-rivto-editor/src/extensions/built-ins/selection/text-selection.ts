import { PageTextSelectionBoundary } from "../../../surfaces/page/page-selection-boundary";
import type { ReactEditorApi } from "../../../editor/types";

/**
 * Publishes exact text endpoints and structural block gestures to core.
 *
 * Every block owns a separate contenteditable element. Browsers handle a drag
 * inside one element natively, but Chromium may collapse or reverse a range as
 * the pointer crosses into another editing host. This extension keeps the original
 * pointer-down endpoint, resolves subsequent pointer coordinates itself, and
 * uses `Selection.setBaseAndExtent` to display the correct directed range.
 *
 * A drag between editable hosts selects complete blocks. Shift+Alt is the
 * exception: it keeps exact text endpoints and fully covers blocks between
 * them. Structural block renderers produce whole blocks because they have no
 * caret.
 *
 * The extension renders no UI and assumes no surface classes. It relies only on
 * the stable data attributes provided by block shell and useBlockEditing.
 * Mount it once inside EditorPanel, alongside the active surface.
 *
 * @example
 * ```tsx
 * <EditorPanel editor={reactEditor} documentId={documentId}>
 *   <TextSelectionPlugin />
 *   <PageSurface />
 * </EditorPanel>
 * ```
 */
export function registerTextSelection(reactEditor: ReactEditorApi): () => void {
  return reactEditor.surfaces.registerEditorWrapper(PageTextSelectionBoundary);
}
