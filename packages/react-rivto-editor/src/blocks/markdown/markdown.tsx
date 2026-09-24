/**
 * Renders editable block text with an idle Markdown preview.
 * The shared editing hook owns DOM text synchronization, while node operations
 * persist code edits through the core block manager.
 *
 * @module
 */
import {
  useCallback,
  memo,
  useMemo,
  useState,
} from "react";
import type { MarkdownLinkClick } from "../../types";
import {
  useBlockEditing,
  useBlockNode,
} from "../../hooks";
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import {
  MarkdownCodeBlock,
  rehypeCodeFenceMetadata,
  replaceMarkdownCode,
  type PositionedNode,
} from "./markdown-code";

const MARKDOWN_CONTENT_CLASS = "markdown-content";
const PAGE_BLOCK_CONTENT_CLASS = "page-block-content";
const MARKDOWN_EDITOR_CLASS = "markdown-editor";
const MARKDOWN_PREVIEW_CLASS = "markdown-preview";
// Single-line text in this alphabet cannot form Markdown syntax or GFM links.
const PLAIN_TEXT_SOURCE = /^[\p{L}\p{N}][\p{L}\p{N} -]*$/u;

/**
 * Renders ordinary text directly and parses Markdown when syntax is possible.
 *
 * @param props - Source and renderer options for the idle preview.
 * @returns A paragraph for plain text or the formatted Markdown tree.
 */
const MarkdownPreview = memo(function MarkdownPreview({
  components,
  source,
  transformUrl,
}: {
  readonly components: Components;
  readonly source: string;
  readonly transformUrl: UrlTransform;
}) {
  if (PLAIN_TEXT_SOURCE.test(source)) return <p>{source}</p>;
  return (
    <ReactMarkdown
      components={components}
      urlTransform={transformUrl}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeCodeFenceMetadata, [rehypeHighlight, {
        detect: true,
        plainText: ["text", "txt", "plaintext"],
      }]]}
      skipHtml
    >
      {source}
    </ReactMarkdown>
  );
});

/**
 * Switches one block between raw editing and formatted Markdown presentation.
 *
 * The raw editor remains mounted because native ranges, clipboard offsets, and
 * cross-block navigation require a stable text node. While idle it is an
 * absolute transparent interaction layer over the formatted preview and
 * therefore contributes no layout size. On focus, React removes the preview
 * and the raw editor returns to normal flow. Only raw source geometry can then
 * determine the block height.
 *
 * Markdown is presentation only: it never creates or changes Rivto blocks.
 * Raw HTML is deliberately ignored, and ReactMarkdown sanitizes link
 * destinations without rendering through `dangerouslySetInnerHTML`.
 *
 * @param props - Stable block ID and optional application link interceptor.
 * @returns A stable raw editor and, while idle, its formatted preview.
 */
export function MarkdownContent({
  blockId,
  onLinkClick,
}: {
  readonly blockId: string;
  readonly onLinkClick?: (context: MarkdownLinkClick) => void;
}) {
  const editing = useBlockEditing(blockId);
  const { block, operations } = useBlockNode(blockId);
  const [isEditing, setIsEditing] = useState(false);
  const source = block?.content ?? "";

  const updateCode = useCallback((node: PositionedNode, value: string) => {
    operations.setContent(replaceMarkdownCode(source, node, value));
  }, [operations, source]);
  const transformUrl = useCallback<UrlTransform>((url) => {
    const safe = defaultUrlTransform(url);
    if (safe || !onLinkClick) return safe;
    return /^(?!javascript:|vbscript:|data:)[a-z][a-z\d+.-]*:/i.test(url) ? url : safe;
  }, [onLinkClick]);
  const components = useMemo<Components>(() => ({
    a: ({ node: _node, href = "", ...props }) => (
      <a
        {...props}
        href={href}
        tabIndex={-1}
        onClick={(event) => onLinkClick?.({ blockId, href, event })}
      />
    ),
    pre: (props) => (
      <MarkdownCodeBlock
        {...props}
        onCodeChange={updateCode}
        preventTextEditingAttributes={editing.preventTextEditingAttributes}
      />
    ),
  }), [blockId, editing.preventTextEditingAttributes, onLinkClick, updateCode]);

  return (
    <div className={MARKDOWN_CONTENT_CLASS}>
      <div
        {...editing.attributes}
        className={`${PAGE_BLOCK_CONTENT_CLASS} ${MARKDOWN_EDITOR_CLASS}`}
        role="textbox"
        aria-label="Markdown block content"
        aria-multiline="true"
        spellCheck
        style={isEditing ? undefined : {
          position: "absolute",
          inset: 0,
          zIndex: 1,
          color: "transparent",
          caretColor: "transparent",
          // Raw Markdown can contain more lines than its formatted preview.
          // Clip only the idle interaction layer so its invisible text cannot
          // enlarge the scrollable area or intercept following blocks.
          overflow: "hidden",
        }}
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
      />
      {!isEditing && (
        <div
          className={`${PAGE_BLOCK_CONTENT_CLASS} ${MARKDOWN_PREVIEW_CLASS}`}
        >
          <MarkdownPreview components={components} source={source} transformUrl={transformUrl} />
        </div>
      )}
    </div>
  );
}
