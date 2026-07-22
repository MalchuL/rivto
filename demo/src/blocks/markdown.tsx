import { useBlock, useBlockTextEditing } from "@chulane/rivto";
import type { ReactNode } from "react";
import { tokenizeMarkdown, type MarkdownToken } from "./markdown-parser";

export { tokenizeMarkdown } from "./markdown-parser";

/** Hidden source delimiter retained so preview text offsets equal raw offsets. */
function Marker({ children }: { readonly children: string }) {
  return <span className="markdown-marker">{children}</span>;
}

/** Renders one source-preserving token with simple semantic markup. */
function renderToken(token: MarkdownToken, index: number): ReactNode {
  if (token.kind === "text") return <span key={index}>{token.raw}</span>;
  if (token.kind === "bold") return <span key={index}><Marker>**</Marker><strong>{token.text}</strong><Marker>**</Marker></span>;
  if (token.kind === "italic") return <span key={index}><Marker>*</Marker><em>{token.text}</em><Marker>*</Marker></span>;
  if (token.kind === "strike") return <span key={index}><Marker>~~</Marker><del>{token.text}</del><Marker>~~</Marker></span>;
  if (token.kind === "code") return <span key={index}><Marker>`</Marker><code>{token.text}</code><Marker>`</Marker></span>;
  const suffix = token.raw.slice(token.text.length + 1);
  return (
    <span key={index}>
      <Marker>[</Marker>
      <a href={token.href} target="_blank" rel="noreferrer">{token.text}</a>
      <Marker>{suffix}</Marker>
    </span>
  );
}

/**
 * Keeps raw collaborative text mounted underneath a formatted preview.
 *
 * The raw element remains the sole `data-block-content` owner, so selection,
 * clipboard, arrows, slash queries, and IME continue using exact source
 * offsets. CSS reveals it on focus and otherwise overlays this source-preserving
 * preview. The preview is aria-hidden because the editable already exposes the
 * same text to assistive technology.
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
      <div className="page-block-content markdown-preview" aria-hidden="true">
        {tokenizeMarkdown(source).map(renderToken)}
      </div>
    </div>
  );
}
