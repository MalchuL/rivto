import type { EventPanel } from "../../../managers/events/types";

/** Shared services used to locate canvas selection and interpret clipboard data. */
export interface ClipboardEventEditor {
  /** Identity of the shared extension owner. */
  readonly extensions: object;
  /** Formats copied data and parses pasted content. */
  readonly clipboardFormats: EventPanel["editor"]["clipboardFormats"];
  /** Checks whether collapsed-list behavior is installed. */
  readonly blockListProps: EventPanel["editor"]["blockListProps"];
}

/** Panel operations used by the browser clipboard handlers. */
export interface ClipboardEventPanel {
  /** Shared formatters and extension identity. */
  readonly editor: ClipboardEventEditor;
  /** Reads and removes blocks within the occurrence. */
  readonly blocks: Pick<
    EventPanel["blocks"],
    "getRootIds" | "getBlockNode" | "canRemove" | "hasChildren" | "getParentId" | "removeBlocks"
  >;
  /** Reads and removes canvas elements within the occurrence. */
  readonly elements: Pick<EventPanel["elements"], "getElementNode" | "removeElements">;
  /** Synchronizes and restores the panel's selection. */
  readonly selection: Pick<
    EventPanel["selection"],
    | "get"
    | "set"
    | "snapshot"
    | "subscribe"
    | "clear"
    | "readDOM"
    | "delete"
    | "scheduleIfSelectionUnchanged"
    | "restoreDOM"
  >;
  /** Pastes into this occurrence. */
  readonly clipboard: EventPanel["clipboard"];
  /** Root block restricting the occurrence, when present. */
  readonly rootBlockId?: EventPanel["rootBlockId"];
  /** Batches cut operations. */
  readonly batchUpdates: EventPanel["batchUpdates"];
  /** Reads the surface receiving clipboard input. */
  readonly getSurfaceType: EventPanel["getSurfaceType"];
}
