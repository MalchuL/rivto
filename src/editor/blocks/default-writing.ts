import type { BlockDefinition } from "./block-definition";

/** Built-in writing definitions installed through the same registry as custom blocks. */
export const defaultBlockDefinitions: BlockDefinition[] = [
  { type: "paragraph", title: "Paragraph", content: "inline" },
  { type: "heading", title: "Heading 1", content: "inline" },
  { type: "heading2", title: "Heading 2", content: "inline" },
  { type: "heading3", title: "Heading 3", content: "inline" },
  { type: "bulletListItem", title: "Bulleted list", content: "inline" },
  { type: "numberedListItem", title: "Numbered list", content: "inline" },
  { type: "checkListItem", title: "Checklist", content: "inline" },
  { type: "quote", title: "Quote", content: "inline" },
  { type: "code", title: "Code", content: "inline" },
  { type: "divider", title: "Divider", content: "none" },
  { type: "image", title: "Image", content: "none" },
  { type: "file", title: "File", content: "none" },
];
