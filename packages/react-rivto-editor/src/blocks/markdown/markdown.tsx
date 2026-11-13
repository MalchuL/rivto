import { BlockText } from "../../authoring/block-text";
/**
 * Renders editable block text with an idle Markdown preview.
 * The shared editing hook owns DOM text synchronization, while node operations
 * persist code edits through the core block manager.
 *
 * @module
 */
import { memo, useCallback, useMemo, useState } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
  type UrlTransform,
} from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkGfm from "remark-gfm";
import { ImageView } from "../../extensions/image/view/image-view";
import { remarkImageMacros, replaceImageMacro } from "../../extensions/image/macro/image-macro";
import { remarkFileMacros } from "../../extensions/file/macro/file-macro";
import { RegisteredFileView } from "../../extensions/file/view/file-view";
import { editorControlProps } from "../../constants";
import { useBlockEditing, usePanel } from "../../hooks";
import type { MarkdownLinkClick } from "../../types";
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

/** Reuses one configured highlighter across independent synchronous Markdown renders. */
const highlightCode = rehypeHighlight({ detect: true, plainText: ["text", "txt", "plaintext"] });

/**
 * Supplies the shared syntax-highlighting transformer to a Markdown processor.
 *
 * @returns The configured transformer for the current processor.
 */
function rehypeSharedHighlight() {
  return highlightCode;
}

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
  if (PLAIN_TEXT_SOURCE.test(source)) {
    return <p>{source}</p>;
  }
  return (
    <ReactMarkdown
      components={components}
      urlTransform={transformUrl}
      remarkPlugins={[remarkGfm, remarkImageMacros, remarkFileMacros]}
      rehypePlugins={[rehypeCodeFenceMetadata, rehypeSharedHighlight]}
      skipHtml
    >
      {source}
    </ReactMarkdown>
  );
});

/** Block lookup borrowed by preview renderers for current-content edits. */
interface MarkdownBlockReader {
  readonly blocks: Pick<ReturnType<typeof usePanel>["blocks"], "getBlockNode">;
}

/**
 * Creates the link renderer for one Markdown block.
 *
 * File macro links use the registered attachment view; ordinary links retain
 * editor control attributes and forward clicks to the host interceptor.
 *
 * @param blockId - Source block whose link was activated.
 * @param onLinkClick - Optional host callback for the link and browser event.
 * @returns React Markdown link renderer bound to the supplied block.
 */
function createMarkdownLinkRenderer(
  blockId: string,
  onLinkClick: ((context: MarkdownLinkClick) => void) | undefined,
): NonNullable<Components["a"]> {
  return ({ node, href = "", ...props }) => {
    const properties = node?.properties ?? {};
    const uri = properties["data-rivto-file-uri"];
    const name = properties["data-rivto-file-name"];
    const mimeType = properties["data-rivto-file-type"];
    if (typeof uri === "string" && typeof name === "string" && typeof mimeType === "string") {
      const size = Number(properties["data-rivto-file-size"]);
      return (
        <RegisteredFileView
          reference={{
            uri,
            name,
            mimeType,
            size: Number.isSafeInteger(size) ? size : undefined,
          }}
        />
      );
    }
    return (
      <a
        {...editorControlProps}
        {...props}
        href={href}
        tabIndex={-1}
        onClick={(event) => onLinkClick?.({ blockId, href, event })}
      />
    );
  };
}

/**
 * Creates the image renderer for one Markdown block.
 *
 * Ordinary Markdown images remain native when their source range is unavailable.
 * Edits use the live block content so an older render cannot overwrite new text.
 *
 * @param blockId - Source block containing the image markup.
 * @param panel - Borrowed current block lookup.
 * @param operations - ID-bound content update operation.
 * @returns React Markdown image renderer with inline image editing when supported.
 */
function createMarkdownImageRenderer(
  blockId: string,
  panel: MarkdownBlockReader,
  operations: Pick<ReturnType<typeof useBlockEditing>["operations"], "setContent">,
): NonNullable<Components["img"]> {
  return ({ node, alt = "", width, height, ...props }) => {
    const properties = node?.properties ?? {};
    const macroUri = properties["data-rivto-image-uri"];
    const uri = typeof macroUri === "string" ? macroUri : props.src;
    const start = Number(properties["data-rivto-image-start"] ?? node?.position?.start.offset);
    const end = Number(properties["data-rivto-image-end"] ?? node?.position?.end.offset);
    if (typeof uri !== "string" || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
      return <img {...props} alt={alt} width={width} height={height} />;
    }
    return (
      <ImageView
        kind="inline"
        uri={uri}
        alt={alt}
        width={Number(width) || undefined}
        height={Number(height) || undefined}
        onChange={(patch) => {
          // Apply edits to current content so a stale render does not replace it.
          if (patch.reset && typeof macroUri !== "string") {
            return;
          }
          const current = panel.blocks.getBlockNode(blockId)?.content;
          if (current === undefined) {
            return;
          }
          operations.setContent(
            replaceImageMacro(
              current,
              { start, end },
              patch.reset
                ? { uri, alt }
                : {
                    uri,
                    alt: patch.alt ?? alt,
                    width: patch.width ?? (Number(width) || undefined),
                    height: patch.height ?? (Number(height) || undefined),
                  },
            ),
          );
        }}
      />
    );
  };
}

/**
 * Creates stable preview renderers and URL handling for the current Markdown block.
 *
 * @param blockId - Persisted source block ID.
 * @param onLinkClick - Optional host link interceptor.
 * @param panel - Borrowed lookup used to read current source before updates.
 * @param editing - ID-bound editing operations and nested-editor prevention attributes.
 * @returns Memoized Markdown components and URL transformer.
 */
function useMarkdownPreview(
  blockId: string,
  onLinkClick: ((context: MarkdownLinkClick) => void) | undefined,
  panel: MarkdownBlockReader,
  editing: Pick<ReturnType<typeof useBlockEditing>, "operations" | "preventTextEditingAttributes">,
) {
  const { operations } = editing;
  const updateCode = useCallback(
    (node: PositionedNode, value: string) => {
      // An external write can precede this old render's input handler in the
      // same turn. Preserve its current surrounding text rather than the snapshot.
      const current = panel.blocks.getBlockNode(blockId)?.content;
      if (current !== undefined) {
        operations.setContent(replaceMarkdownCode(current, node, value));
      }
    },
    [panel, blockId, operations],
  );
  const transformUrl = useCallback<UrlTransform>(
    (url) => {
      const safe = defaultUrlTransform(url);
      if (safe || !onLinkClick) {
        return safe;
      }
      return /^(?!javascript:|vbscript:|data:)[a-z][a-z\d+.-]*:/i.test(url) ? url : safe;
    },
    [onLinkClick],
  );
  const components = useMemo<Components>(
    () => ({
      a: createMarkdownLinkRenderer(blockId, onLinkClick),
      img: createMarkdownImageRenderer(blockId, panel, operations),
      pre: (props) => (
        <MarkdownCodeBlock
          {...props}
          onCodeChange={updateCode}
          preventTextEditingAttributes={editing.preventTextEditingAttributes}
        />
      ),
    }),
    [blockId, editing.preventTextEditingAttributes, onLinkClick, updateCode, panel, operations],
  );
  return { components, transformUrl };
}

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
  const { block } = editing;
  const panel = usePanel();
  const [isEditing, setIsEditing] = useState(false);
  const source = block?.content ?? "";

  const { components, transformUrl } = useMarkdownPreview(blockId, onLinkClick, panel, editing);

  return (
    <div className={MARKDOWN_CONTENT_CLASS}>
      <BlockText
        attributes={editing.attributes}
        className={`${PAGE_BLOCK_CONTENT_CLASS} ${MARKDOWN_EDITOR_CLASS}`}
        label="Markdown block content"
        spellCheck
        style={
          isEditing
            ? undefined
            : {
                position: "absolute",
                inset: 0,
                zIndex: 1,
                color: "transparent",
                caretColor: "transparent",
                // Raw Markdown can contain more lines than its formatted preview.
                // Clip only the idle interaction layer so its invisible text cannot
                // enlarge the scrollable area or intercept following blocks.
                overflow: "hidden",
              }
        }
        onFocus={() => setIsEditing(true)}
        onBlur={() => setIsEditing(false)}
      />
      {!isEditing && (
        <div className={`${PAGE_BLOCK_CONTENT_CLASS} ${MARKDOWN_PREVIEW_CLASS}`}>
          <MarkdownPreview components={components} source={source} transformUrl={transformUrl} />
        </div>
      )}
    </div>
  );
}
