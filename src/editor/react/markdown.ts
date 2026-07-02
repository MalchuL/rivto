import type { Block } from "../../store/document-model";

/** Escapes Markdown source before the lightweight preview inserts HTML tags. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
  })[character] ?? character);
}

/** Maps Markdown heading prefixes to the existing visual heading styles. */
export function markdownType(block: Block): string {
  if (block.type !== "paragraph") return block.type;
  if (block.content.startsWith("### ")) return "heading3";
  if (block.content.startsWith("## ")) return "heading2";
  if (block.content.startsWith("# ")) return "heading";
  return block.type;
}

/**
 * Produces the demo editor's intentionally small, escaped Markdown preview.
 *
 * This is not a CommonMark parser; collaborative storage retains the exact
 * source so a complete parser can replace this view concern without migration.
 */
export function markdownHtml(source: string): string {
  return escapeHtml(source.replace(/^#{1,3} /, ""))
    .replace(/`([^\n`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)]\(((?:https?:\/\/|mailto:|\/|#)[^)]+)\)/g, '<a href="$2">$1</a>')
    .replace(/\*\*([^\n*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/~~([^\n~]+)~~/g, "<s>$1</s>")
    .replace(/(^|[^*])\*([^\n*]+)\*/g, "$1<em>$2</em>")
    .replace(/\n/g, "<br>");
}
