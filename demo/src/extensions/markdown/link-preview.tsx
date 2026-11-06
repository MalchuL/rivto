import type { ReactEditorExtension } from "@chulane/rivto-react";
import { markdownLinkTitleExtension } from "./markdown-link-title";

/**
 * Installs the demo's automatic Markdown URL titles and favicon rendering.
 *
 * The public Microlink API receives each URL that needs a title. Hosts can use
 * their own metadata service by configuring markdownLinkTitleExtension directly.
 *
 * @returns Extension using the demo metadata resolver.
 */
export function linkPreviewExtension(): ReactEditorExtension {
  return markdownLinkTitleExtension({
    resolveTitle: async (url, signal) => {
      const response = await fetch(`https://api.microlink.io/?url=${encodeURIComponent(url)}`, {
        signal,
      });
      if (!response.ok) {
        return undefined;
      }
      const result: unknown = await response.json();
      if (
        !result ||
        typeof result !== "object" ||
        !("data" in result) ||
        !result.data ||
        typeof result.data !== "object" ||
        !("title" in result.data)
      ) {
        return undefined;
      }
      return typeof result.data.title === "string" ? result.data.title : undefined;
    },
  });
}
