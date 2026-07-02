import type { BlockSpec, RivtoPlugin } from "./types";

export const defaultBlockSpecs: BlockSpec[] = [
  { type: "paragraph", title: "Paragraph", content: "inline", slash: { title: "Paragraph", aliases: ["p", "text"], group: "Basic" } },
  { type: "heading", title: "Heading 1", content: "inline", slash: { title: "Heading 1", aliases: ["h1", "title"], group: "Headings" } },
  { type: "heading2", title: "Heading 2", content: "inline", slash: { title: "Heading 2", aliases: ["h2", "subtitle"], group: "Headings" } },
  { type: "heading3", title: "Heading 3", content: "inline", slash: { title: "Heading 3", aliases: ["h3"], group: "Headings" } },
  { type: "bulletListItem", title: "Bulleted list", content: "inline", slash: { title: "Bulleted list", aliases: ["ul", "bullet"], group: "Lists" } },
  { type: "numberedListItem", title: "Numbered list", content: "inline", slash: { title: "Numbered list", aliases: ["ol", "number"], group: "Lists" } },
  { type: "checkListItem", title: "Checklist", content: "inline", slash: { title: "Checklist", aliases: ["todo", "check"], group: "Lists" } },
  { type: "quote", title: "Quote", content: "inline", slash: { title: "Quote", aliases: ["blockquote"], group: "Basic" } },
  { type: "code", title: "Code", content: "inline", slash: { title: "Code block", aliases: ["pre"], group: "Basic" } },
  { type: "divider", title: "Divider", content: "none", slash: { title: "Divider", aliases: ["line", "hr"], group: "Basic" } },
  { type: "image", title: "Image", content: "none", slash: { title: "Image", aliases: ["photo", "picture"], group: "Media" } },
  { type: "file", title: "File", content: "none", slash: { title: "File", aliases: ["attachment"], group: "Media" } },
];

export const defaultWritingPlugin: RivtoPlugin = {
  id: "rivto.default-writing",
  blocks: defaultBlockSpecs,
};
