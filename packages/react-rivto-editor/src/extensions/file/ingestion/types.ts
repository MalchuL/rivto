import type { BinaryWriteContext, PreparedFile } from "../../../attachments";
import type { ReactPanelApi } from "../../../panels/types";
import type {
  FileDestination,
  FileDestinationEditor,
  FileDestinationPanel,
} from "./file-destination";

/** Viewport coordinates for local file-operation feedback. */
export interface FileIngestionPoint {
  readonly x: number;
  readonly y: number;
}

/** Editor operations borrowed while committing prepared files. */
interface FileIngestionEditor extends FileDestinationEditor {
  readonly blocks: Pick<
    ReactPanelApi["editor"]["blocks"],
    "getBlock" | "setBlockType" | "updateBlock"
  >;
}

/** Panel operations borrowed to validate and commit prepared file batches. */
export interface FileIngestionPanel extends FileDestinationPanel {
  readonly editor: FileIngestionEditor;
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    "getBlock" | "getBlockNode" | "hasChildren" | "insertBlock" | "getInsertionDestinationAfter"
  >;
  readonly elements: Pick<ReactPanelApi["elements"], "getElements" | "insertElement">;
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
  readonly editor: FileInputPanelEditor;
  /**
   * Reads the active panel surface for file preparation.
   *
   * @returns The panel's current surface type.
   */
  readonly getSurfaceType: ReactPanelApi["getSurfaceType"];
}

/** Panel document access needed when a file is stored. */
interface FileUploadPanel {
  readonly editor: Pick<ReactPanelApi["editor"], "getDocument">;
}

/** Context for storing one file during a batch attempt. */
export interface FileUploadContext {
  readonly panel: FileUploadPanel;
  readonly destination: BinaryWriteContext["destination"];
  readonly mode: BinaryWriteContext["mode"];
  readonly source: BinaryWriteContext["source"];
  readonly statusId: string;
  readonly name: string;
}

/** Status card for one active or failed file operation. */
export interface FileIngestionStatus {
  readonly id: string;
  readonly name: string;
  readonly x: number;
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
  update(id: string, patch: { progress?: number; error?: string }): void;
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
  readonly panel: FileIngestionPanel;
  readonly destination: FileDestination;
  readonly items: readonly TInput[];
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
  readonly failureMessage: string;
  readonly staleMessage: string;
}
