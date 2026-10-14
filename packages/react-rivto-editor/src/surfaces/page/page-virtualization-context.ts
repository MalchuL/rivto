import type { PageVirtualizationSettings } from "./types";
/**
 * Page windowing configuration for the React presentation layer.
 *
 * EditorPanel supplies the host choice while PageSurface consumes it. The
 * document model and edgeless surface never depend on this display setting.
 *
 * @module
 */
import { createContext } from "react";

/** Default number of extra roots mounted above and below the viewport. */
export const DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN = 8;

/** Initial height estimate until a mounted root reports its actual size. */
export const ESTIMATED_ROOT_HEIGHT = 40;

/** Windowing is opt-in, with a small mounted buffer when enabled. */
export const PageVirtualizationContext = createContext<PageVirtualizationSettings>({
  threshold: false,
  overscan: DEFAULT_PAGE_VIRTUALIZATION_OVERSCAN,
});
