import type { ReactEditorApi } from "../editor/types";
import { validateBinaryUri } from "./utils";
import type { RegistrationOwner } from "../managers/extensions/types";
import type {
  AttachmentOptions,
  FileOpenHandler,
  FileReference,
  BinaryProvider,
  FileRequestContext,
} from "./types";

/** Editor capabilities borrowed while resolving or opening attachments. */
interface AttachmentEditor extends Pick<ReactEditorApi, "getDocument"> {
  /** Active and default panel lookup used to determine the surface mode. */
  readonly panels: Pick<ReactEditorApi["panels"], "getActive" | "getDefault">;
}

/** Manages attachment handlers, file opening, and URI resolution. */
export class AttachmentManager {
  private readonly openHandlers: FileOpenHandler[] = [];
  private defaultOpenHandler?: FileOpenHandler;

  /**
   * Configures attachment URI resolution and extension-owned file openers.
   *
   * @param editor - Document identity and panel context used by binary operations.
   * @param registrations - Owner that guards and disposes registrations.
   * @param options - Relative URI resolution configuration.
   */
  constructor(
    private readonly editor: AttachmentEditor,
    private readonly registrations: RegistrationOwner,
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
   * Relative references use the configured document base URI; provider errors propagate.
   *
   * @param provider - Storage provider to consult first, if installed.
   * @param uri - Persisted reference to resolve.
   * @param context - Surface and cancellation signal for the request.
   * @returns A promise resolving to a Blob or browser-readable URI.
   * @throws If cancelled, the provider fails, or the URI cannot be safely resolved.
   */
  async resolveBinary(
    provider: BinaryProvider<string, Blob> | undefined,
    uri: string,
    context: FileRequestContext,
  ): Promise<string | Blob> {
    context.signal.throwIfAborted();
    const complete = {
      signal: context.signal,
      documentId: this.editor.getDocument().id,
      mode:
        context.mode ??
        this.editor.panels.getActive()?.getSurfaceType() ??
        this.editor.panels.getDefault()?.getSurfaceType() ??
        ("block" as const),
    };
    const resolved = await provider?.read(uri, complete);
    context.signal.throwIfAborted();
    if (resolved !== undefined) {
      if (!(resolved instanceof Blob)) {
        throw new TypeError("Binary provider must return a Blob");
      }
      return resolved;
    }
    const value = validateBinaryUri(uri);
    if (/^https?:/i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) {
      return value;
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
      throw new TypeError(`No binary provider accepted ${value.split(":", 1)[0]}:`);
    }
    const configured = this.options.documentBaseUri;
    const base = typeof configured === "function" ? configured(complete.documentId) : configured;
    if (!base) {
      throw new TypeError("Relative file URI requires attachments.documentBaseUri or a provider");
    }
    return validateBinaryUri(new URL(value, base).href);
  }

  /**
   * Reads attachment bytes for copying or host opening.
   *
   * Browser-readable references are fetched and the MIME hint is applied when supplied.
   *
   * @param provider - Storage provider to consult first, if installed.
   * @param uri - Persisted reference to read.
   * @param mimeType - Optional MIME type for the resulting Blob.
   * @param context - Surface and cancellation signal for the request.
   * @returns A promise resolving to the attachment bytes.
   * @throws If resolution or fetching fails or the request is cancelled.
   */
  async readBinary(
    provider: BinaryProvider<string, Blob> | undefined,
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
   * Resolved Blobs use an object URL that is revoked after the link is opened.
   *
   * @param provider - Storage provider for the attachment.
   * @param reference - Persisted attachment metadata.
   * @param context - Surface and cancellation signal for the request.
   * @returns A promise resolving after the opener completes or browser link is clicked.
   * @throws If cancelled, the host opener fails, or the attachment cannot be resolved.
   */
  async openBinary(
    provider: BinaryProvider<string, Blob>,
    reference: FileReference,
    context: FileRequestContext,
  ): Promise<void> {
    context.signal.throwIfAborted();
    const complete = {
      signal: context.signal,
      documentId: this.editor.getDocument().id,
      mode:
        context.mode ??
        this.editor.panels.getActive()?.getSurfaceType() ??
        this.editor.panels.getDefault()?.getSurfaceType() ??
        ("block" as const),
    };
    const handler = this.selectFileOpenHandler(reference);
    if (handler) {
      await handler.open(reference, complete);
      return;
    }
    const resolved = await this.resolveBinary(provider, reference.uri, context);
    const objectUrl = resolved instanceof Blob ? URL.createObjectURL(resolved) : undefined;
    const link = document.createElement("a");
    link.href = typeof resolved === "string" ? resolved : objectUrl!;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  }
}
