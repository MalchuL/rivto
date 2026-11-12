import { Listeners } from "@chulane/rivto-utils";
import { AnimatePresence, motion, useIsPresent, useReducedMotion } from "motion/react";
import { useSyncExternalStore } from "react";
import type { FileIngestionStatus } from "./types";
import { UI_TRANSITION_DURATION } from "../../../constants";

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

/** One status card and its local dismissal operation. */
interface FileUploadStatusCardProps {
  /** Current upload data retained through an exit transition. */
  readonly upload: FileUploadStatus;
  /** Existing file or image styling. */
  readonly kind: "file" | "image";
  /** Whether positional motion should be suppressed. */
  readonly reducedMotion: boolean | null;
  /**
   * Removes this upload from its owning store.
   *
   * @returns The dismissal has been requested.
   */
  readonly onDismiss: () => void;
}

/**
 * Displays one pending or failed upload and fades it out after removal.
 *
 * Exiting cards immediately leave accessibility and pointer interaction while
 * their last visible state remains mounted for the transition.
 *
 * @param props - Upload status, presentation, and dismissal callback.
 * @param props.upload - Current upload data, retained during exit.
 * @param props.kind - Selects the file or image status styles.
 * @param props.reducedMotion - Whether positional movement should be suppressed.
 * @param props.onDismiss - Removes this upload from its owning store when Dismiss is pressed.
 * @returns A positioned status card.
 */
function FileUploadStatusCard({
  upload,
  kind,
  reducedMotion,
  onDismiss,
}: FileUploadStatusCardProps) {
  const present = useIsPresent();
  const role = upload.error ? "alert" : "status";
  return (
    <motion.div
      className={`rivto-${kind}-upload`}
      role={present ? role : undefined}
      aria-hidden={!present}
      style={{ left: upload.x, top: upload.y, pointerEvents: present ? undefined : "none" }}
      initial={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: reducedMotion ? 0 : 4 }}
      transition={{
        duration: reducedMotion ? UI_TRANSITION_DURATION / 2 : UI_TRANSITION_DURATION,
        ease: [0.23, 1, 0.32, 1],
      }}
    >
      <span>
        {upload.error ??
          `Uploading ${upload.name}${upload.progress === undefined ? "…" : ` ${Math.round(upload.progress * 100)}%`}`}
      </span>
      {upload.error && (
        <>
          <button type="button" disabled={!present} onClick={upload.retry}>
            Retry
          </button>
          <button type="button" disabled={!present} onClick={onDismiss}>
            Dismiss
          </button>
        </>
      )}
    </motion.div>
  );
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
  const reducedMotion = useReducedMotion();
  // Subscribe to a stable revision so React refreshes the current status cards.
  useSyncExternalStore(
    (listener) => store.subscribe(listener),
    () => store.getRevision(),
    () => store.getRevision(),
  );
  const cards = store
    .getUploads()
    .map((upload) => (
      <FileUploadStatusCard
        key={upload.id}
        upload={upload}
        kind={kind}
        reducedMotion={reducedMotion}
        onDismiss={() => store.delete(upload.id)}
      />
    ));
  return (
    <div className={`rivto-${kind}-uploads`} aria-live="polite">
      <AnimatePresence initial={false}>{cards}</AnimatePresence>
    </div>
  );
}
