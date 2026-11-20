import { createContext } from "react";
import type { BlockEditorRenderingApi } from "./types";
import type { InputRoot } from "@chulane/rivto-root";

/** The current Page controller, never an entire host editor or panel. */
export const BlockEditorContext = createContext<BlockEditorRenderingApi | null>(null);

/** Current occurrence borrowed by mounted Page controls. */
export const BlockEditorInputRootContext = createContext<
  Pick<InputRoot, "isAttached" | "observeWindowInput"> | undefined
>(undefined);
