import { useEffect, useRef, useState, type MouseEvent } from "react";
import type { BinaryProvider } from "../../../../attachments";
import { useReactPanel } from "../../../../hooks";
import { mimeTypeFromExtension } from "../../../file/utils/file-input";

const IMAGE_CONTEXT_MENU_CLASS = "rivto-image-context-menu";

/** Metadata and storage used by the image copy menu. */
interface ImageCopyMenuOptions {
  /** Optional provider used to read the referenced image. */
  readonly provider?: BinaryProvider;
  /** URI or provider reference for the image. */
  readonly uri: string;
  /** Alternative text used when copying the image. */
  readonly alt: string;
  /** Optional filename supplied to the clipboard writer. */
  readonly name?: string;
  /** Optional MIME type hint for the image. */
  readonly mimeType?: string;
}

/** Viewport coordinates at which the image copy menu opens. */
interface ImageCopyMenuPosition {
  /** Horizontal viewport coordinate in pixels. */
  readonly x: number;
  /** Vertical viewport coordinate in pixels. */
  readonly y: number;
}

/** Position, feedback, and actions shown by the image copy menu. */
interface ImageCopyMenuProps {
  /** Viewport position where the menu is displayed. */
  readonly position: ImageCopyMenuPosition;
  /** Copy failure text, when an operation has failed. */
  readonly error?: string;
  /**
   * Starts copying the image through the configured clipboard writer.
   *
   * @returns Requests an image copy from the owning view.
   */
  readonly onCopy: () => void;
  /**
   * Closes the menu after a successful copy, loss of focus, or Escape.
   *
   * @returns Removes the menu from the image frame.
   */
  readonly onClose: () => void;
}

/**
 * Returns the best MIME hint available before asynchronous bytes resolve.
 *
 * @param uri - Image URI, which may embed a type or contain a filename extension.
 * @param mimeType - Persisted MIME type, if known.
 * @returns The persisted, embedded, inferred, or generic binary MIME type.
 */
function copyMimeType(uri: string, mimeType?: string): string {
  if (mimeType && mimeType !== "application/octet-stream") {
    return mimeType;
  }
  const dataType = uri.match(/^data:([^;,]+)/i)?.[1];
  if (dataType) {
    return dataType;
  }
  const extension = uri
    .split(/[?#]/, 1)[0]!
    .match(/\.([a-z\d]+)$/i)?.[1]
    ?.toLowerCase();
  const inferred = mimeTypeFromExtension(extension);
  return inferred.startsWith("image/") ? inferred : "application/octet-stream";
}

/**
 * Supplies a context menu for copying an image when the clipboard supports it.
 *
 * The menu reads image bytes from the configured provider only after the user
 * chooses the copy action; unsupported types retain the browser context menu.
 * A new copy cancels the previous read. Replacing the provider or URI, or
 * unmounting the view, cancels the active read; dismissing the menu does not.
 *
 * @param options - Image metadata and its storage provider.
 * @returns The context-menu event callback and the menu to render in the image frame.
 */
export function useImageCopyMenu(options: ImageCopyMenuOptions) {
  const { editor } = useReactPanel();
  const [position, setPosition] = useState<ImageCopyMenuPosition>();
  const [error, setError] = useState<string>();
  const copyImage = useImageCopy(options, () => setPosition(undefined), setError);

  // Leave the browser menu available when no writer accepts the image type.
  const openCopyMenu = (event: MouseEvent<HTMLSpanElement>): void => {
    if (!editor.clipboard.canWriteBinary(copyMimeType(options.uri, options.mimeType))) {
      return;
    }
    event.preventDefault();
    setError(undefined);
    setPosition({ x: event.clientX, y: event.clientY });
  };

  const menu = position && (
    <ImageCopyMenu
      position={position}
      error={error}
      onCopy={copyImage}
      onClose={() => setPosition(undefined)}
    />
  );
  return { openCopyMenu, menu };
}

/**
 * Binds image copying to the view's current provider and cancellation lifetime.
 *
 * A new copy, provider change, URI change, or view unmount aborts the active read.
 * Closing the menu alone does not cancel a copy already in progress.
 *
 * @param options - Image URI, metadata, and storage provider.
 * @param options.provider - Storage provider used to read logical URIs.
 * @param options.uri - Image URI to copy.
 * @param options.alt - Alternative text used when no filename is available.
 * @param options.name - Optional clipboard filename.
 * @param options.mimeType - Optional persisted MIME type.
 * @param onCopied - Callback invoked after an active copy succeeds.
 * @param onError - Displays a failure from the active copy.
 * @returns A callback that starts copying the image.
 */
function useImageCopy(
  options: ImageCopyMenuOptions,
  onCopied: () => void,
  onError: (error: string) => void,
): () => void {
  const panel = useReactPanel();
  const copyAbort = useRef<AbortController | undefined>(undefined);
  const { provider, uri, alt, name, mimeType } = options;
  // Cancel the active copy when its provider or URI changes or the view unmounts.
  useEffect(() => () => copyAbort.current?.abort(), [provider, uri]);
  // Replace any previous copy and read image bytes only when copying starts.
  return () => {
    copyAbort.current?.abort();
    const controller = new AbortController();
    copyAbort.current = controller;
    const type = copyMimeType(uri, mimeType);
    const data = panel.editor.attachments.readBinary(
      provider,
      uri,
      type === "application/octet-stream" ? undefined : type,
      { signal: controller.signal, mode: panel.getSurfaceType() },
    );
    void panel.editor.clipboard
      .writeBinary({ name: name || alt || "image", mimeType: type, data })
      // Only the active successful copy may close the current menu.
      .then((copied) => {
        if (controller.signal.aborted) {
          return;
        }
        if (copied) {
          onCopied();
        } else {
          onError("This clipboard cannot copy this image type");
        }
      })
      // Ignore failures from copies cancelled by replacement or unmounting.
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) {
          onError(reason instanceof Error ? reason.message : "Unable to copy image");
        }
      });
  };
}

/**
 * Displays the copy action and reports failures until the menu closes.
 *
 * @param props - Menu position, feedback, and callbacks.
 * @param props.position - Viewport coordinates of the context menu.
 * @param props.error - Current copy failure, if any.
 * @param props.onCopy - Starts copying the image.
 * @param props.onClose - Closes the menu after dismissal or successful copying.
 * @returns The accessible image copy menu.
 */
function ImageCopyMenu({ position, error, onCopy, onClose }: ImageCopyMenuProps) {
  return (
    <span
      className={IMAGE_CONTEXT_MENU_CLASS}
      role="menu"
      style={{ left: position.x, top: position.y }}
      onBlur={(event) => {
        // Moving focus within the menu does not dismiss it.
        if (!event.currentTarget.contains(event.relatedTarget)) {
          onClose();
        }
      }}
      onKeyDown={(event) => {
        // Escape dismisses the menu without starting a copy.
        if (event.key === "Escape") {
          onClose();
        }
      }}
    >
      <button type="button" role="menuitem" autoFocus onClick={onCopy}>
        Copy image
      </button>
      {error && <span role="alert">{error}</span>}
    </span>
  );
}
