import type { PreparedFile } from "..";
import type { ReactPanelApi } from "../../panels/types";
import type {
  FileDestination,
  FileDestinationEditor,
  FileDestinationPanel,
} from "./file-destination";

/** Viewport coordinates for local file-operation feedback. */
export interface FileIngestionPoint {
  /** Horizontal viewport coordinate in pixels. */
  readonly x: number;
  /** Vertical viewport coordinate in pixels. */
  readonly y: number;
}

/** Editor operations borrowed while committing prepared files. */
interface FileIngestionEditor extends FileDestinationEditor {
  /** Checks whether prepared block types are allowed at a Page destination. */
  readonly blockBehaviors: Pick<ReactPanelApi["editor"]["blockBehaviors"], "canMove">;
  /** Block operations used to commit prepared representations. */
  readonly blocks: Pick<
    ReactPanelApi["editor"]["blocks"],
    "getBlock" | "setBlockType" | "updateBlock"
  >;
}

/** Panel operations borrowed to validate and commit prepared file batches. */
export interface FileIngestionPanel extends FileDestinationPanel {
  /** Borrowed editor operations for the destination document. */
  readonly editor: FileIngestionEditor;
  /** Block lookup and insertion operations. */
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    | "getBlock"
    | "getBlockNode"
    | "hasChildren"
    | "hasBlock"
    | "getRootIds"
    | "getChildIds"
    | "insertBlock"
    | "getInsertionDestinationAfter"
  >;
  /** Element lookup and insertion operations. */
  readonly elements: Pick<ReactPanelApi["elements"], "getElements" | "insertElement">;
  /** Selection operations used while committing a batch. */
  readonly selection: Pick<
    ReactPanelApi["selection"],
    "readDOM" | "get" | "set" | "scheduleIfSelectionUnchanged" | "restoreDOM"
  >;
  /**
   * Groups synchronous file insertions in one document history batch.
   *
   * Mutations made before an error are not rolled back.
   *
   * @param operation - Synchronous insertion work.
   * @returns The operation's result.
   * @throws If the insertion callback fails.
   */
  readonly batchUpdates: ReactPanelApi["batchUpdates"];
}

/** Editor operations needed while accepting file input. */
interface FileInputPanelEditor extends FileIngestionEditor {
  /**
   * Reads the document that receives file uploads.
   *
   * @returns The active document associated with this editor.
   */
  readonly getDocument: ReactPanelApi["editor"]["getDocument"];
}

/** Panel operations borrowed while preparing and inserting file input. */
export interface FileInputPanel extends FileIngestionPanel {
  /** Editor operations needed to identify the receiving document. */
  readonly editor: FileInputPanelEditor;
}

/** Panel document access needed when a file is stored. */
interface FileUploadPanel {
  /** Document lookup for the upload context. */
  readonly editor: Pick<ReactPanelApi["editor"], "getDocument">;
}

/** Context for storing one file during a batch attempt. */
export interface FileUploadContext {
  /** Panel owning the receiving document. */
  readonly panel: FileUploadPanel;
  /** Local status identifier used for progress updates. */
  readonly statusId: string;
  /** Display name supplied to the provider. */
  readonly name: string;
}

/** Status card for one active or failed file operation. */
export interface FileIngestionStatus {
  /** Identifier for updates to this status. */
  readonly id: string;
  /** File name shown in the status card. */
  readonly name: string;
  /** Horizontal viewport coordinate in pixels. */
  readonly x: number;
  /** Vertical viewport coordinate in pixels. */
  readonly y: number;
  /**
   * Retries the failed operation at a refreshed destination.
   *
   * @returns Starts a new attempt.
   */
  readonly retry: () => void;
}

/** Local feedback needed while a file batch is being prepared. */
export interface FileIngestionStatuses {
  /**
   * Adds the status for an active job.
   *
   * @param status - Job identity, name, location, and retry action.
   * @returns Publishes the status.
   */
  set(status: FileIngestionStatus): void;
  /**
   * Updates a job's progress or error.
   *
   * @param id - Job identity.
   * @param patch - New progress or error text.
   * @returns Publishes the change when the job exists.
   */
  update(
    id: string,
    patch: {
      /** Latest upload completion fraction. */
      progress?: number;
      /** Failure text to display for the upload. */
      error?: string;
    },
  ): void;
  /**
   * Removes a finished or retried job.
   *
   * @param id - Job identity.
   * @returns Removes the status when present.
   */
  delete(id: string): void;
}

/** Inputs and callbacks for one asynchronous file ingestion batch. */
export interface FileIngestionBatch<TInput> {
  /** Panel receiving the prepared files. */
  readonly panel: FileIngestionPanel;
  /** Destination captured when the batch starts. */
  readonly destination: FileDestination;
  /** Inputs prepared for insertion in their original order. */
  readonly items: readonly TInput[];
  /** Viewport position for local status cards. */
  readonly point: FileIngestionPoint;
  /**
   * Names an input for its status card.
   *
   * @param item - Input being prepared.
   * @returns Human-readable file name.
   */
  readonly name: (item: TInput) => string;
  /**
   * Prepares one input for insertion.
   *
   * @param item - Input being prepared.
   * @param id - Status identity used to report progress.
   * @param destination - Current insertion destination, refreshed when retrying.
   * @returns Promise resolving to the representation for that destination.
   * @throws If preparation fails or is cancelled.
   */
  readonly prepare: (
    item: TInput,
    id: string,
    destination: FileDestination,
  ) => Promise<PreparedFile>;
  /** Message displayed when preparation or insertion fails. */
  readonly failureMessage: string;
  /** Message displayed when the destination is no longer usable. */
  readonly staleMessage: string;
}
