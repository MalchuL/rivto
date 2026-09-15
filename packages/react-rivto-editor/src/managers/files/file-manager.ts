/**
 * Browser-safe file storage and logical-URI resolution pipeline.
 *
 * Hosts may replace the bounded data-URL fallback with one durable uploader,
 * compose URI postprocessors, and register readers for local/custom schemes.
 * The manager owns registration lifecycle only; persisted references remain
 * ordinary strings in block or element properties.
 *
 * @module
 */
import type { EditorMode } from "@chulane/rivto";
import type { ComponentType } from "react";
import type { ReactEditorImpl } from "../../react-editor";

/** Default per-file limit used by the built-in data-URL fallback. */
export const DEFAULT_FILE_MAX_BYTES = 10 * 1024 * 1024;

/** User action and destination supplied to storage integrations. */
export interface FileOperationContext {
  readonly documentId: string;
  readonly mode: EditorMode;
  readonly source: "clipboard" | "drop" | "picker";
  readonly destination: "inline" | "block" | "element";
  readonly signal: AbortSignal;
  readonly reportProgress?: (progress: number) => void;
}

/** One host-owned durable file writer. */
export interface FileUploadHandler {
  readonly id: string;
  readonly maxBytes?: number;
  readonly upload: (
    file: File,
    context: FileOperationContext,
  ) => string | undefined | Promise<string | undefined>;
}

/** Ordered rewrite applied to every freshly uploaded URI. */
export interface FileUriPostprocessor {
  readonly id: string;
  readonly process: (
    uri: string,
    file: File,
    context: FileOperationContext,
  ) => string | Promise<string>;
}

/** Ordered reader for persisted URIs not directly usable by an image element. */
export interface FileUriResolver {
  readonly id: string;
  readonly resolve: (
    uri: string,
    context: Omit<FileOperationContext, "source" | "destination" | "reportProgress">,
  ) => string | Blob | undefined | Promise<string | Blob | undefined>;
}

/** Creation-time defaults for the file pipeline. */
export interface FileManagerOptions {
  readonly dataUrlMaxBytes?: number;
  readonly documentBaseUri?: string | ((documentId: string) => string | undefined);
}

/** Stable metadata persisted by every uploaded or referenced file type. */
export interface FileReference {
  readonly uri: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: number;
}

/** Placement selected before asynchronous file preparation starts. */
export type FilePasteDestination = "inline" | "block" | "element";

/** Candidate supplied to ordered rich-file handlers. */
export interface FilePasteCandidate {
  readonly file?: File;
  readonly reference: FileReference;
}

/** Props supplied to a registered first-class canvas file renderer. */
export interface FileElementViewProps {
  readonly id: string;
  readonly props: Record<string, unknown>;
}

/** Props supplied to a registered inline file renderer. */
export interface FileInlineViewProps {
  readonly reference: FileReference;
}

/** Handler-produced representations committed by the shared file extension. */
export interface PreparedFilePaste {
  readonly inline: string;
  readonly block: { readonly type: string; readonly props: Record<string, unknown> };
  readonly element: {
    readonly type: string;
    readonly props: Record<string, unknown>;
    readonly width: number;
    readonly height: number;
  };
}

/** Ordered media-specific preparation and optional canvas presentation. */
export interface FilePasteHandler {
  readonly id: string;
  /** First-class element discriminator rendered by this handler, when any. */
  readonly elementType?: string;
  /** Omit only for the single default handler consulted after every matcher. */
  readonly matches?: (candidate: FilePasteCandidate) => boolean;
  readonly prepare: (
    candidate: FilePasteCandidate,
    context: Pick<FileOperationContext, "destination" | "signal">,
  ) => PreparedFilePaste | Promise<PreparedFilePaste>;
  readonly ElementView?: ComponentType<FileElementViewProps>;
  readonly InlineView?: ComponentType<FileInlineViewProps>;
}

/** Runtime context supplied when a host opens one persisted file reference. */
export interface FileOpenContext {
  readonly documentId: string;
  readonly mode: EditorMode;
  readonly signal: AbortSignal;
}

/** Ordered type-specific opener or matcher-less host fallback. */
export interface FileOpenHandler {
  readonly id: string;
  /** Omit only for the single fallback consulted after every typed matcher. */
  readonly matches?: (reference: FileReference) => boolean;
  readonly open: (reference: FileReference, context: FileOpenContext) => void | Promise<void>;
}

/** Public file pipeline exposed by one React editor. */
export interface FilesCapability {
  registerUploadHandler(handler: FileUploadHandler): () => void;
  registerPostprocessor(postprocessor: FileUriPostprocessor): () => void;
  registerUriResolver(resolver: FileUriResolver): () => void;
  registerPasteHandler(handler: FilePasteHandler): () => void;
  registerOpenHandler(handler: FileOpenHandler): () => void;
  preparePaste(candidate: FilePasteCandidate, context: Pick<FileOperationContext, "destination" | "signal">): Promise<PreparedFilePaste>;
  getElementView(type: string): ComponentType<FileElementViewProps> | undefined;
  getInlineView(reference: FileReference): ComponentType<FileInlineViewProps> | undefined;
  upload(file: File, context: Omit<FileOperationContext, "documentId" | "mode">): Promise<string>;
  resolve(uri: string, context: Pick<FileOperationContext, "signal">): Promise<string | Blob>;
  read(uri: string, mimeType: string | undefined, context: Pick<FileOperationContext, "signal">): Promise<Blob>;
  open(reference: FileReference, context: Pick<FileOpenContext, "signal">): Promise<void>;
}

/** Reads a browser File as a data URL. */
function readDataUrl(file: File, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const reader = new FileReader();
    const abort = () => reader.abort();
    signal.addEventListener("abort", abort, { once: true });
    reader.addEventListener("load", () => resolve(String(reader.result)), { once: true });
    reader.addEventListener("error", () => reject(reader.error ?? new Error("Unable to read file")), { once: true });
    reader.addEventListener("abort", () => reject(signal.reason ?? new DOMException("Aborted", "AbortError")), { once: true });
    reader.addEventListener("loadend", () => signal.removeEventListener("abort", abort), { once: true });
    reader.readAsDataURL(file);
  });
}

/** Validates a handler-specific byte limit. */
function assertWithinLimit(file: File, handlerId: string, configured?: number): void {
  const maxBytes = configured ?? DEFAULT_FILE_MAX_BYTES;
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new TypeError(`File handler ${handlerId} maxBytes must be a positive integer`);
  }
  if (file.size > maxBytes) {
    throw new RangeError(
      `${file.name || "File"} exceeds the ${maxBytes}-byte limit for file handler ${handlerId}; change its maxBytes option to allow larger files`,
    );
  }
}

/** Rejects empty or unsafe resolved browser source strings. */
function validateResolvedUri(uri: string): string {
  const value = uri.trim();
  if (!value || /^(?:javascript|vbscript):/i.test(value)) {
    throw new TypeError("File resolver returned an unsafe URI");
  }
  return value;
}

/** Owns upload, rewrite, and read hooks for one React editor runtime. */
export class FileManager implements FilesCapability {
  private uploadHandler?: FileUploadHandler;
  private readonly postprocessors: FileUriPostprocessor[] = [];
  private readonly resolvers: FileUriResolver[] = [];
  private readonly pasteHandlers: FilePasteHandler[] = [];
  private defaultPasteHandler?: FilePasteHandler;
  private readonly openHandlers: FileOpenHandler[] = [];
  private defaultOpenHandler?: FileOpenHandler;

  /**
   * Creates the file pipeline.
   *
   * @param reactEditor - Runtime supplying lifecycle, document, and mode state.
   * @param options - Data fallback limit and relative-URI base configuration.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    private readonly options: FileManagerOptions = {},
  ) {}

  /** Registers the single host uploader. */
  registerUploadHandler(handler: FileUploadHandler): () => void {
    this.reactEditor.extensions.assertActive();
    if (!handler.id.trim()) throw new Error("File upload handler ID is required");
    if (this.uploadHandler) throw new Error(`File upload handler ${this.uploadHandler.id} is already registered`);
    this.uploadHandler = handler;
    return this.reactEditor.extensions.own(() => {
      if (this.uploadHandler === handler) this.uploadHandler = undefined;
    });
  }

  /** Registers one ordered uploaded-URI rewrite. */
  registerPostprocessor(postprocessor: FileUriPostprocessor): () => void {
    this.reactEditor.extensions.assertActive();
    if (!postprocessor.id.trim() || this.postprocessors.some(({ id }) => id === postprocessor.id)) {
      throw new Error(`File postprocessor ${postprocessor.id || "<empty>"} is already registered`);
    }
    this.postprocessors.push(postprocessor);
    return this.reactEditor.extensions.own(() => {
      const index = this.postprocessors.indexOf(postprocessor);
      if (index >= 0) this.postprocessors.splice(index, 1);
    });
  }

  /** Registers one first-match logical-URI reader. */
  registerUriResolver(resolver: FileUriResolver): () => void {
    this.reactEditor.extensions.assertActive();
    if (!resolver.id.trim() || this.resolvers.some(({ id }) => id === resolver.id)) {
      throw new Error(`File URI resolver ${resolver.id || "<empty>"} is already registered`);
    }
    this.resolvers.push(resolver);
    return this.reactEditor.extensions.own(() => {
      const index = this.resolvers.indexOf(resolver);
      if (index >= 0) this.resolvers.splice(index, 1);
    });
  }

  /**
   * Registers one rich matcher or the single matcher-less default handler.
   * @param handler - File preparation and optional canvas view registration.
   * @returns Lifecycle-owned disposer.
   */
  registerPasteHandler(handler: FilePasteHandler): () => void {
    this.reactEditor.extensions.assertActive();
    if (
      !handler.id.trim()
      || this.pasteHandlers.some(({ id }) => id === handler.id)
      || (handler.elementType && this.pasteHandlers.some(({ elementType }) => elementType === handler.elementType))
    ) {
      throw new Error(`File paste handler or element type ${handler.id || "<empty>"} is already registered`);
    }
    if (!handler.matches && this.defaultPasteHandler) {
      throw new Error(`Default file paste handler ${this.defaultPasteHandler.id} is already registered`);
    }
    this.pasteHandlers.push(handler);
    if (!handler.matches) this.defaultPasteHandler = handler;
    return this.reactEditor.extensions.own(() => {
      const index = this.pasteHandlers.indexOf(handler);
      if (index >= 0) this.pasteHandlers.splice(index, 1);
      if (this.defaultPasteHandler === handler) this.defaultPasteHandler = undefined;
    });
  }

  /**
   * Registers one type-specific opener or the single matcher-less host fallback.
   *
   * Typed handlers always take priority over the fallback, so a later PDF or
   * audio extension can replace generic native opening without registration-order coupling.
   *
   * @param handler - File matcher and opening operation.
   * @returns Lifecycle-owned disposer.
   */
  registerOpenHandler(handler: FileOpenHandler): () => void {
    this.reactEditor.extensions.assertActive();
    if (!handler.id.trim() || this.openHandlers.some(({ id }) => id === handler.id)) {
      throw new Error(`File open handler ${handler.id || "<empty>"} is already registered`);
    }
    if (!handler.matches && this.defaultOpenHandler) {
      throw new Error(`Default file open handler ${this.defaultOpenHandler.id} is already registered`);
    }
    this.openHandlers.push(handler);
    if (!handler.matches) this.defaultOpenHandler = handler;
    return this.reactEditor.extensions.own(() => {
      const index = this.openHandlers.indexOf(handler);
      if (index >= 0) this.openHandlers.splice(index, 1);
      if (this.defaultOpenHandler === handler) this.defaultOpenHandler = undefined;
    });
  }

  /**
   * Prepares one file with the first matching rich handler, then the default.
   * @param candidate - Stored reference and optional browser File.
   * @param context - Destination and cancellation signal.
   * @returns Handler-produced persisted representations.
   */
  async preparePaste(
    candidate: FilePasteCandidate,
    context: Pick<FileOperationContext, "destination" | "signal">,
  ): Promise<PreparedFilePaste> {
    context.signal.throwIfAborted();
    const handler = this.pasteHandlers.find((entry) => entry.matches?.(candidate))
      ?? this.defaultPasteHandler;
    if (!handler) throw new TypeError(`No file paste handler accepted ${candidate.reference.name}`);
    return handler.prepare(candidate, context);
  }

  /**
   * Returns a registered renderer for one handler-owned element type.
   * @param type - Persisted first-class element discriminator.
   * @returns Registered React view, when the type is active.
   */
  getElementView(type: string): ComponentType<FileElementViewProps> | undefined {
    return this.pasteHandlers.find((handler) => handler.ElementView && handler.elementType === type)?.ElementView;
  }

  /**
   * Returns the first active inline renderer matching persisted metadata.
   * @param reference - Portable file metadata.
   * @returns Registered inline React view, when one matches.
   */
  getInlineView(reference: FileReference): ComponentType<FileInlineViewProps> | undefined {
    return this.pasteHandlers.find((handler) => handler.InlineView && handler.matches?.({ reference }))?.InlineView;
  }

  /** Uploads one file and passes its logical URI through every postprocessor. */
  async upload(
    file: File,
    context: Omit<FileOperationContext, "documentId" | "mode">,
  ): Promise<string> {
    context.signal.throwIfAborted();
    const complete = {
      ...context,
      documentId: this.reactEditor.editor.document.id,
      mode: this.reactEditor.editor.mode.get(),
    } satisfies FileOperationContext;
    const handler = this.uploadHandler;
    const handlerId = handler?.id ?? "data-url";
    assertWithinLimit(file, handlerId, handler?.maxBytes ?? this.options.dataUrlMaxBytes);
    const uploaded = handler ? await handler.upload(file, complete) : undefined;
    let uri = uploaded === undefined ? await readDataUrl(file, complete.signal) : uploaded;
    for (const postprocessor of this.postprocessors) {
      complete.signal.throwIfAborted();
      uri = await postprocessor.process(validateResolvedUri(uri), file, complete);
    }
    return validateResolvedUri(uri);
  }

  /** Resolves one persisted logical URI to a browser URL or Blob. */
  async resolve(uri: string, context: Pick<FileOperationContext, "signal">): Promise<string | Blob> {
    context.signal.throwIfAborted();
    const complete = {
      signal: context.signal,
      documentId: this.reactEditor.editor.document.id,
      mode: this.reactEditor.editor.mode.get(),
    };
    for (const resolver of this.resolvers) {
      complete.signal.throwIfAborted();
      const resolved = await resolver.resolve(uri, complete);
      if (resolved instanceof Blob) return resolved;
      if (typeof resolved === "string") return validateResolvedUri(resolved);
    }
    const value = uri.trim();
    if (/^https?:/i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) return validateResolvedUri(value);
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
      throw new TypeError(`No file URI resolver accepted ${value.split(":", 1)[0]}:`);
    }
    const configured = this.options.documentBaseUri;
    const base = typeof configured === "function" ? configured(complete.documentId) : configured;
    if (!base) throw new TypeError("Relative file URI requires files.documentBaseUri or a registered resolver");
    return validateResolvedUri(new URL(value, base).href);
  }

  /**
   * Resolves one logical URI to bytes and restores its persisted MIME type.
   * @param uri - Persisted logical URI.
   * @param mimeType - Persisted MIME type override, when known.
   * @param context - Cancellation signal.
   * @returns Resolved byte blob.
   */
  async read(uri: string, mimeType: string | undefined, context: Pick<FileOperationContext, "signal">): Promise<Blob> {
    const resolved = await this.resolve(uri, context);
    let blob: Blob;
    if (resolved instanceof Blob) {
      blob = resolved;
    } else {
      const response = await fetch(resolved, { signal: context.signal });
      if (!response.ok) throw new Error(`Unable to read file: ${response.status}`);
      blob = await response.blob();
    }
    return !mimeType || blob.type === mimeType ? blob : new Blob([blob], { type: mimeType });
  }

  /**
   * Opens one file through the first matching typed handler, then the host fallback.
   *
   * Without a registered handler, browser-addressable files open in a new tab.
   * Blob-backed sources are revoked after the browser has had time to consume them.
   *
   * @param reference - Persisted file metadata to open.
   * @param context - Cancellation signal owned by the invoking view.
   * @returns A promise that settles once opening has been dispatched.
   */
  async open(reference: FileReference, context: Pick<FileOpenContext, "signal">): Promise<void> {
    context.signal.throwIfAborted();
    const complete: FileOpenContext = {
      ...context,
      documentId: this.reactEditor.editor.document.id,
      mode: this.reactEditor.editor.mode.get(),
    };
    const handler = this.openHandlers.find((entry) => entry.matches?.(reference))
      ?? this.defaultOpenHandler;
    if (handler) {
      await handler.open(reference, complete);
      return;
    }
    const resolved = await this.resolve(reference.uri, context);
    const objectUrl = resolved instanceof Blob ? URL.createObjectURL(resolved) : undefined;
    const source = resolved instanceof Blob ? objectUrl! : resolved;
    const link = document.createElement("a");
    link.href = source;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.click();
    if (objectUrl) window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
  }
}
