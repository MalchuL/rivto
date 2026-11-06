import type { PanelAPI } from "@chulane/rivto";
import type { Components, Options } from "react-markdown";
import { RevisionStore } from "../../internal-store";
import type { RegistrationOwner } from "../../managers/extensions/types";

/** Block operations available to a Markdown renderer contribution. */
export interface MarkdownRenderContext {
  /** Stable ID of the block containing the Markdown source. */
  readonly blockId: string;
  /** Reads and updates the source of blocks in the current panel. */
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock">;
}

/** A contribution to the synchronous Markdown preview pipeline. */
export interface MarkdownExtension {
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
   * @param extension - Plugins and renderers to install.
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
