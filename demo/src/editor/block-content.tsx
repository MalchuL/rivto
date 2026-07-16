import { useBlockTextEditing, useEditor, type EditorBlock } from "@chulane/rivto";

const labels: Record<string, string> = {
  paragraph: "Paragraph",
  heading: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bulletListItem: "Bulleted list",
  numberedListItem: "Numbered list",
  checkListItem: "Checklist",
  quote: "Quote",
  code: "Code",
};

export function BlockContent({ block }: { block: EditorBlock }) {
  const editor = useEditor();
  if (block.type === "divider") return <hr />;
  if (block.type === "image" || block.type === "file") return <p>{block.content || block.type}</p>;
  const props = useBlockTextEditing({ block, editor });
  const Tag: "h1" | "h2" | "h3" | "blockquote" | "pre" | "li" | "p" = block.type === "heading" ? "h1"
    : block.type === "heading2" ? "h2"
      : block.type === "heading3" ? "h3"
        : block.type === "quote" ? "blockquote"
          : block.type === "code" ? "pre"
            : block.type.endsWith("ListItem") ? "li"
              : "p";
  return <Tag {...props} className="rv-block-content" role="textbox" aria-label={labels[block.type] ?? block.type} />;
}
