/**
 * Serializes Rivto snapshots for `Page.content` and extracts preview/outline
 * text without creating an editor runtime.
 *
 * Seed data and search/preview callers stay on the string field used by page
 * CRUD. Invalid or legacy HTML content degrades to plain text instead of
 * throwing, so mock pages and older strings remain readable.
 */

import type { EditorBlock, EditorSnapshot } from "@chulane/rivto";

/** Matches `DEFAULT_WRITING_BLOCK_TYPE` without importing the React package. */
const WRITING_BLOCK_TYPE = "paragraph";

/** Empty portable document stored for new pages. */
export const EMPTY_EDITOR_SNAPSHOT: EditorSnapshot = {
  version: 6,
  blocks: [],
  links: [],
  elements: [],
};

/** JSON form of {@link EMPTY_EDITOR_SNAPSHOT} used as the default page body. */
export const EMPTY_EDITOR_CONTENT = JSON.stringify(EMPTY_EDITOR_SNAPSHOT);

/** One heading extracted from Markdown writing-block source. */
export type PageOutlineItem = {
  level: number;
  text: string;
};

/** Compact seed input: Markdown source, or a writing block with list props. */
export type SeedWritingBlock =
  | string
  | {
      content: string;
      list?: "checkbox" | "start_numbered_list" | "numbered_list";
      checked?: boolean;
    };

/**
 * Walks a block tree in document order.
 *
 * @param blocks - Root or nested blocks to visit.
 * @param visit - Called once per block before its children.
 * @returns No value.
 */
function walkBlocks(
  blocks: readonly EditorBlock[],
  visit: (block: EditorBlock) => void,
): void {
  for (const block of blocks) {
    visit(block);
    if (block.children.length > 0) {
      walkBlocks(block.children, visit);
    }
  }
}

/**
 * Builds one writing block for seed snapshots.
 *
 * @param input - Markdown string or list-aware seed block.
 * @param index - Used to mint a stable seed id.
 * @returns A complete snapshot block.
 */
function seedBlock(input: SeedWritingBlock, index: number): EditorBlock {
  const content = typeof input === "string" ? input : input.content;
  const listProps =
    typeof input === "string" || !input.list
      ? {}
      : {
          type: input.list,
          ...(input.list === "checkbox" ? { checked: input.checked ?? false } : {}),
        };
  return {
    id: `seed-${index + 1}`,
    type: WRITING_BLOCK_TYPE,
    listProps,
    props: {},
    pluginData: {},
    content,
    children: [],
  };
}

/**
 * Serializes seed writing blocks as `Page.content`.
 *
 * @param blocks - Markdown paragraphs and optional list items.
 * @returns Snapshot JSON accepted by {@link parseEditorSnapshot}.
 */
export function serializeSeedSnapshot(blocks: readonly SeedWritingBlock[]): string {
  const snapshot: EditorSnapshot = {
    version: 6,
    blocks: blocks.map(seedBlock),
    links: [],
    elements: [],
  };
  return JSON.stringify(snapshot);
}

/**
 * Parses stored page content as a Rivto snapshot.
 *
 * @param content - `Page.content` string.
 * @returns A snapshot when the string is valid v6 JSON; otherwise null.
 */
export function parseEditorSnapshot(content: string): EditorSnapshot | null {
  const trimmed = content.trim();
  if (!trimmed || trimmed === "<p></p>") {
    return { ...EMPTY_EDITOR_SNAPSHOT };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      (parsed as { version: unknown }).version !== 6 ||
      !("blocks" in parsed) ||
      !Array.isArray((parsed as { blocks: unknown }).blocks)
    ) {
      return null;
    }
    const record = parsed as Partial<EditorSnapshot>;
    return {
      version: 6,
      blocks: record.blocks ?? [],
      links: record.links ?? [],
      elements: record.elements ?? [],
      ...(record.pluginData ? { pluginData: record.pluginData } : {}),
    };
  } catch {
    return null;
  }
}

/**
 * Serializes a runtime dump for persistence.
 *
 * @param snapshot - Value returned by `editor.dump()`.
 * @returns Stable JSON stored on `Page.content`.
 */
export function serializeEditorSnapshot(snapshot: EditorSnapshot): string {
  return JSON.stringify(snapshot);
}

/**
 * Strips common Markdown markers from one writing-block source string.
 *
 * @param markdown - Collaborative block content.
 * @returns Plain text suitable for previews and search.
 */
function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/(\*|_)(.*?)\1/g, "$2")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Collects plain text from snapshot blocks, or falls back to HTML stripping.
 *
 * @param content - `Page.content` string.
 * @returns Preview/search text with markup removed.
 */
export function extractPageText(content: string): string {
  const snapshot = parseEditorSnapshot(content);
  if (snapshot) {
    const parts: string[] = [];
    walkBlocks(snapshot.blocks, (block) => {
      const text = stripMarkdown(block.content);
      if (text) parts.push(text);
    });
    return parts.join(" ");
  }
  return content.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const HEADING_PATTERN = /^(#{1,3})\s+(.+)$/;

/**
 * Reads Markdown ATX headings from writing blocks for the outline sidebar.
 *
 * @param content - `Page.content` string.
 * @returns Heading items in document order.
 */
export function extractPageOutline(content: string): PageOutlineItem[] {
  const snapshot = parseEditorSnapshot(content);
  if (!snapshot) {
    const items: PageOutlineItem[] = [];
    const headingTag = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
    let match: RegExpExecArray | null = headingTag.exec(content);
    while (match) {
      items.push({
        level: Number(match[1]),
        text: match[2].replace(/<[^>]*>/g, "").trim(),
      });
      match = headingTag.exec(content);
    }
    return items;
  }
  const items: PageOutlineItem[] = [];
  walkBlocks(snapshot.blocks, (block) => {
    const heading = HEADING_PATTERN.exec(block.content.trim());
    if (!heading) return;
    items.push({
      level: heading[1].length,
      text: stripMarkdown(heading[2]),
    });
  });
  return items;
}
