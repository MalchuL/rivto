/**
 * Accessible interactive presentation for generic file references.
 *
 * Double-click and keyboard activation use registered attachment openers,
 * where type-specific handlers can replace the host or browser fallback.
 *
 * @module
 */
import {
  File as FileIcon,
  FileArchive,
  FileAudio,
  FileChartColumn,
  FileCode,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileType,
  FileVideo,
  type LucideIcon,
} from "lucide-react";
import { useState, useSyncExternalStore, type MouseEvent } from "react";
import { createPortal } from "react-dom";
import type { FileReference } from "../../../attachments";
import { useFileActions } from "./hooks/use-file-actions";
import { useReactPanel } from "../../../hooks";

const FILE_VIEW_CLASS = "rivto-file";
const FILE_ICON_CLASS = "rivto-file-icon";
const FILE_NAME_CLASS = "rivto-file-name";
const FILE_META_CLASS = "rivto-file-meta";
const FILE_OPEN_ERROR_CLASS = "rivto-file-open-error";
const FILE_CONTEXT_MENU_CLASS = "rivto-file-context-menu";

/** Viewport coordinates of the file context menu. */
interface FileContextMenuPosition {
  /** Horizontal viewport coordinate in pixels. */
  readonly x: number;
  /** Vertical viewport coordinate in pixels. */
  readonly y: number;
  /** Document that owns the file and its overlay. */
  readonly document: Document;
}

/**
 * Formats a byte count without pulling in a formatting dependency.
 * @param size - Optional file size in bytes.
 * @returns Compact binary-unit label when a size is present.
 */
function formatFileSize(size: number | undefined): string | undefined {
  if (size === undefined) {
    return undefined;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Chooses an installed Lucide preview icon from portable MIME and filename metadata.
 *
 * MIME types and filename extensions are checked together in category order;
 * extensions cover desktop paths and generic `application/octet-stream` references.
 *
 * @param reference - Persisted portable file metadata.
 * @returns The closest small file-type icon, or the generic file icon.
 */
export function fileTypeIcon({
  name,
  mimeType,
}: Pick<FileReference, "name" | "mimeType">): LucideIcon {
  const mime = mimeType.toLowerCase();
  const extension = name.match(/\.([a-z\d]+)$/i)?.[1]?.toLowerCase() ?? "";
  let Icon = FileIcon;
  if (mime.startsWith("image/") || /^(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/.test(extension)) {
    Icon = FileImage;
  } else if (mime.startsWith("audio/") || /^(?:aac|flac|m4a|mp3|ogg|opus|wav)$/.test(extension)) {
    Icon = FileAudio;
  } else if (mime.startsWith("video/") || /^(?:avi|m4v|mkv|mov|mp4|webm)$/.test(extension)) {
    Icon = FileVideo;
  } else if (mime.includes("json") || extension === "json") {
    Icon = FileJson;
  } else if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    mime === "text/csv" ||
    /^(?:csv|ods|tsv|xls|xlsx)$/.test(extension)
  ) {
    Icon = FileSpreadsheet;
  } else if (mime.includes("presentation") || /^(?:odp|ppt|pptx)$/.test(extension)) {
    Icon = FileChartColumn;
  } else if (
    mime.includes("zip") ||
    mime.includes("compressed") ||
    /^(?:7z|bz2|gz|rar|tar|tgz|xz|zip)$/.test(extension)
  ) {
    Icon = FileArchive;
  } else if (
    mime.includes("javascript") ||
    mime.includes("xml") ||
    /^(?:c|cpp|css|go|h|html?|java|js|jsx|php|py|rb|rs|sh|sql|ts|tsx|vue|xml|ya?ml)$/.test(
      extension,
    )
  ) {
    Icon = FileCode;
  } else if (mime.startsWith("font/") || /^(?:otf|ttf|woff2?)$/.test(extension)) {
    Icon = FileType;
  } else if (
    mime.startsWith("text/") ||
    mime === "application/pdf" ||
    mime.includes("word") ||
    /^(?:docx?|log|md|pdf|rtf|txt)$/.test(extension)
  ) {
    Icon = FileText;
  }
  return Icon;
}

/**
 * Renders an openable icon, filename, and compact metadata.
 *
 * Replacing the URI or copy metadata cancels the pending operation, as does
 * unmounting the view. Opening or copying again cancels the prior operation.
 *
 * @param reference - Persisted URI, filename, MIME type, and optional size.
 * @returns Accessible file chip with double-click and keyboard opening.
 */
export function FileView(reference: FileReference) {
  const [contextMenu, setContextMenu] = useState<FileContextMenuPosition>();
  const actions = useFileActions(reference, () => setContextMenu(undefined));
  // Close the menu before starting the view-owned cancellable open operation.
  const open = () => {
    setContextMenu(undefined);
    actions.open();
  };
  return (
    <>
      <FileTrigger
        reference={reference}
        error={actions.error}
        onOpen={open}
        onContextMenu={(event) => {
          // Use a local menu and clear failures from a previous action.
          event.preventDefault();
          event.stopPropagation();
          actions.clearError();
          setContextMenu({
            x: event.clientX,
            y: event.clientY,
            document: event.currentTarget.ownerDocument,
          });
        }}
      />
      {contextMenu &&
        createPortal(
          <FileContextMenu
            position={contextMenu}
            canCopy={actions.canCopy}
            onOpen={open}
            onCopy={actions.copy}
            onClose={() => setContextMenu(undefined)}
          />,
          contextMenu.document.body,
        )}
    </>
  );
}

/** Display metadata and actions used by the generic file trigger. */
interface FileTriggerProps {
  /** File metadata displayed by the trigger. */
  readonly reference: Pick<FileReference, "name" | "mimeType" | "size">;
  /** Opening or copying failure shown alongside the trigger. */
  readonly error?: string;
  /**
   * Starts opening the represented file.
   *
   * @returns Requests opening from the owning view.
   */
  readonly onOpen: () => void;
  /**
   * Opens the file's context menu at the pointer position.
   *
   * @param event - Context-menu event from the file trigger.
   * @returns Requests the menu from the owning view.
   */
  readonly onContextMenu: (event: MouseEvent<HTMLSpanElement>) => void;
}

/**
 * Renders file metadata and the pointer and keyboard opening gestures.
 *
 * @param props - Metadata, failure feedback, and opening actions.
 * @param props.reference - Filename, MIME type, and optional size.
 * @param props.error - Current opening or copying failure, if any.
 * @param props.onOpen - Requests opening on double-click, Enter, or Space.
 * @param props.onContextMenu - Receives the context-menu event.
 * @returns Accessible interactive file metadata.
 */
function FileTrigger({ reference, error, onOpen, onContextMenu }: FileTriggerProps) {
  const { name, mimeType, size } = reference;
  const formattedSize = formatFileSize(size);
  const TypeIcon = fileTypeIcon(reference);
  return (
    <span
      className={FILE_VIEW_CLASS}
      aria-label={`Open file ${name}`}
      role="button"
      tabIndex={0}
      title="Double-click to open"
      onContextMenu={onContextMenu}
      onDoubleClick={(event) => {
        // Keep the gesture inside the file control while opening the attachment.
        event.preventDefault();
        event.stopPropagation();
        onOpen();
      }}
      onKeyDown={(event) => {
        // Open once per Enter or Space press rather than repeating while held.
        if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          event.stopPropagation();
          onOpen();
        }
      }}
    >
      <TypeIcon className={FILE_ICON_CLASS} aria-hidden="true" size={18} />
      <span className={FILE_NAME_CLASS}>{name}</span>
      <span className={FILE_META_CLASS}>
        {mimeType}
        {formattedSize ? ` · ${formattedSize}` : ""}
      </span>
      {error && (
        <span className={FILE_OPEN_ERROR_CLASS} role="alert">
          {error}
        </span>
      )}
    </span>
  );
}

/** Position and actions for the generic file context menu. */
interface FileContextMenuProps {
  /** Viewport position where the menu is displayed. */
  readonly position: FileContextMenuPosition;
  /** Whether the copy action is available. */
  readonly canCopy: boolean;
  /**
   * Opens the file and closes this menu.
   *
   * @returns Requests opening from the owning view.
   */
  readonly onOpen: () => void;
  /**
   * Copies the file through the clipboard.
   *
   * @returns Requests copying from the owning view.
   */
  readonly onCopy: () => void;
  /**
   * Dismisses this menu.
   *
   * @returns Removes the menu from the owning view.
   */
  readonly onClose: () => void;
}

/**
 * Renders file actions and closes on Escape or focus leaving the menu.
 *
 * @param props - Menu position, clipboard capability, and actions.
 * @param props.position - Viewport coordinates of the menu.
 * @param props.canCopy - Whether a clipboard writer accepts the file type.
 * @param props.onOpen - Opens the represented file.
 * @param props.onCopy - Copies the represented file.
 * @param props.onClose - Dismisses the menu.
 * @returns Accessible file-action menu.
 */
function FileContextMenu({ position, canCopy, onOpen, onCopy, onClose }: FileContextMenuProps) {
  return (
    <span
      className={FILE_CONTEXT_MENU_CLASS}
      role="menu"
      style={{ left: position.x, top: position.y }}
      onBlur={(event) => {
        // Moving focus within the menu does not dismiss it.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        // Escape dismisses the menu without starting an action.
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <button
        type="button"
        role="menuitem"
        ref={(node) => node?.focus({ preventScroll: true })}
        onClick={onOpen}
      >
        Open file
      </button>
      {canCopy && (
        <button type="button" role="menuitem" onClick={onCopy}>
          Copy file
        </button>
      )}
    </span>
  );
}

/** Persisted reference rendered by the selected inline file view. */
export interface RegisteredFileViewProps {
  /** Persisted reference used to choose and render a file view. */
  readonly reference: FileReference;
}

/**
 * Selects a registered rich inline renderer before the generic file chip.
 *
 * Handler registration and removal update an already-mounted view.
 *
 * @param props - Persisted portable file reference.
 * @param props.reference - URI and metadata used to select and render the file.
 * @returns Rich matched view or generic openable fallback.
 */
export function RegisteredFileView({ reference }: RegisteredFileViewProps) {
  const editor = useReactPanel().editor;
  // Re-select the view when handlers are installed, removed, or change default.
  const InlineView = useSyncExternalStore(
    (listener) => editor.clipboard.subscribeFileHandlers(listener),
    () => editor.clipboard.selectFileHandler({ reference })?.InlineView,
    () => editor.clipboard.selectFileHandler({ reference })?.InlineView,
  );
  return InlineView ? <InlineView reference={reference} /> : <FileView {...reference} />;
}
