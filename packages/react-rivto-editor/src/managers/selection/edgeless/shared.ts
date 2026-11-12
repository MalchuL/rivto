import type { ReactEditorApi } from "../../../editor/types";
import type { ReactPanelApi } from "../../../panels/types";
import type { EdgelessSelectionRuntime } from "./edgeless-runtime";

/** Editor-owned panel and editor selection adapters shared by edgeless consumers. */
export const EDGELESS_SELECTION_RUNTIMES_KEY = "rivto.edgeless.selection-runtimes";

/** Weakly held adapters preserve independent selection for each occurrence. */
export type EdgelessSelectionRuntimes = WeakMap<
  ReactPanelApi | ReactEditorApi,
  EdgelessSelectionRuntime
>;
