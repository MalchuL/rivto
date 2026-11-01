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
import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import type { FileReference } from "../../attachments";
import { useReactPanel } from "../../hooks";

const FILE_VIEW_CLASS = "rivto-file";
const FILE_ICON_CLASS = "rivto-file-icon";
const FILE_NAME_CLASS = "rivto-file-name";
const FILE_META_CLASS = "rivto-file-meta";
const FILE_OPEN_ERROR_CLASS = "rivto-file-open-error";
const FILE_CONTEXT_MENU_CLASS = "rivto-file-context-menu";

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
 * MIME is authoritative when specific; extensions cover desktop paths and
 * generic `application/octet-stream` references without adding a MIME database.
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
 * @param props - Persisted portable file reference.
 * @returns Accessible file chip with double-click and keyboard opening.
 */
export function FileView(reference: FileReference) {
  const { name, mimeType, size } = reference;
  const reactPanel = useReactPanel();
  const editor = reactPanel.editor;
  const opening = useRef<AbortController | undefined>(undefined);
  const [openError, setOpenError] = useState<string>();
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number }>();
  const formattedSize = formatFileSize(size);
  const TypeIcon = fileTypeIcon(reference);
  const canCopy = editor.clipboard.canWriteBinary(mimeType);

  useEffect(() => () => opening.current?.abort(), []);

  /**
   * Opens the file through its provider and reports asynchronous failures in the menu.
   *
   * @returns Starts opening the file and cancels any previous operation.
   */
  const open = (): void => {
    opening.current?.abort();
    const controller = new AbortController();
    opening.current = controller;
    setOpenError(undefined);
    setContextMenu(undefined);
    const provider = editor.clipboard.getFileHandler("file")?.provider;
    if (!provider) {
      setOpenError("No file provider is installed");
      return;
    }
    void editor.attachments
      .openBinary(provider, reference, {
        signal: controller.signal,
        mode: reactPanel.getSurfaceType(),
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setOpenError(reason instanceof Error ? reason.message : "Unable to open file");
        }
      });
  };

  /**
   * Copies the file bytes through the clipboard and reports asynchronous failures.
   *
   * @returns Starts copying the file and cancels any previous operation.
   */
  const copy = (): void => {
    opening.current?.abort();
    const controller = new AbortController();
    opening.current = controller;
    setOpenError(undefined);
    const data = editor.attachments.readBinary(
      editor.clipboard.getFileHandler("file")?.provider,
      reference.uri,
      mimeType,
      {
        signal: controller.signal,
        mode: reactPanel.getSurfaceType(),
      },
    );
    void editor.clipboard
      .writeBinary({ name, mimeType, data })
      .then((copied) => {
        if (copied) {
          setContextMenu(undefined);
        } else {
          setOpenError("This clipboard cannot copy this file type");
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          setOpenError(reason instanceof Error ? reason.message : "Unable to copy file");
        }
      });
  };

  /** Handles the explicit pointer gesture without changing single-click selection. */
  const handleDoubleClick = (event: MouseEvent<HTMLSpanElement>): void => {
    event.preventDefault();
    event.stopPropagation();
    open();
  };

  /** Provides the keyboard equivalent of the double-click gesture. */
  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>): void => {
    if (!event.repeat && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      event.stopPropagation();
      open();
    }
  };

  return (
    <>
      <span
        className={FILE_VIEW_CLASS}
        aria-label={`Open file ${name}`}
        role="button"
        tabIndex={0}
        title="Double-click to open"
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpenError(undefined);
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
        onDoubleClick={handleDoubleClick}
        onKeyDown={handleKeyDown}
      >
        <TypeIcon className={FILE_ICON_CLASS} aria-hidden="true" size={18} />
        <span className={FILE_NAME_CLASS}>{name}</span>
        <span className={FILE_META_CLASS}>
          {mimeType}
          {formattedSize ? ` · ${formattedSize}` : ""}
        </span>
        {openError && (
          <span className={FILE_OPEN_ERROR_CLASS} role="alert">
            {openError}
          </span>
        )}
      </span>
      {contextMenu && (
        <span
          className={FILE_CONTEXT_MENU_CLASS}
          role="menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setContextMenu(undefined);
            }
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setContextMenu(undefined);
            }
          }}
        >
          <button type="button" role="menuitem" autoFocus onClick={open}>
            Open file
          </button>
          {canCopy && (
            <button type="button" role="menuitem" onClick={copy}>
              Copy file
            </button>
          )}
        </span>
      )}
    </>
  );
}

/**
 * Selects a registered rich inline renderer before the generic file chip.
 * @param props - Persisted portable file reference.
 * @returns Rich matched view or generic openable fallback.
 */
export function RegisteredFileView({ reference }: { readonly reference: FileReference }) {
  const editor = useReactPanel().editor;
  const InlineView = editor.clipboard.selectFileHandler({ reference })?.InlineView;
  return InlineView ? <InlineView reference={reference} /> : <FileView {...reference} />;
}
