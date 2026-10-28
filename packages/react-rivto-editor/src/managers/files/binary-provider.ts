/**
 * Generic binary storage contract shared by attachment extensions and their hosts.
 * Providers own storage; the editor persists the returned references and supplies
 * contextual cancellation and metadata for every request.
 * @module
 */
import type { EditorMode } from "@chulane/rivto";

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
  readonly reportProgress?: (progress: number) => void;
}

/** Host-owned persistence for opaque binary values and their durable references. */
export interface BinaryProvider<TReference, TBinary> {
  /**
   * Persists binary content and returns its durable reference.
   * @param content - Binary content to store.
   * @param context - Attachment metadata, destination and cancellation.
   * @returns Durable provider reference.
   */
  write(content: TBinary, context: BinaryWriteContext): Promise<TReference>;
  /**
   * Reads a recognized reference without claiming references from other backends.
   * @param reference - Durable reference to resolve.
   * @param context - Document, surface and cancellation context.
   * @returns Content, or undefined when the reference is not owned by this provider.
   */
  read(reference: TReference, context: BinaryReadContext): Promise<TBinary | undefined>;
}
