import { createContext } from "react";
import type { EditorRootContextValue } from "./types";

/**
 * Internal root context kept separate from editor revision state.
 *
 * Mounting or switching a surface updates this context without changing the
 * editor runtime or pretending that a DOM element is collaborative state.
 */
export const EditorRootContext = createContext<EditorRootContextValue | null>(null);

/** Native host retained only for React's browser portal adapters. */
export const EditorPortalHostContext = createContext<HTMLElement | null>(null);
