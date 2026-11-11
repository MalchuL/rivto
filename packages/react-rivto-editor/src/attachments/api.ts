import type { BinaryProvider, FileOpenHandler, FileReference, FileRequestContext } from "./types";

/** Attachment operations available to editor components and extensions. */
export interface AttachmentApi {
  /**
   * Registers a file opener for matching or explicit default selection.
   *
   * Typed handlers always take priority over the fallback, so a later PDF or
   * audio extension can replace generic native opening without registration-order coupling.
   *
   * @param handler - File matcher and opening operation.
   * @returns Disposer that unregisters the handler.
   * @throws If the runtime is inactive or the ID is empty or duplicated.
   */
  registerFileOpenHandler(handler: FileOpenHandler): () => void;

  /**
   * Sets a registered file opener as the default when no opener matches.
   *
   * Selecting another default replaces the previous selection. Removing the
   * selected registration clears it; no earlier selection is restored.
   *
   * @param id - ID of the registered opener to use as the default.
   * @returns Completion of the default selection.
   * @throws If the runtime is inactive or no opener has the supplied ID.
   */
  setDefaultFileOpenHandler(id: string): void;

  /**
   * Resolves a reference through its provider or a browser-readable URI.
   *
   * Use this when a caller can display or inspect either a Blob or a URL, such
   * as an image view. It does not fetch browser-readable URLs or open a file.
   * The provider is consulted first: its Blob is returned directly, while
   * `undefined` means it does not own the reference. Provider failures propagate
   * rather than falling back to the browser. Without a provider result, HTTP(S),
   * data, and blob URLs are returned after validation; relative references are
   * resolved against the configured document base URI.
   *
   * The document ID is captured when this method starts.
   * Cancellation stops waiting for the provider without cancelling its own read.
   *
   * @param provider - Storage provider to consult first, if installed.
   * @param uri - Persisted reference to resolve.
   * @param context - Cancellation signal.
   * @returns A promise resolving to the provider's Blob or a browser-readable URI.
   * @throws If cancelled, the provider fails or returns a non-Blob value, or the
   * unclaimed URI is unsafe, unsupported, or relative without a configured base.
   *
   * @example
   * const source = await editor.attachments.resolveBinary(provider, uri, { signal });
   * // source is a Blob from the provider, or a URL the browser can display.
   */
  resolveBinary(
    provider: BinaryProvider | undefined,
    uri: string,
    context: FileRequestContext,
  ): Promise<string | Blob>;

  /**
   * Reads attachment bytes as a Blob for copying or other byte-based operations.
   *
   * Unlike `resolveBinary`, this always produces bytes: it first resolves the
   * reference, then fetches it if the result is a URL. A provider-supplied Blob
   * is reused unless a different MIME hint was supplied, in which case a new
   * Blob wraps the same bytes with that type. It does not open the file.
   *
   * @param provider - Storage provider to consult first, if installed.
   * @param uri - Persisted reference to read.
   * @param mimeType - Optional MIME type to apply to the returned Blob.
   * @param context - Cancellation signal.
   * @returns A promise resolving to a Blob after resolution and any fetch complete.
   * @throws If resolution, fetching, or response reading fails, or cancellation occurs.
   *
   * @example
   * const bytes = await editor.attachments.readBinary(provider, uri, "image/png", { signal });
   * // bytes is a Blob, including when the provider declined an HTTP URL.
   */
  readBinary(
    provider: BinaryProvider | undefined,
    uri: string,
    mimeType: string | undefined,
    context: FileRequestContext,
  ): Promise<Blob>;

  /**
   * Opens an attachment with a registered host opener or a browser link.
   *
   * Unlike `resolveBinary` and `readBinary`, this performs an opening action
   * and returns no content. The first matching registered opener takes priority,
   * followed by the explicitly selected default opener. A selected opener receives
   * the reference and operation context; the provider is not read in that path.
   * Without an opener, the reference is resolved and a browser link is clicked.
   * Resolved Blobs use an object URL scheduled for revocation after 60 seconds.
   * Cancellation stops waiting for a host opener but cannot stop its own work.
   *
   * @param provider - Storage provider for the attachment.
   * @param reference - Persisted attachment metadata.
   * @param context - Cancellation signal.
   * @returns A promise resolving after the opener completes or browser link is clicked.
   * @throws If cancelled, the host opener fails, or the attachment cannot be resolved.
   *
   * @example
   * await editor.attachments.openBinary(provider, reference, { signal });
   * // The selected host opener has completed, or the browser link was clicked.
   */
  openBinary(
    provider: BinaryProvider,
    reference: FileReference,
    context: FileRequestContext,
  ): Promise<void>;
}
