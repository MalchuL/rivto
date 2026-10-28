/**
 * Browser-safe file storage and logical-URI resolution pipeline.
 *
 * Attachment handlers select their binary provider before writing, and resolve
 * existing references through their owning provider or browser URL handling.
 * The manager owns registration lifecycle only; persisted references remain
 * ordinary strings in block or element properties.
 *
 * @module
 */
import type { BinaryProvider, BinaryWriteContext } from "./binary-provider";
import type { EditorMode } from "@chulane/rivto";
import type { ComponentType } from "react";
import type { ReactEditorApi } from "../../editor/types";
import type { RegistrationOwner } from "../extensions/types";

/** User action and destination supplied to storage integrations. */
export interface FileOperationContext {
  readonly documentId: string;
  readonly mode: EditorMode;
  readonly source: "clipboard" | "drop" | "picker";
  readonly destination: "inline" | "block" | "element";
  readonly signal: AbortSignal;
  readonly reportProgress?: (progress: number) => void;
}

/** Creation-time defaults for the file pipeline. */
export interface FileManagerOptions {
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
  readonly provider: BinaryProvider<string, Blob>;
  /** First-class element discriminator rendered by this handler, when any. */
  readonly elementType?: string;
  /** Omit only for the single default handler consulted after every matcher. */
  readonly matches?: (candidate: FilePasteCandidate) => boolean;
  readonly prepare: (
    candidate: FilePasteCandidate,
    context: Pick<FileOperationContext, "destination" | "signal"> & { readonly mode?: EditorMode },
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

/** Context captured from the receiving surface for asynchronous file work. */
export interface FileRequestContext {
  readonly signal: AbortSignal;
  readonly mode?: EditorMode;
  readonly providerId?: string;
}

/** Public file pipeline exposed by one React editor. */
export interface FilesCapability {
  /** Registers a file presentation handler. @param handler - Handler to install. @returns Owned disposer. */
  registerPasteHandler(handler: FilePasteHandler): () => void;
  /** Registers a file opener. @param handler - Opener to install. @returns Owned disposer. */
  registerOpenHandler(handler: FileOpenHandler): () => void;
  /** Prepares representations for a destination. @param candidate - File and reference. @param context - Destination and cancellation. @returns Prepared representations. */
  preparePaste(
    candidate: FilePasteCandidate,
    context: Pick<FileOperationContext, "destination" | "signal"> & { readonly mode?: EditorMode },
  ): Promise<PreparedFilePaste>;
  /** Finds an element view. @param type - Persisted element type. @returns Matching view if registered. */
  getElementView(type: string): ComponentType<FileElementViewProps> | undefined;
  /** Finds an inline view. @param reference - Persisted file metadata. @returns Matching view if registered. */
  getInlineView(reference: FileReference): ComponentType<FileInlineViewProps> | undefined;
  /** Uploads a browser file. @param file - File to persist. @param context - Source, destination and cancellation. @returns Logical URI. */
  upload(
    file: File,
    context: Omit<FileOperationContext, "documentId" | "mode"> & { readonly mode?: EditorMode },
  ): Promise<string>;
  /** Resolves a URI for display. @param uri - Logical file URI. @param context - Cancellation context. @returns Browser URI or bytes. */
  resolve(uri: string, context: FileRequestContext): Promise<string | Blob>;
  /** Reads file bytes. @param uri - Logical file URI. @param mimeType - Optional MIME hint. @param context - Cancellation context. @returns File bytes. */
  read(uri: string, mimeType: string | undefined, context: FileRequestContext): Promise<Blob>;
  /** Opens a file. @param reference - Persisted metadata. @param context - Cancellation context. @returns Completion of the opener. */
  open(reference: FileReference, context: FileRequestContext): Promise<void>;
}

/** Rejects empty or unsafe resolved browser source strings. */
function validateResolvedUri(uri: string): string {
  const value = uri.trim();
  if (!value || /^(?:javascript|vbscript):/i.test(value)) {
    throw new TypeError("Binary provider returned an unsafe URI");
  }
  return value;
}

/** Owns upload, rewrite, and read hooks for one React editor runtime. */
export class FileManager implements FilesCapability {
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
    private readonly reactEditor: ReactEditorApi,
    private readonly owner: RegistrationOwner,
    private readonly options: FileManagerOptions = {},
  ) {}

  /**
   * Registers one rich matcher or the single matcher-less default handler.
   * @param handler - File preparation and optional canvas view registration.
   * @returns Lifecycle-owned disposer.
   */
  registerPasteHandler(handler: FilePasteHandler): () => void {
    this.owner.assertActive();
    if (
      !handler.provider ||
      typeof handler.provider.write !== "function" ||
      typeof handler.provider.read !== "function"
    ) {
      throw new TypeError("File paste handler requires a binary provider");
    }
    if (
      !handler.id.trim() ||
      this.pasteHandlers.some(({ id }) => id === handler.id) ||
      (handler.elementType &&
        this.pasteHandlers.some(({ elementType }) => elementType === handler.elementType))
    ) {
      throw new Error(
        `File paste handler or element type ${handler.id || "<empty>"} is already registered`,
      );
    }
    if (!handler.matches && this.defaultPasteHandler) {
      throw new Error(
        `Default file paste handler ${this.defaultPasteHandler.id} is already registered`,
      );
    }
    this.pasteHandlers.push(handler);
    if (!handler.matches) {
      this.defaultPasteHandler = handler;
    }
    return this.owner.registerCleanup(() => {
      const index = this.pasteHandlers.indexOf(handler);
      if (index >= 0) {
        this.pasteHandlers.splice(index, 1);
      }
      if (this.defaultPasteHandler === handler) {
        this.defaultPasteHandler = undefined;
      }
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
    this.owner.assertActive();
    if (!handler.id.trim() || this.openHandlers.some(({ id }) => id === handler.id)) {
      throw new Error(`File open handler ${handler.id || "<empty>"} is already registered`);
    }
    if (!handler.matches && this.defaultOpenHandler) {
      throw new Error(
        `Default file open handler ${this.defaultOpenHandler.id} is already registered`,
      );
    }
    this.openHandlers.push(handler);
    if (!handler.matches) {
      this.defaultOpenHandler = handler;
    }
    return this.owner.registerCleanup(() => {
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
   * Prepares one file with the first matching rich handler, then the default.
   * @param candidate - Stored reference and optional browser File.
   * @param context - Destination and cancellation signal.
   * @returns Handler-produced persisted representations.
   */
  async preparePaste(
    candidate: FilePasteCandidate,
    context: Pick<FileOperationContext, "destination" | "signal"> & { readonly mode?: EditorMode },
  ): Promise<PreparedFilePaste> {
    context.signal.throwIfAborted();
    const handler =
      this.pasteHandlers.find((entry) => entry.matches?.(candidate)) ?? this.defaultPasteHandler;
    if (!handler) {
      throw new TypeError(`No file paste handler accepted ${candidate.reference.name}`);
    }
    return handler.prepare(candidate, context);
  }

  /**
   * Returns a registered renderer for one handler-owned element type.
   * @param type - Persisted first-class element discriminator.
   * @returns Registered React view, when the type is active.
   */
  getElementView(type: string): ComponentType<FileElementViewProps> | undefined {
    return this.pasteHandlers.find((handler) => handler.ElementView && handler.elementType === type)
      ?.ElementView;
  }

  /**
   * Returns the first active inline renderer matching persisted metadata.
   * @param reference - Portable file metadata.
   * @returns Registered inline React view, when one matches.
   */
  getInlineView(reference: FileReference): ComponentType<FileInlineViewProps> | undefined {
    return this.pasteHandlers.find(
      (handler) => handler.InlineView && handler.matches?.({ reference }),
    )?.InlineView;
  }

  /** Uploads a file through the provider for its matching attachment handler. */
  async upload(
    file: File,
    context: Omit<FileOperationContext, "documentId" | "mode"> & { readonly mode?: EditorMode },
  ): Promise<string> {
    context.signal.throwIfAborted();
    const complete = {
      ...context,
      documentId: this.reactEditor.getDocument().id,
      mode:
        context.mode ??
        this.reactEditor.panels.getActive()?.getSurfaceType() ??
        this.reactEditor.panels.getDefault()?.getSurfaceType() ??
        "block",
    } satisfies FileOperationContext;
    const reference: FileReference = {
      uri: "",
      name: file.name || "file",
      mimeType: file.type || "application/octet-stream",
      size: file.size,
    };
    const candidate = { file, reference };
    const handler =
      this.pasteHandlers.find((entry) => entry.matches?.(candidate)) ?? this.defaultPasteHandler;
    if (!handler) {
      throw new TypeError(`No binary provider accepted ${reference.name}`);
    }
    const writeContext: BinaryWriteContext = {
      ...complete,
      name: reference.name,
      mimeType: reference.mimeType,
    };
    const uri = await handler.provider.write(file, writeContext);
    complete.signal.throwIfAborted();
    return validateResolvedUri(uri);
  }

  /** Resolves one persisted logical URI to a browser URL or Blob. */
  async resolve(uri: string, context: FileRequestContext): Promise<string | Blob> {
    context.signal.throwIfAborted();
    const complete = {
      signal: context.signal,
      documentId: this.reactEditor.getDocument().id,
      mode:
        context.mode ??
        this.reactEditor.panels.getActive()?.getSurfaceType() ??
        this.reactEditor.panels.getDefault()?.getSurfaceType() ??
        "block",
    };
    const handler = this.pasteHandlers.find((entry) => entry.id === (context.providerId ?? "file"));
    if (handler) {
      const resolved = await handler.provider.read(uri, complete);
      context.signal.throwIfAborted();
      if (resolved !== undefined) {
        if (!(resolved instanceof Blob)) {
          throw new TypeError("Binary provider must return a Blob");
        }
        return resolved;
      }
    }
    const value = uri.trim();
    if (/^https?:/i.test(value) || /^data:/i.test(value) || /^blob:/i.test(value)) {
      return validateResolvedUri(value);
    }
    if (/^[a-z][a-z\d+.-]*:/i.test(value)) {
      throw new TypeError(`No binary provider accepted ${value.split(":", 1)[0]}:`);
    }
    const configured = this.options.documentBaseUri;
    const base = typeof configured === "function" ? configured(complete.documentId) : configured;
    if (!base) {
      throw new TypeError(
        "Relative file URI requires files.documentBaseUri or a registered resolver",
      );
    }
    return validateResolvedUri(new URL(value, base).href);
  }

  /**
   * Resolves one logical URI to bytes and restores its persisted MIME type.
   * @param uri - Persisted logical URI.
   * @param mimeType - Persisted MIME type override, when known.
   * @param context - Cancellation signal.
   * @returns Resolved byte blob.
   */
  async read(
    uri: string,
    mimeType: string | undefined,
    context: FileRequestContext,
  ): Promise<Blob> {
    const resolved = await this.resolve(uri, context);
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
   * Opens one file through the first matching typed handler, then the host fallback.
   *
   * Without a registered handler, browser-addressable files open in a new tab.
   * Blob-backed sources are revoked after the browser has had time to consume them.
   *
   * @param reference - Persisted file metadata to open.
   * @param context - Cancellation signal owned by the invoking view.
   * @returns A promise that settles once opening has been dispatched.
   */
  async open(reference: FileReference, context: FileRequestContext): Promise<void> {
    context.signal.throwIfAborted();
    const complete: FileOpenContext = {
      ...context,
      documentId: this.reactEditor.getDocument().id,
      mode:
        context.mode ??
        this.reactEditor.panels.getActive()?.getSurfaceType() ??
        this.reactEditor.panels.getDefault()?.getSurfaceType() ??
        "block",
    };
    const handler =
      this.openHandlers.find((entry) => entry.matches?.(reference)) ?? this.defaultOpenHandler;
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
    if (objectUrl) {
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    }
  }
}
