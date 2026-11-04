import type { ReactPanelApi } from "../../panels/types";
import type { FileDestination } from "./file-destination";

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
export interface FileIngestionBatch<TInput, TResult> {
  readonly panel: ReactPanelApi;
  readonly destination: FileDestination;
  readonly items: readonly TInput[];
  readonly point: { readonly x: number; readonly y: number };
  readonly signal: AbortSignal;
  readonly statuses: FileIngestionStatuses;
  /**
   * Allocates an identity for a new status card.
   *
   * @returns Identity unique among active cards.
   */
  readonly nextId: () => string;
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
   * @returns Promise resolving to the prepared item.
   * @throws If preparation fails or is cancelled.
   */
  readonly prepare: (item: TInput, id: string) => Promise<TResult>;
  /**
   * Restarts a failed input at a refreshed destination.
   *
   * @param item - Input to retry.
   * @param destination - Refreshed destination.
   * @returns Starts the retry.
   */
  readonly retry: (item: TInput, destination: FileDestination) => void;
  /**
   * Commits successfully prepared items in input order.
   *
   * @param items - Successful prepared results.
   * @returns Inserts the results.
   */
  readonly commit: (items: readonly TResult[]) => void;
  /**
   * Reports a preparation or commit failure, or a changed destination.
   *
   * @param error - Failure from preparation, insertion, or destination checking.
   * @returns Notifies the host.
   */
  readonly onError?: (error: unknown) => void;
  readonly failureMessage: string;
  readonly staleMessage: string;
}
