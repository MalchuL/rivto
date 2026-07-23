import { useBlock, useBlockTextEditing } from "../hooks";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Keeps raw collaborative Markdown mounted underneath a formatted preview.
 *
 * The raw element remains the sole `data-block-content` owner, so selection,
 * clipboard, arrows, slash queries, and IME always operate on persisted source
 * text. CSS reveals it on focus and otherwise overlays a CommonMark/GFM
 * preview. Markdown is presentation only: it never creates or changes Rivto
 * blocks. Raw HTML is deliberately ignored, and ReactMarkdown sanitizes link
 * destinations without rendering through `dangerouslySetInnerHTML`.
 */
export function MarkdownContent({ blockId }: { readonly blockId: string }) {
  const { block } = useBlock(blockId);
  const editing = useBlockTextEditing(blockId);
  const source = block?.content ?? "";

  return (
    <div className="markdown-content">
      <div
        {...editing}
        className="page-block-content markdown-editor"
        role="textbox"
        aria-label="Markdown block content"
        aria-multiline="true"
        spellCheck
      />
      <div className="page-block-content markdown-preview" aria-hidden="true" inert>
        <ReactMarkdown remarkPlugins={[remarkGfm]} skipHtml>
          {source}
        </ReactMarkdown>
      </div>
    </div>
  );
}
