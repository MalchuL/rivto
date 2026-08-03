import type { EditorSelectionItem } from "../../editor/types";

/** Structural selection item used while restoring reordered block selections. */
export type RuntimeBlockSelection = Extract<EditorSelectionItem, { type: "block" }>;
