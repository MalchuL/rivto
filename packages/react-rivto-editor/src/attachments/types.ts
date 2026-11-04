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
  readonly destination: PreparedFile["kind"];
  /**
   * Reports provider progress for the current upload.
   *
   * @param progress - Fraction of the upload completed; presentation clamps it to zero through one.
   * @returns Updates the local upload status.
   */
  readonly reportProgress?: (progress: number) => void;
}

/**
 * Binary storage contract shared by attachment extensions and their hosts.
 * Providers own storage; the editor persists the returned references and supplies
 * contextual cancellation and metadata for every request.
 */
export interface BinaryProvider {
  /**
   * Persists binary content and returns its durable reference.
   *
   * @param content - Binary content to store.
   * @param context - Attachment metadata, destination and cancellation.
   * @returns A promise resolving to the durable provider reference.
   * @throws If storage or cancellation fails.
   */
  write(content: Blob, context: BinaryWriteContext): Promise<string>;
  /**
   * Reads a recognized reference without claiming references from other backends.
   *
   * @param reference - Durable reference to resolve.
   * @param context - Document, surface and cancellation context.
   * @returns A promise resolving to content, or undefined when the provider does not own the reference.
   * @throws If storage access or cancellation fails.
   */
  read(reference: string, context: BinaryReadContext): Promise<Blob | undefined>;
}

/** Captured surface and cancellation supplied when preparing a file representation. */
export interface FilePreparationContext {
  /** Requested persisted placement. */
  readonly destination: PreparedFile["kind"];
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
   * Set this to a base URI string shared by documents, or to a callback that
   * selects a base using the current document ID. If the option is omitted or
   * the callback returns undefined, unclaimed relative references cannot be resolved.
   * The base is passed to the URL constructor and must be an absolute URL.
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

/** Candidate supplied to ordered rich-file handlers before storage or for an existing reference. */
export type FileCandidate =
  | { readonly file: File; readonly reference: Omit<FileReference, "uri"> }
  | { readonly file?: never; readonly reference: FileReference };

/** Stored file or existing reference supplied to a handler for preparation. */
export interface FilePreparation {
  readonly file?: File;
  readonly reference: FileReference;
}

/** Props supplied to a registered inline file renderer. */
export interface FileInlineViewProps {
  readonly reference: FileReference;
}

/** Prepared representation for the requested insertion destination. */
export type PreparedFile =
  | { readonly kind: "inline"; readonly content: string }
  | { readonly kind: "block"; readonly type: string; readonly props: Record<string, unknown> }
  | {
      readonly kind: "element";
      readonly type: string;
      readonly props: Record<string, unknown>;
      readonly width: number;
      readonly height: number;
    };

/** Ordered media-specific preparation and optional canvas presentation. */
export interface FileHandler {
  readonly id: string;
  readonly provider: BinaryProvider;
  /**
   * Determines whether this handler accepts a file before the selected default.
   *
   * @param candidate - Browser file and metadata, or metadata for an existing reference.
   * @returns True when the handler accepts the candidate.
   */
  readonly matches?: (candidate: FileCandidate) => boolean;
  /**
   * Produces the representation for the captured destination after storage completes.
   *
   * @param candidate - File and its stored reference, or an existing reference.
   * @param context - Captured placement, surface, and cancellation signal.
   * @returns The prepared representation immediately or after asynchronous inspection.
   * @throws If preparation fails or is cancelled, including a rejected promise.
   */
  readonly prepare: (
    candidate: FilePreparation,
    context: FilePreparationContext,
  ) => PreparedFile | Promise<PreparedFile>;
  readonly InlineView?: ComponentType<FileInlineViewProps>;
}

/** Runtime context supplied when a host opens one persisted file reference. */
export type FileOpenContext = BinaryReadContext;

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
