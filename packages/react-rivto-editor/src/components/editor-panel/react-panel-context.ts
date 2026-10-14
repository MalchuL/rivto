import { createContext } from "react";
import type { ReactPanelContextValue } from "./types";

/**
 * Internal context for the React view boundary.
 *
 * `null` is intentional: it lets hooks report a clear ownership error instead
 * of silently using a global editor or creating an editor during render.
 */
export const ReactPanelContext = createContext<ReactPanelContextValue | null>(null);
