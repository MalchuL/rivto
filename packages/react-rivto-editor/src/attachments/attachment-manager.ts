import type { ReactEditorApi } from "../editor/types";
import { validateBinaryUri } from "./utils";
import type { RegistrationOwner } from "../managers/extensions/types";
import type {
  AttachmentOptions,
  FileOpenHandler,
  FileReference,
  BinaryProvider,
  BinaryReadContext,
  DocumentBaseUri,
  FileRequestContext,
} from "./types";

/** Editor capabilities borrowed while resolving or opening attachments. */
interface AttachmentEditor {
  /**
   * Reads the current editor's borrowed document.
   *
   * @returns The document whose identity is used for binary operations.
   */
  readonly getDocument: ReactEditorApi["getDocument"];
}

/** Manages attachment handlers, file opening, and URI resolution. */
export class AttachmentManager {
  /** Registered openers in their matching order. */
  private readonly openHandlers: FileOpenHandler[] = [];
  /** Explicit fallback when no opener matches. */
  private defaultOpenHandler?: FileOpenHandler;

  /**
   * Configures attachment URI resolution and extension-owned file openers.
   *
   * @param editor - Document identity used by binary operations.
   * @param registrations - Owner that guards and disposes registrations.
   * @param options - Relative URI resolution configuration.
   */
  constructor(
    /** Borrowed document identity. */
    private readonly editor: AttachmentEditor,
    /** Owner responsible for guarding and cleaning up registrations. */
    private readonly registrations: RegistrationOwner,
    /** Relative URI resolution configuration. */
    private readonly options: AttachmentOptions = {},
  ) {}

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
  registerFileOpenHandler(handler: FileOpenHandler): () => void {
    this.registrations.assertActive();
    if (!handler.id.trim() || this.openHandlers.some(({ id }) => id === handler.id)) {
      throw new Error(`File open handler ${handler.id || "<empty>"} is already registered`);
    }
    this.openHandlers.push(handler);
    // Unregistration also clears this handler if it was selected as the fallback.
    return this.registrations.registerCleanup(() => {
      const index = this.openHandlers.indexOf(handler);
      if (index >= 0) {
        this.openHandlers.splice(index, 1);
      }
      if (this.defaultOpenHandler === handler) {
        this.defaultOpenHandler = undefined;
      }
    });
  }

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
  setDefaultFileOpenHandler(id: string): void {
    this.registrations.assertActive();
    const handler = this.openHandlers.find((entry) => entry.id === id);
    if (!handler) {
      throw new Error(`File open handler ${id} is not registered`);
    }
    this.defaultOpenHandler = handler;
  }

  /**
   * Finds the first registered opener that accepts a file reference.
   *
   * @param reference - Attachment to open.
   * @returns Matching opener, the registered fallback, or undefined when neither exists.
   */
  selectFileOpenHandler(reference: FileReference): FileOpenHandler | undefined {
    return (
      this.openHandlers.find(
        (entry) => entry !== this.defaultOpenHandler && entry.matches?.(reference),
      ) ?? this.defaultOpenHandler
    );
  }

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
   * Cancellation is checked before and after the provider's asynchronous read.
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
  async resolveBinary(
    provider: BinaryProvider | undefined,
    uri: string,
    context: FileRequestContext,
  ): Promise<string | Blob> {
    context.signal.throwIfAborted();
    const operationContext = this.getFileOperationContext(context);
    const resolved = await provider?.read(uri, operationContext);
    context.signal.throwIfAborted();
    let source: string | Blob;
    if (resolved !== undefined) {
      if (!(resolved instanceof Blob)) {
        throw new TypeError("Binary provider must return a Blob");
      }
      source = resolved;
    } else {
      // A provider can decline a reference without declining browser-accessible URLs.
      const value = validateBinaryUri(uri);
      if (/^https?:/i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) {
        source = value;
      } else {
        // Other explicit schemes, such as bibo:, must be resolved by the provider.
        if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
          throw new TypeError(`No binary provider accepted ${value.split(":", 1)[0]}:`);
        }
        // The option can be a fixed base, a document-specific lookup, or absent.
        const configured: DocumentBaseUri | undefined = this.options.documentBaseUri;
        // A lookup can also return undefined when this document has no base.
        const base: string | undefined =
          typeof configured === "function" ? configured(operationContext.documentId) : configured;
        if (!base) {
          throw new TypeError(
            "Relative file URI requires attachments.documentBaseUri or a provider",
          );
        }
        source = validateBinaryUri(new URL(value, base).href);
      }
    }
    return source;
  }

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
  async readBinary(
    provider: BinaryProvider | undefined,
    uri: string,
    mimeType: string | undefined,
    context: FileRequestContext,
  ): Promise<Blob> {
    const resolved = await this.resolveBinary(provider, uri, context);
    let blob: Blob;
    if (resolved instanceof Blob) {
      blob = resolved;
    } else {
      const response = await fetch(resolved, { signal: context.signal });
      if (!response.ok) {
        throw new Error(`Unable to read file: ${response.status}`);
      }
      blob = await response.blob();
    }
    return !mimeType || blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  }

  /**
   * Opens an attachment with a registered host opener or a browser link.
   *
   * Unlike `resolveBinary` and `readBinary`, this performs an opening action
   * and returns no content. The first matching registered opener takes priority,
   * followed by the explicitly selected default opener. A selected opener receives
   * the reference and operation context; the provider is not read in that path.
   * Without an opener, the reference is resolved and a browser link is clicked.
   * Resolved Blobs use an object URL scheduled for revocation after 60 seconds.
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
  async openBinary(
    provider: BinaryProvider,
    reference: FileReference,
    context: FileRequestContext,
  ): Promise<void> {
    context.signal.throwIfAborted();
    const operationContext = this.getFileOperationContext(context);
    const handler = this.selectFileOpenHandler(reference);
    if (handler) {
      await handler.open(reference, operationContext);
    } else {
      // Fall back to browser navigation when no host opener is selected.
      const resolved = await this.resolveBinary(provider, reference.uri, context);
      const objectUrl = resolved instanceof Blob ? URL.createObjectURL(resolved) : undefined;
      const link = document.createElement("a");
      link.href = typeof resolved === "string" ? resolved : objectUrl!;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.click();
      if (objectUrl) {
        // Give the browser time to open provider bytes before revoking their URL.
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
      }
    }
  }

  /**
   * Captures document identity and cancellation for one binary operation.
   *
   * The supplied cancellation signal is retained.
   *
   * @param context - Caller-provided cancellation signal.
   * @returns Document and cancellation context for the operation.
   */
  private getFileOperationContext(context: FileRequestContext): BinaryReadContext {
    return {
      signal: context.signal,
      documentId: this.editor.getDocument().id,
    };
  }
}
