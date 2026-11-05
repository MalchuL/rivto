import type { PanelAPI } from "@chulane/rivto";
import type { FileReference } from "../../attachments";
import type { Components, Options } from "react-markdown";
import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../../managers/extensions/types";

/** File metadata available when a Markdown extension formats an inline attachment. */
export interface MarkdownFileReference extends FileReference {
  /** Alternative text supplied by an image input, when available. */
  readonly alt?: string;
}

/** Inline file representation associated with one attachment handler. */
export interface MarkdownFileFormatter {
  /** Stable attachment handler identity. */
  readonly handlerId: string;
  /**
   * Serializes a stored attachment for insertion into Markdown source.
   *
   * @param reference - Stored URI and display metadata.
   * @returns Source text to insert at the captured selection.
   */
  readonly format: (reference: MarkdownFileReference) => string;
}

/** Block operations available to a Markdown renderer contribution. */
export interface MarkdownRenderContext {
  /** Stable ID of the block containing the Markdown source. */
  readonly blockId: string;
  /** Reads and updates the source of blocks in the current panel. */
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock">;
}

/** A contribution to the synchronous Markdown preview pipeline. */
export interface MarkdownExtension {
  /** Inline file representation owned by this contribution. */
  readonly fileFormatter?: MarkdownFileFormatter;
  /** True only when this contribution cannot affect ordinary single-line text. */
  readonly plainTextSafe?: boolean;
  /** Remark plugins run after the built-in GFM parser. */
  readonly remarkPlugins?: Options["remarkPlugins"];
  /** Rehype plugins run after the built-in code transformations. */
  readonly rehypePlugins?: Options["rehypePlugins"];
  /**
   * Extends or wraps renderers installed by earlier contributions.
   *
   * @param components - Renderers configured before this contribution.
   * @param context - Source block and bounded document operations.
   * @returns Renderers used by subsequent contributions and the preview.
   */
  readonly components?: (components: Components, context: MarkdownRenderContext) => Components;
}

/** Operations available to Markdown extensions and preview consumers. */
export interface MarkdownExtensionsApi {
  /**
   * Registers a contribution for the lifetime of its owning extension.
   *
   * @param extension - Plugins and renderer composition to install.
   * @returns Disposer for this registration.
   */
  register(extension: MarkdownExtension): () => void;
  /**
   * Reads contributions in registration order.
   *
   * @returns A snapshot of installed contributions.
   */
  get(): readonly MarkdownExtension[];
  /**
   * Formats a stored attachment with the registered handler contribution.
   *
   * @param handlerId - Attachment handler selected for the file.
   * @param reference - Stored attachment metadata.
   * @returns Markdown source for insertion.
   * @throws If no formatter is registered for the handler.
   */
  formatFile(handlerId: string, reference: MarkdownFileReference): string;
  /** Current registration revision. */
  readonly revision: number;
  /**
   * Observes changes to registered contributions.
   *
   * @param listener - Callback invoked after a registration changes.
   * @returns Disposer for the subscription.
   */
  subscribe(listener: () => void): () => void;
}

/** Owns ordered Markdown contributions for one editor runtime. */
export class MarkdownExtensions implements MarkdownExtensionsApi {
  private readonly store = new RevisionStore();
  private readonly entries: Array<{ readonly extension: MarkdownExtension }> = [];

  /**
   * Creates the registry using the editor's registration owner.
   *
   * @param owner - Captures cleanup for the active extension.
   */
  constructor(private readonly owner: RegistrationOwner) {}

  /**
   * Adds a contribution and captures its removal in the active extension.
   *
   * @param extension - Plugins, renderers, and optional file formatter to install.
   * @returns Idempotent disposer for this registration.
   * @throws If the owning editor is being destroyed.
   */
  register(extension: MarkdownExtension): () => void {
    this.owner.assertActive();
    const entry = { extension };
    this.entries.push(entry);
    const dispose = this.owner.registerCleanup(() => {
      const index = this.entries.indexOf(entry);
      if (index >= 0) {
        this.entries.splice(index, 1);
        this.store.changed();
      }
    });
    this.store.changed();
    return dispose;
  }

  /**
   * Reads currently installed contributions in declaration order.
   *
   * @returns A detached array of contributions.
   */
  get(): readonly MarkdownExtension[] {
    return this.entries.map(({ extension }) => extension);
  }

  /**
   * Formats an attachment using the first registered matching handler.
   *
   * @param handlerId - Identity of the selected file handler.
   * @param reference - Stored attachment reference and display metadata.
   * @returns Markdown source for the attachment.
   * @throws If no matching formatter is registered or the formatter fails.
   */
  formatFile(handlerId: string, reference: MarkdownFileReference): string {
    const formatter = this.entries.find(
      ({ extension }) => extension.fileFormatter?.handlerId === handlerId,
    )?.extension.fileFormatter;
    if (!formatter) {
      throw new Error(`No Markdown file formatter registered for ${handlerId}`);
    }
    return formatter.format(reference);
  }

  /**
   * Reads the current registration revision.
   *
   * @returns Monotonic revision updated on registration and removal.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Observes registration and removal of Markdown contributions.
   *
   * @param listener - Callback invoked after each change.
   * @returns Disposer that removes the listener.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }
}
