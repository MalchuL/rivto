import type { BlockDefinition } from "./types";

/** Built-in writing blocks installed by every editor runtime. */
export const defaultBlockDefinitions: BlockDefinition[] = [
  { type: "paragraph", title: "Paragraph" },
  { type: "heading", title: "Heading 1" },
  { type: "heading2", title: "Heading 2" },
  { type: "heading3", title: "Heading 3" },
  { type: "bulletListItem", title: "Bulleted list" },
  { type: "numberedListItem", title: "Numbered list" },
  { type: "checkListItem", title: "Checklist" },
  { type: "quote", title: "Quote" },
  { type: "code", title: "Code" },
  { type: "divider", title: "Divider" },
  { type: "image", title: "Image" },
  { type: "file", title: "File" },
];
