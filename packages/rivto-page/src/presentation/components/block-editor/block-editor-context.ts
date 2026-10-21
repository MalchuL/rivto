import { createContext } from "react";
import type { BlockEditorApi } from "../../../editor/block-editor-api";

/** The current Page controller, never an entire host editor or panel. */
export const BlockEditorContext = createContext<BlockEditorApi | null>(null);
