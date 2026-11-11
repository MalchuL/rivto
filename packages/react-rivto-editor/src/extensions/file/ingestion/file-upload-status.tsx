import { Listeners } from "@chulane/rivto-utils";
import { useSyncExternalStore } from "react";
import type { FileIngestionStatus } from "./types";

/** One locally displayed upload, including its latest progress or error. */
interface FileUploadStatus extends FileIngestionStatus {
  /** Reported completion fraction, when available. */
  readonly progress?: number;
  /** Failure text displayed for a failed operation. */
  readonly error?: string;
}

/** Observable upload feedback owned independently by each extension. */
export class FileUploadStatusStore {
  /** Current statuses keyed by their local upload IDs. */
  private readonly uploads = new Map<string, FileUploadStatus>();
  /** Subscribers notified when statuses change. */
  private readonly listeners = new Listeners<{
    /** Notification that the status snapshot changed. */
    changed: void;
  }>();
  /** Snapshot version advanced after each published change. */
  private revision = 0;

  /**
   * Reads the stable revision used by React subscriptions.
   *
   * @returns Current revision, incremented after every published change.
   */
  getRevision(): number {
    return this.revision;
  }

  /**
   * Lists current upload cards in insertion order.
   *
   * @returns A detached array of the current status records.
   */
  getUploads(): readonly FileUploadStatus[] {
    return [...this.uploads.values()];
  }

  /**
   * Subscribes to local status changes.
   *
   * Subscription changes during a notification take effect on the next change.
   *
   * @param listener - Callback invoked after each published change.
   * @returns Disposer that removes the callback.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("changed", listener);
  }

  /**
   * Adds or replaces a pending upload and notifies subscribers.
   *
   * @param upload - File identity, position, and retry action.
   * @returns Publishes the current upload status.
   */
  set(upload: FileUploadStatus): void {
    this.uploads.set(upload.id, upload);
    this.emit();
  }

  /**
   * Updates a pending upload if it still exists.
   *
   * @param id - Identity of the upload to update.
   * @param patch - New progress or error message.
   * @returns Publishes the update when the upload exists.
   */
  update(
    id: string,
    patch: {
      /** Latest upload completion fraction. */
      progress?: number;
      /** Failure text to display for the upload. */
      error?: string;
    },
  ): void {
    const current = this.uploads.get(id);
    if (current) {
      this.uploads.set(id, { ...current, ...patch });
      this.emit();
    }
  }

  /**
   * Removes a finished or dismissed upload if present.
   *
   * @param id - Identity of the upload to remove.
   * @returns Publishes removal when an upload existed.
   */
  delete(id: string): void {
    if (this.uploads.delete(id)) {
      this.emit();
    }
  }

  /**
   * Removes all upload cards and their retry callbacks.
   *
   * @returns Publishes the empty state when statuses existed.
   */
  clear(): void {
    if (this.uploads.size) {
      this.uploads.clear();
      this.emit();
    }
  }

  /**
   * Advances the revision and notifies the current listeners.
   *
   * @returns Subscribers have been notified of the current state.
   */
  private emit(): void {
    this.revision += 1;
    this.listeners.emit("changed");
  }
}

/** Upload operations needed to render and dismiss status cards. */
type FileUploadStatusViewStore = Pick<
  FileUploadStatusStore,
  "subscribe" | "getRevision" | "getUploads" | "delete"
>;

/** State and visual kind supplied to an upload status overlay. */
interface FileUploadStatusOverlayProps {
  /** Extension-owned observable upload state. */
  readonly store: FileUploadStatusViewStore;
  /** Selects file or image overlay styling. */
  readonly kind: "file" | "image";
}

/**
 * Renders accessible pending and error cards near the source interaction.
 *
 * Each extension provides its own store; the kind selects its existing CSS classes.
 *
 * @param props - Local upload state and its presentation kind.
 * @param props.store - Extension-owned observable upload state.
 * @param props.kind - Existing file or image overlay styling.
 * @returns The local-only live status overlay.
 */
export function FileUploadStatusOverlay({ store, kind }: FileUploadStatusOverlayProps) {
  // Subscribe to a stable revision so React refreshes the current status cards.
  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getRevision(),
    () => store.getRevision(),
  );
  return (
    <div className={`rivto-${kind}-uploads`} aria-live="polite">
      {store.getUploads().map((upload) => (
        <div
          key={upload.id}
          className={`rivto-${kind}-upload`}
          role={upload.error ? "alert" : "status"}
          style={{ left: upload.x, top: upload.y }}
        >
          <span>
            {upload.error ??
              `Uploading ${upload.name}${upload.progress === undefined ? "…" : ` ${Math.round(upload.progress * 100)}%`}`}
          </span>
          {upload.error && (
            <>
              <button type="button" onClick={upload.retry}>
                Retry
              </button>
              <button type="button" onClick={() => store.delete(upload.id)}>
                Dismiss
              </button>
            </>
          )}
        </div>
      ))}
    </div>
  );
}
