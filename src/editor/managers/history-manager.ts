/**
 * Public runtime name for the existing adapter-neutral undo implementation.
 *
 * The alias keeps one implementation and one history stack while presenting
 * the Phase 2 responsibility-oriented `history` API on EditorRuntime.
 */
export { UndoManager as HistoryManager } from "./undo-manager";
