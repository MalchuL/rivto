/** Types for attachment classification and file operations. @module */
import type { EditorMode } from "@chulane/rivto";
import type { ComponentType } from "react";

/** Document and surface context captured when a binary operation starts. */
export interface BinaryReadContext {
  readonly documentId: string;
  readonly mode: EditorMode;
  readonly signal: AbortSignal;
}

/** Metadata and progress for a newly stored attachment. */
export interface BinaryWriteContext extends BinaryReadContext {
  readonly name: string;
  readonly mimeType: string;
  readonly source: "clipboard" | "drop" | "picker";
  readonly destination: "inline" | "block" | "element";
  /**
   * Reports provider progress for the current upload.
   *
   * @param progress - Fraction of the upload completed; presentation clamps it to zero through one.
   * @returns Updates the local upload status.
   */
  readonly reportProgress?: (progress: number) => void;
}

/**
 * Generic binary storage contract shared by attachment extensions and their hosts.
 * Providers own storage; the editor persists the returned references and supplies
 * contextual cancellation and metadata for every request.
 */
export interface BinaryProvider<TReference, TBinary> {
  /**
   * Persists binary content and returns its durable reference.
   *
   * @param content - Binary content to store.
   * @param context - Attachment metadata, destination and cancellation.
   * @returns A promise resolving to the durable provider reference.
   * @throws If storage or cancellation fails.
   */
  write(content: TBinary, context: BinaryWriteContext): Promise<TReference>;
  /**
   * Reads a recognized reference without claiming references from other backends.
   *
   * @param reference - Durable reference to resolve.
   * @param context - Document, surface and cancellation context.
   * @returns A promise resolving to content, or undefined when the provider does not own the reference.
   * @throws If storage access or cancellation fails.
   */
  read(reference: TReference, context: BinaryReadContext): Promise<TBinary | undefined>;
}

/** Captured surface and cancellation supplied when preparing a file representation. */
export interface FilePreparationContext {
  /** Requested persisted placement. */
  readonly destination: "inline" | "block" | "element";
  /** Cancels preparation when the extension is destroyed. */
  readonly signal: AbortSignal;
  /** Surface at the start of preparation, when available. */
  readonly mode?: EditorMode;
}

/** Creation-time defaults for the file pipeline. */
export interface AttachmentOptions {
  /**
   * Base URI used for relative references when their provider does not claim them.
   *
   * A callback can select a base for each document; returning undefined leaves
   * relative references unresolved.
   *
   * @param documentId - ID of the document containing the reference.
   * @returns Base URI, or undefined when no base is configured for the document.
   */
  readonly documentBaseUri?: string | ((documentId: string) => string | undefined);
}

/** Stable metadata persisted by every uploaded or referenced file type. */
export interface FileReference {
  readonly uri: string;
  readonly name: string;
  readonly mimeType: string;
  readonly size?: number;
}

/** Candidate supplied to ordered rich-file handlers. */
export interface FileCandidate {
  readonly file?: File;
  readonly reference: FileReference;
}

/** Props supplied to a registered inline file renderer. */
export interface FileInlineViewProps {
  readonly reference: FileReference;
}

/** Handler-produced representations committed by the shared file extension. */
export interface PreparedFile {
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
export interface FileHandler {
  readonly id: string;
  readonly provider: BinaryProvider<string, Blob>;
  /**
   * Determines whether this handler accepts a file before the selected default.
   *
   * @param candidate - Browser file and metadata, or metadata for an existing reference.
   * @returns True when the handler accepts the candidate.
   */
  readonly matches?: (candidate: FileCandidate) => boolean;
  /**
   * Produces representations for the captured destination after storage completes.
   *
   * @param candidate - File and its stored reference, or an existing reference.
   * @param context - Captured placement, surface, and cancellation signal.
   * @returns Prepared representations immediately or after asynchronous inspection.
   * @throws If preparation fails or is cancelled, including a rejected promise.
   */
  readonly prepare: (
    candidate: FileCandidate,
    context: FilePreparationContext,
  ) => PreparedFile | Promise<PreparedFile>;
  readonly InlineView?: ComponentType<FileInlineViewProps>;
}

/** Runtime context supplied when a host opens one persisted file reference. */
export interface FileOpenContext {
  readonly documentId: string;
  readonly mode: EditorMode;
  readonly signal: AbortSignal;
}

/** Type-specific opener that may also be explicitly selected as the host default. */
export interface FileOpenHandler {
  readonly id: string;
  /**
   * Determines whether this opener accepts a file before the selected default.
   *
   * @param reference - Persisted attachment metadata.
   * @returns True when this opener accepts the reference.
   */
  readonly matches?: (reference: FileReference) => boolean;
  /**
   * Opens an attachment through a host-specific viewer or application.
   *
   * @param reference - Persisted attachment metadata.
   * @param context - Document, surface, and cancellation for this request.
   * @returns Completion of opening, either immediately or after the host finishes.
   * @throws If the host cannot open the attachment or cancellation fails the operation.
   */
  readonly open: (reference: FileReference, context: FileOpenContext) => void | Promise<void>;
}

/** Context captured from the receiving surface for asynchronous file work. */
export interface FileRequestContext {
  readonly signal: AbortSignal;
  readonly mode?: EditorMode;
}
