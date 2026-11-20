import type { ReactPanelApi } from "../../../panels/types";
import type { BlockSnapshotPanel } from "../../../block-behaviors/types";

/** Stable first-class element ID stored in local edgeless selection. */
export type EdgelessSelectionRef = string;

/** Detached local view of the generic editor selection. */
export interface EdgelessSelectionSnapshot {
  readonly active: boolean;
  readonly items: readonly EdgelessSelectionRef[];
}
/** Selection operations borrowed by the canvas selection adapter. */
export interface EdgelessSelectionHost {
  /** Reads, writes, and observes selection without owning its lifecycle. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "get" | "set" | "snapshot" | "subscribe" | "clear"
  >;
}

/** Shared extension identity used to locate the installed selection adapter. */
export interface EdgelessSelectionOwner extends EdgelessSelectionHost {
  /** Identity of the extension owner; its lifecycle is not exposed. */
  readonly extensions: object;
}

/** Panel occurrence whose selection belongs to a shared extension owner. */
export interface EdgelessSelectionPanel extends EdgelessSelectionHost {
  /** Shared editor providing the installed extension identity. */
  readonly editor: Pick<EdgelessSelectionOwner, "extensions">;
}

/** Operations borrowed when deleting a panel's current selection. */
export interface SelectionDeletionPanel
  extends BlockSnapshotPanel, Pick<ReactPanelApi, "batchUpdates"> {
  /** Dispatches registered structural deletion behavior. */
  readonly editor: SelectionDeletionEditor;
  /** Reads and deletes the occurrence's current selection. */
  readonly selection: Pick<ReactPanelApi["selection"], "get" | "delete">;
}

/** Shared structural deletion policy borrowed by selection deletion. */
export interface SelectionDeletionEditor {
  /** Dispatches the selected block behavior chain. */
  readonly blockBehaviors: Pick<ReactPanelApi["editor"]["blockBehaviors"], "dispatch">;
}
