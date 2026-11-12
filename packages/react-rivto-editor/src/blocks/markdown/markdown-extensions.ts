import type { PanelAPI } from "@chulane/rivto";
import type { Components, Options } from "react-markdown";
import type { ExtensionsApi } from "../../managers/extensions/api";

/** Shared name for ordered Markdown preview contributions. */
export const MARKDOWN_EXTENSIONS_KEY = "rivto.markdown.extensions";

/** Block operations supplied to Markdown preview contributions. */
export interface MarkdownRenderContext {
  /** Stable ID of the block containing the Markdown source. */
  readonly blockId: string;
  /** Reads and updates source within the current panel. */
  readonly blocks: Pick<PanelAPI["blocks"], "getBlockNode" | "updateBlock">;
}

/** Synchronous contribution to the Markdown preview pipeline. */
export interface MarkdownExtension {
  /** True if this contribution cannot affect ordinary single-line text. */
  readonly plainTextSafe?: boolean;
  /** Remark plugins run after the built-in GFM parser. */
  readonly remarkPlugins?: Options["remarkPlugins"];
  /** Rehype plugins run after built-in code transformations. */
  readonly rehypePlugins?: Options["rehypePlugins"];
  /**
   * Extends renderers installed before this contribution.
   *
   * @param components - Earlier renderer contributions.
   * @param context - Source block and panel-bounded block operations.
   * @returns Renderers used by the next contribution and Markdown preview.
   */
  readonly components?: (components: Components, context: MarkdownRenderContext) => Components;
}

/** Shared values and cleanup registration borrowed by Markdown contributions. */
export type MarkdownExtensionOwner = Pick<ExtensionsApi, "shared" | "registerCleanup">;

/**
 * Installs an ordered Markdown contribution for the active extension.
 *
 * Each registration holds its own reservation and is removed on extension
 * teardown or setup rollback. The same contribution may be registered twice.
 *
 * @param extensions - Editor extension lifecycle and shared runtime space.
 * @param contribution - Parser and renderer behavior to add.
 * @returns Idempotent disposer releasing this contribution and reservation.
 * @throws If registration or a synchronous change subscriber fails.
 */
export function registerMarkdownExtension(
  extensions: MarkdownExtensionOwner,
  contribution: MarkdownExtension,
): () => void {
  const space = extensions.shared;
  const release = space.reserve(MARKDOWN_EXTENSIONS_KEY, "array");
  const entries = space.getArray<MarkdownExtension>(MARKDOWN_EXTENSIONS_KEY)!;
  // Distinct identities let each installation release exactly its own contribution.
  const entry = { ...contribution };
  const dispose = extensions.registerCleanup(() => {
    try {
      const index = entries.values().indexOf(entry);
      if (index !== -1) {
        entries.splice(index, 1);
      }
    } finally {
      release();
    }
  });
  try {
    entries.splice(entries.values().length, 0, entry);
  } catch (error) {
    dispose();
    throw error;
  }
  return dispose;
}
