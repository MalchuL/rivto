import { MARKDOWN_EDITOR_CLASS } from "../../blocks/markdown/constants";
import type { ReactEditorExtension } from "../../managers";
import type { ReactPanelApi } from "../../panels/types";
import { linkFaviconComponents } from "./link-favicon";
import { findBareLinks, replaceBareLinks, type TitledLink } from "./links";

/** Host-provided lookup for titles of HTTP URLs. */
export interface MarkdownLinkTitleOptions {
  /**
   * Resolves one website title without modifying the document.
   *
   * The host chooses how to perform cross-origin requests and may return no title.
   * The signal is aborted when the extension is removed.
   *
   * @param url - HTTP or HTTPS URL found in Markdown text.
   * @param signal - Cancellation signal for the extension lifetime.
   * @returns Website title, or undefined when no title can be resolved.
   */
  readonly resolveTitle: (url: string, signal: AbortSignal) => Promise<string | undefined>;
}

/**
 * Formats bare URLs after a Markdown block loses focus and decorates external links.
 *
 * Title lookups never block editing. Results are applied only while the block still
 * contains the exact source that initiated them; failed lookups leave URLs intact.
 * Link previews use the target origin's favicon and preserve the previous link renderer.
 *
 * @param options - Host-supplied asynchronous website title resolver.
 * @returns Extension with lifecycle-owned Markdown renderer and focus listener.
 */
export function markdownLinkTitleExtension(
  options: MarkdownLinkTitleOptions,
): ReactEditorExtension {
  return {
    id: "markdown.link-title",
    setup: (editor) => {
      const abort = new AbortController();
      editor.markdown.register({ plainTextSafe: true, components: linkFaviconComponents });
      editor.events.register(
        { id: "markdown.link-title", type: "focusout", scope: "content" },
        (event) => {
          if (
            !(event.raw.target instanceof HTMLElement) ||
            !event.raw.target.classList.contains(MARKDOWN_EDITOR_CLASS) ||
            !event.blockId
          ) {
            return false;
          }
          const { reactPanel, blockId } = event;
          const source = reactPanel.blocks.getBlockNode(blockId)?.content;
          if (!source || !/https?:\/\//i.test(source)) {
            return false;
          }
          const links = findBareLinks(source);
          if (!links.length) {
            return false;
          }
          void formatLinks(reactPanel.blocks, blockId, source, links, options, abort.signal).catch(
            (error) => console.error("Unable to update Markdown link titles", error),
          );
          return false;
        },
      );
      return () => abort.abort();
    },
  };
}

/**
 * Resolves titles and updates a block only while its captured source is current.
 *
 * @param blocks - Panel-scoped block reads and updates.
 * @param blockId - ID of the block that contained the URLs.
 * @param source - Source captured before asynchronous lookups began.
 * @param links - Bare URL ranges found in that source.
 * @param options - Host title resolver.
 * @param signal - Extension lifetime cancellation.
 * @returns A promise resolving after successful current results are applied.
 */
async function formatLinks(
  blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "updateBlock">,
  blockId: string,
  source: string,
  links: ReturnType<typeof findBareLinks>,
  options: MarkdownLinkTitleOptions,
  signal: AbortSignal,
): Promise<void> {
  const results = await Promise.all(
    links.map(async (link): Promise<TitledLink | undefined> => {
      try {
        const title = (await options.resolveTitle(link.url, signal))?.trim();
        return title ? { ...link, title } : undefined;
      } catch {
        return undefined;
      }
    }),
  );
  if (signal.aborted || blocks.getBlockNode(blockId)?.content !== source) {
    return;
  }
  const titled = results.filter((link): link is TitledLink => link !== undefined);
  if (titled.length) {
    blocks.updateBlock(blockId, { content: replaceBareLinks(source, titled) });
  }
}
