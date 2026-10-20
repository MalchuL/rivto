import { createContext } from "react";
import type { BlockEditorController } from "../../../editor/block-editor-controller";

/** The current Page controller, never an entire host editor or panel. */
export const BlockEditorContext = createContext<BlockEditorController | null>(null);
