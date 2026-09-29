/**
 * Renders editable block text with an idle Markdown preview.
 * The shared editing hook owns DOM text synchronization, while node operations
 * persist code edits through the core block manager.
 *
 * @module
 */
import {
  Children,
  isValidElement,
  useCallback,
  memo,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { MarkdownLinkClick } from "../../types";
import {
  useBlockEditing,
  useBlockNode,
} from "../../hooks";
import ReactMarkdown, { defaultUrlTransform, type Components, type UrlTransform } from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  MarkdownHtmlScript,
  MarkdownHtmlStyle,
  nodeText,
} from "./markdown-html";
import {
  isLiveCodeLabel,
  MarkdownLivePreview,
} from "./markdown-live";
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

/** Memoized expensive Markdown parser boundary keyed by source and renderer options. */
const MarkdownPreview = memo(function MarkdownPreview({
  components,
  source,
  transformUrl,
}: {
  readonly components: Components;
  readonly source: string;
  readonly transformUrl: UrlTransform;
}) {
  return (
    <ReactMarkdown
      components={components}
      urlTransform={transformUrl}
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[
        rehypeCodeFenceMetadata,
        rehypeRaw,
        [rehypeHighlight, {
          detect: true,
          plainText: ["text", "txt", "plaintext"],
        }],
      ]}
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
 * Authored HTML renders as real elements, including tables, styles, and
 * scripts. Fences labeled `jsx`, `tsx`, or `live` render through react-live
 * with Tailwind utilities. Other fenced code stays source text. Link
 * destinations are still sanitized, and `title`, `base`, and `meta` cannot
 * rewrite the host document.
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
    // Document metadata would be hoisted onto the host page. Block HTML stays
    // inside the preview, so these tags contribute nothing.
    base: () => null,
    meta: () => null,
    title: () => null,
    script: ({ node: _node, ...props }) => <MarkdownHtmlScript {...props} />,
    style: ({ node: _node, ...props }) => <MarkdownHtmlStyle {...props} />,
    pre: ({ node, children, ...props }) => {
      const first = Children.toArray(children)[0];
      const codeProps = isValidElement<{
        readonly "data-markdown-code"?: string;
        readonly "data-code-label"?: string;
        readonly children?: ReactNode;
      }>(first) ? first.props : undefined;
      const markdownCode = codeProps?.["data-markdown-code"] === "true";
      const label = codeProps?.["data-code-label"];
      if (markdownCode && isLiveCodeLabel(label)) {
        return (
          <MarkdownLivePreview
            code={nodeText(codeProps?.children).replace(/\n$/, "")}
            label={label ?? "jsx"}
          />
        );
      }
      if (!markdownCode) return <pre {...props}>{children}</pre>;
      return (
        <MarkdownCodeBlock
          {...props}
          node={node}
          onCodeChange={updateCode}
          preventTextEditingAttributes={editing.preventTextEditingAttributes}
        >
          {children}
        </MarkdownCodeBlock>
      );
    },
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
