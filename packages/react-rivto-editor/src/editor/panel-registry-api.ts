import type { DocumentModel } from "@chulane/document-model";
import type { EditorMode } from "@chulane/rivto";
import type { ReactPanelApi } from "../types";

/** Mounted view registration and lookup exposed by the shared editor. */
export interface PanelRegistryApi {
  /**
   * Returns the API of the last activated panel registered with this document editor.
   *
   * Activation follows focus, pointer-down, input, or keyboard events routed to a
   * panel. Hover alone does not activate it. The panel remains remembered when
   * focus leaves the editor; this is not a query for the browser's focused element.
   * This method does not fall back to getDefault() or activate another panel.
   *
   * @returns The last activated panel's API, or undefined before activation, after
   * its root is removed, or when that root was registered without an API.
   */
  getActive(): ReactPanelApi | undefined;
  /**
   * Returns the API of the preferred registered panel without consulting activation history.
   *
   * Uses getDefaultRoot(): the first registered full-document panel takes priority
   * over subtree panels, including embeddings. If no full-document panel exists,
   * the first registered subtree is used. Reading this default does not activate it
   * or change the panel remembered by getActive().
   *
   * @returns The chosen panel's API, or undefined when no root is registered or
   * the chosen root has no API. A missing API does not select a different root.
   */
  getDefault(): ReactPanelApi | undefined;
  /**
   * Registers one document occurrence and connects shared delegated listeners to its root.
   * @param root - Mounted surface displaying the full document or source subtree.
   * @param document - Source model supplied by existing callers. Commands use the registered panel API; the registry does not retain this argument.
   * @param rootBlockId - Displayed source root bounding selection and navigation.
   * @param api - Panel-bound API supplied to handlers; omitted only for a region that must not dispatch editing handlers.
   * @param cancelSelection - Cancels pending DOM selection work before removing the root.
   * @param deactivate - Closes this panel's transient UI when it loses focus or is removed.
   * @returns Idempotent cleanup that clears selection when a focused subtree is removed
   * and returns keyboard focus to an enclosing mounted surface, retaining source undo.
   * Full-document surface changes preserve selection when switching presentation modes.
   */
  registerPanel(
    root: HTMLElement,
    document: DocumentModel,
    rootBlockId?: string,
    api?: ReactPanelApi,
    deactivate?: () => void,
    cancelSelection?: () => void,
  ): () => void;
  /**
   * Reads the current panel's rendered surface without changing the core mode.
   *
   * The core mode manager belongs to the document and chooses its main presentation.
   * This method reads the receiving DOM occurrence instead: a page embedding
   * returns `block` even inside an `edgeless` document. Scoped event managers use
   * their own panel root; a call without a root uses the active root,
   * falling back to the first full-document panel or first subtree. No additional mode state is stored, and the core mode remains shared.
   * Dispatch captures this value once in `event.mode`; handlers use that snapshot.
   * Panel-specific commands outside dispatch can call this method, while operations
   * that depend on document mode should use `reactEditor.mode.get()`.
   * @param root - Surface to inspect; omitted to choose the active or default root.
   * Explicit null reads the core mode without choosing another root.
   * @returns Current DOM panel's surface kind, or core mode before mounting
   * or when the root has no recognized surface type.
   */
  getSurfaceType(root?: HTMLElement | null): EditorMode;
  /**
   * Returns the DOM root of the last activated panel registered with this document editor.
   *
   * Focus, pointer-down, input, and keyboard events can activate a panel; hover
   * alone cannot. The root remains remembered when browser focus leaves the editor.
   * For example, interacting with an embedding makes its root active even while
   * getDefaultRoot() still prefers a mounted full-document panel.
   *
   * The remembered root belongs to this ReactEditor's registry. It can be an
   * embedding rendered inside another editor's DOM, but it cannot be a panel
   * registered only with that other editor. Activating another editor's panel
   * leaves this registry's last active root remembered rather than replacing it.
   *
   * @returns The remembered root, or null before activation and after that root
   * is removed. No default is applied; callers that need an initial fallback can
   * use getActiveRoot() ?? getDefaultRoot().
   */
  getActiveRoot(): HTMLElement | null;
  /**
   * Chooses a registered DOM root by panel scope and registration order, independently of interaction.
   *
   * Prefers the first full-document panel (registered without rootBlockId), even
   * if an embedding registered earlier. When only subtree panels are mounted,
   * uses the first of those. The choice is recomputed from current registrations;
   * it neither reads nor changes the last activated root or browser focus.
   *
   * @returns The first registered full-document root, otherwise the first registered
   * subtree root, or null when no panels are registered.
   */
  getDefaultRoot(): HTMLElement | null;
}
