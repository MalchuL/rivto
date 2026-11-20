import type { DocumentModel } from "@chulane/document-model";
import type { ReactEditorState } from "../types";

/** Custom event produced by the editor host during the hook lifecycle test. */
export interface TestEditorEvents {
  "document-saved": { documentId: string };
}

/** Borrowed model and collectors used by the hook lifecycle test. */
export interface TestHostProps {
  /** Caller-owned document observed by the hook. */
  readonly model: DocumentModel;
  /**
   * Records each hook state as the test host renders.
   *
   * @param state - Current loading, ready, or error state.
   * @returns The test collector retains the state.
   */
  readonly onState: (state: ReactEditorState<TestEditorEvents>) => void;
  /** Collected document IDs from custom-event delivery. */
  readonly values: string[];
}
