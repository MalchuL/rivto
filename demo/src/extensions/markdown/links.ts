import { unified } from "unified";
import remarkParse from "remark-parse";
import type { RootContent } from "mdast";

/** Source range of an unformatted HTTP link. */
export interface BareLink {
  /** Original URL in Markdown source. */
  readonly url: string;
  /** Inclusive source offset. */
  readonly start: number;
  /** Exclusive source offset. */
  readonly end: number;
}

/** One resolved title and the original source range it describes. */
export interface TitledLink extends BareLink {
  /** Website title to use as the Markdown link label. */
  readonly title: string;
}

/** Shared Markdown parser; processing each block creates an independent syntax tree. */
const parser = unified().use(remarkParse);
const URL_PATTERN = /https?:\/\/[^\s<>"']+/gi;
const IMAGE_EXTENSION = /\.(?:gif|jpe?g|tiff?|png|webp|bmp|svg)(?:[?#]|$)/i;

/**
 * Finds plain HTTP URLs in text nodes while excluding existing Markdown links and code.
 *
 * @param source - Current Markdown block source.
 * @returns URL ranges in source order, excluding image URLs.
 */
export function findBareLinks(source: string): BareLink[] {
  const links: BareLink[] = [];
  const visit = (node: RootContent): void => {
    if (
      node.type === "link" ||
      node.type === "linkReference" ||
      node.type === "image" ||
      node.type === "imageReference"
    ) {
      return;
    }
    if (node.type === "text" && node.position?.start.offset !== undefined) {
      const start = node.position.start.offset;
      const end = node.position.end.offset ?? start;
      const text = source.slice(start, end);
      for (const match of text.matchAll(URL_PATTERN)) {
        const offset = start + match.index;
        const macroStart = source.lastIndexOf("{{", offset);
        const macroEnd = source.lastIndexOf("}}", offset);
        if (macroStart > macroEnd) {
          continue;
        }
        let url = match[0].replace(/[.,!?;:]+$/, "");
        while (
          url.endsWith(")") &&
          (url.match(/\)/g)?.length ?? 0) > (url.match(/\(/g)?.length ?? 0)
        ) {
          url = url.slice(0, -1);
        }
        if (url && !IMAGE_EXTENSION.test(url)) {
          links.push({ url, start: offset, end: offset + url.length });
        }
      }
    }
    if ("children" in node) {
      node.children.forEach(visit);
    }
  };
  parser.parse(source).children.forEach(visit);
  return links;
}

/**
 * Replaces resolved URL ranges with escaped Markdown links.
 *
 * Ranges refer to the original source and are applied from right to left.
 *
 * @param source - Original Markdown source used to find the ranges.
 * @param links - Resolved titles and source ranges.
 * @returns Markdown with titled links in place of the supplied ranges.
 */
export function replaceBareLinks(source: string, links: readonly TitledLink[]): string {
  let result = source;
  for (const link of [...links].sort((a, b) => b.start - a.start)) {
    const title = link.title
      .replace(/\s+/g, " ")
      .replace(/\\/g, "\\\\")
      .replaceAll("[", "\\[")
      .replaceAll("]", "\\]");
    const url = link.url.replace(/[\\()]/g, "\\$&");
    result = result.slice(0, link.start) + `[${title}](${url})` + result.slice(link.end);
  }
  return result;
}
