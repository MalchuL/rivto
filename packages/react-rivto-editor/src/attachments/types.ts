/** Types for attachment classification and file operations. @module */
import type { ComponentType } from "react";

/** Document and cancellation context captured for a binary operation or file open. */
export interface BinaryReadContext {
  /** Document containing the attachment reference. */
  readonly documentId: string;
  /** Signal for cancelling this operation. */
  readonly signal: AbortSignal;
}

/** Metadata and progress for a newly stored attachment. */
export interface BinaryWriteContext extends BinaryReadContext {
  /** Name presented to the user for the stored file. */
  readonly name: string;
  /** Media type supplied to the provider. */
  readonly mimeType: string;
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
   * @param context - Attachment metadata and cancellation.
   * @returns A promise resolving to the durable provider reference.
   * @throws If storage or cancellation fails.
   */
  write(content: Blob, context: BinaryWriteContext): Promise<string>;
  /**
   * Reads a recognized reference without claiming references from other backends.
   *
   * @param reference - Durable reference to resolve.
   * @param context - Document and cancellation context.
   * @returns A promise resolving to content, or undefined when the provider does not own the reference.
   * @throws If storage access or cancellation fails.
   */
  read(reference: string, context: BinaryReadContext): Promise<Blob | undefined>;
}

/** Captured placement and cancellation supplied when preparing a file representation. */
export interface FilePreparationContext {
  /** Requested persisted placement. */
  readonly destination: PreparedFile["kind"];
  /** Cancels preparation when the extension is destroyed. */
  readonly signal: AbortSignal;
}

/**
 * Defines a shared base URI or selects one for a document.
 *
 * @param documentId - ID of the document containing the reference when using a callback.
 * @returns The document's base URI, or undefined when the callback has no base for it.
 */
export type DocumentBaseUri = string | ((documentId: string) => string | undefined);

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
  readonly documentBaseUri?: DocumentBaseUri;
}

/** Stable metadata persisted by every uploaded or referenced file type. */
export interface FileReference {
  /** Provider reference or URI persisted in the document. */
  readonly uri: string;
  /** Display name supplied with the file. */
  readonly name: string;
  /** Media type associated with the file. */
  readonly mimeType: string;
  /** File size in bytes, when known. */
  readonly size?: number;
}

/**
 * Candidate supplied to ordered rich-file handlers before storage or for an existing reference.
 *
 * New browser files have metadata but no URI until their provider stores them;
 * existing references include a URI and do not include a browser file.
 */
export type FileCandidate =
  | {
      /** Browser file awaiting storage. */
      readonly file: File;
      /** File metadata before a provider has assigned its URI. */
      readonly reference: Omit<FileReference, "uri">;
    }
  | {
      /** Existing references do not carry a browser file. */
      readonly file?: never;
      /** Existing persisted file reference and metadata. */
      readonly reference: FileReference;
    };

/** Stored file or existing reference supplied to a handler for preparation. */
export interface FilePreparation {
  /** Original browser file, absent when preparing an existing reference. */
  readonly file?: File;
  /** Persisted reference and metadata available to the handler. */
  readonly reference: FileReference;
}

/** Props supplied to a registered inline file renderer. */
export interface FileInlineViewProps {
  /** Attachment represented by the inline view. */
  readonly reference: FileReference;
}

/**
 * Prepared representation for the requested insertion destination.
 *
 * Inline content is inserted as text; block and element variants carry their
 * registered type and properties. Element dimensions are in surface units.
 */
export type PreparedFile =
  | {
      /** Inserts text into an existing block. */
      readonly kind: "inline";
      /** Serialized inline representation. */
      readonly content: string;
    }
  | {
      /** Inserts a document block. */
      readonly kind: "block";
      /** Registered block type. */
      readonly type: string;
      /** Properties persisted on the block. */
      readonly props: Record<string, unknown>;
    }
  | {
      /** Inserts a canvas element. */
      readonly kind: "element";
      /** Registered canvas element type. */
      readonly type: string;
      /** Properties persisted on the element. */
      readonly props: Record<string, unknown>;
      /** Initial element width in surface units. */
      readonly width: number;
      /** Initial element height in surface units. */
      readonly height: number;
    };

/** Ordered media-specific preparation and optional canvas presentation. */
export interface FileHandler {
  /** Identifier used for registration and selection. */
  readonly id: string;
  /** Provider used to store files accepted by this handler. */
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
   * @param context - Captured placement and cancellation signal.
   * @returns The prepared representation immediately or after asynchronous inspection.
   * @throws If preparation fails or is cancelled, including a rejected promise.
   */
  readonly prepare: (
    candidate: FilePreparation,
    context: FilePreparationContext,
  ) => PreparedFile | Promise<PreparedFile>;
  /** Optional renderer for references represented inline. */
  readonly InlineView?: ComponentType<FileInlineViewProps>;
}

/** Type-specific opener that may also be explicitly selected as the host default. */
export interface FileOpenHandler {
  /** Identifier used for registration and default selection. */
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
   * @param context - Document and cancellation for this request.
   * @returns Completion of opening, either immediately or after the host finishes.
   * @throws If the host cannot open the attachment or cancellation fails the operation.
   */
  readonly open: (reference: FileReference, context: BinaryReadContext) => void | Promise<void>;
}

/** Cancellation supplied for asynchronous file work. */
export interface FileRequestContext {
  /** Signal for cancelling the request. */
  readonly signal: AbortSignal;
}
