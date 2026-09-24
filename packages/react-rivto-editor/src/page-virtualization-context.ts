/**
 * Page windowing configuration for the React presentation layer.
 *
 * EditorView supplies the host choice while PageSurface consumes it. The
 * document model and edgeless surface never depend on this display setting.
 *
 * @module
 */
import { createContext, useContext } from "react";

/** Whether the page may unmount roots outside the viewport. */
export const PageVirtualizationContext = createContext(true);

/**
 * Reads the page display choice from its nearest EditorView.
 *
 * @returns Whether long page outlines should mount only nearby roots.
 */
export function usePageVirtualization(): boolean {
  return useContext(PageVirtualizationContext);
}
