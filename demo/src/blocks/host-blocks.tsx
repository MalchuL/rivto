/**
 * Demo extensions for callout, bookmark, table of contents, and math equation.
 *
 * Each factory registers one block through the public `blockExtension` API and
 * a portable clipboard formatter. The shared block shell still owns selection,
 * drag, and child layout.
 *
 * @module
 */
import katex, { type KatexOptions } from "katex";
import {
  BLOCK_ID_ATTRIBUTE,
  MarkdownContent,
  blockExtension,
  useBlockEditing,
  useReactEditor,
  type ClipboardFormatter,
  type PortableBlockFormats,
  type ReactBlockRegistration,
  type ReactEditor,
  type ReactEditorExtension,
} from "@chulane/rivto-react";
import {
  useCallback,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
} from "react";
import {
  BOOKMARK_BLOCK_TYPE,
  CALLOUT_BLOCK_TYPE,
  CALLOUT_VARIANT_LABELS,
  CALLOUT_VARIANTS,
  DEFAULT_CALLOUT_EMOJI,
  DEFAULT_CALLOUT_VARIANT,
  MATH_EQUATION_BLOCK_TYPE,
  TABLE_OF_CONTENTS_BLOCK_TYPE,
  bookmarkBlockDefinition,
  calloutBlockDefinition,
  isCalloutVariant,
  isHttpUrl,
  mathEquationBlockDefinition,
  tableOfContentsBlockDefinition,
  type BookmarkProps,
  type CalloutProps,
  type CalloutVariant,
} from "./host-block-definitions";
import {
  collectTocEntries,
  isTocConversionAvailable,
  type TocDocumentView,
  type TocEntry,
} from "./toc-entries";
import "katex/dist/katex.min.css";
import "./host-blocks.css";

export {
  BOOKMARK_BLOCK_TYPE,
  CALLOUT_BLOCK_TYPE,
  CALLOUT_VARIANTS,
  DEFAULT_CALLOUT_EMOJI,
  DEFAULT_CALLOUT_VARIANT,
  MATH_EQUATION_BLOCK_TYPE,
  TABLE_OF_CONTENTS_BLOCK_TYPE,
  bookmarkBlockDefinition,
  calloutBlockDefinition,
  isHttpUrl,
  mathEquationBlockDefinition,
  tableOfContentsBlockDefinition,
} from "./host-block-definitions";
export {
  TOC_HEADING_BLOCK_TYPES,
  TOC_WRITING_BLOCK_TYPE,
  collectTocEntries,
  extractMarkdownHeadings,
  isTocConversionAvailable,
} from "./toc-entries";

const CALLOUT_CLASS = "demo-callout";
const CALLOUT_CONTROLS_CLASS = "demo-callout-controls";
const CALLOUT_FIELD_CLASS = "demo-callout-field";
const CALLOUT_EMOJI_CLASS = "demo-callout-emoji";
const BOOKMARK_CLASS = "demo-bookmark";
const BOOKMARK_FIELD_CLASS = "demo-bookmark-field";
const BOOKMARK_DESCRIPTION_CLASS = "demo-bookmark-description";
const BOOKMARK_FORM_CLASS = "demo-bookmark-form";
const BOOKMARK_URL_CLASS = "demo-bookmark-url";
const BOOKMARK_LINK_CLASS = "demo-bookmark-link";
const BOOKMARK_ERROR_CLASS = "demo-bookmark-error";
const BOOKMARK_ACTIONS_CLASS = "demo-bookmark-actions";
const TOC_CLASS = "demo-toc";
const TOC_LIST_CLASS = "demo-toc-list";
const TOC_ENTRY_CLASS = "demo-toc-entry";
const TOC_EMPTY_CLASS = "demo-toc-empty";
const MATH_CLASS = "demo-math";
const MATH_SOURCE_CLASS = "demo-math-source";
const MATH_PREVIEW_CLASS = "demo-math-preview";
const MATH_ERROR_CLASS = "demo-math-error";
const MATH_EMPTY_CLASS = "demo-math-empty";
const PAGE_BLOCK_CONTENT_CLASS = "page-block-content";

/** KaTeX options fixed by the host contract. `trust` stays off so commands cannot inject HTML. */
const MATH_RENDER_OPTIONS = {
  displayMode: true,
  throwOnError: false,
  trust: false,
} as const satisfies KatexOptions;

/**
 * Renders one display equation with KaTeX.
 *
 * Invalid formulas return the library's error markup instead of throwing, so
 * the source field can stay mounted. The returned HTML is used as-is.
 *
 * @param source - LaTeX stored on the block.
 * @returns Library HTML and whether that HTML reports a parse error.
 */
function renderEquation(source: string): { html: string; invalid: boolean } {
  try {
    const html = katex.renderToString(source, MATH_RENDER_OPTIONS);
    return { html, invalid: html.includes("katex-error") };
  } catch {
    return { html: "", invalid: true };
  }
}

/** Escapes text that will be placed in a portable HTML clipboard flavor. */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

/** Joins a block's own portable text with its already formatted descendants. */
function joinPortableText(own: string, children: string): string {
  if (!own) return children;
  if (!children) return own;
  return `${own}\n${children}`;
}

/** Indents every line so nested clipboard text keeps its depth. */
function indentLines(value: string, depth: number): string {
  const indent = "  ".repeat(depth);
  return value.split("\n").map((line) => `${indent}${line}`).join("\n");
}

/**
 * Ignores a click that a completed selection drag or modifier selection already claimed.
 *
 * @param event - Click on a native control inside a block.
 * @returns True when the control should not perform its own action.
 */
function isClaimedSelectionClick(event: MouseEvent<HTMLElement>): boolean {
  return event.defaultPrevented || event.ctrlKey || event.metaKey;
}

/** Reads the block tree through the public editor API. */
function tocDocumentView(reactEditor: ReactEditor): TocDocumentView {
  return {
    getBlock: (id) => {
      const block = reactEditor.blocks.getBlockNode(id);
      if (!block) return undefined;
      return {
        id: block.id,
        type: block.type,
        content: block.content,
        childIds: block.childIds,
      };
    },
    getParentId: (id) => reactEditor.blocks.getParentId(id),
    getRootIds: () => reactEditor.blocks.getRootIds(),
  };
}

/**
 * Subscribes to block-data revisions, including content and hierarchy edits.
 *
 * Mode and selection updates can notify the editor without changing this
 * number, so the table of contents does not recompute for those.
 *
 * @returns Monotonic document block revision, or zero when no document is bound.
 */
function useDocumentBlockRevision(): number {
  const reactEditor = useReactEditor();
  const subscribe = useCallback(
    (listener: () => void) => reactEditor.subscribe(listener),
    [reactEditor],
  );
  const getSnapshot = useCallback(
    () => reactEditor.getDocument()?.blocks.revision ?? 0,
    [reactEditor],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

/**
 * Expands collapsed ancestors and, on the page surface, scrolls the target into view.
 *
 * Canvas mode still opens collapsed ancestors so the heading can render inside
 * its card. It does not change pan or zoom.
 *
 * @param reactEditor - Editor that owns the target block.
 * @param blockId - Heading block to reveal.
 * @returns Nothing.
 */
function navigateToTocEntry(reactEditor: ReactEditor, blockId: string): void {
  const collapsedAncestorIds: string[] = [];
  let parentId = reactEditor.blocks.getParentId(blockId);
  while (typeof parentId === "string") {
    const parent = reactEditor.blocks.getBlockNode(parentId);
    if (parent?.listProps.collapsed === true) collapsedAncestorIds.push(parentId);
    const next = reactEditor.blocks.getParentId(parentId);
    if (typeof next !== "string") break;
    parentId = next;
  }
  if (collapsedAncestorIds.length > 0) {
    reactEditor.history.batchUpdates(() => {
      for (const id of collapsedAncestorIds) {
        reactEditor.blocks.updateBlock(id, { listProps: { collapsed: false } });
      }
    });
  }
  if (reactEditor.mode.get() !== "block") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const surface = reactEditor.events.getRoot();
      const target = surface?.querySelector<HTMLElement>(
        `[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`,
      );
      target?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  });
}

/** Quotes callout content as a GitHub-style alert, including its emoji. */
function calloutMarkdown(variant: CalloutVariant, emoji: string, content: string): string {
  const label = variant.toUpperCase();
  const lines = content.length > 0 ? content.split("\n") : [""];
  const quoted = lines.map((line, index) => (
    index === 0 ? `> ${emoji} ${line}`.trimEnd() : `> ${line}`
  ));
  return [`> [!${label}]`, ...quoted].join("\n");
}

/** Renders a bookmark as a Markdown link plus its manual description. */
function bookmarkMarkdown(title: string, url: string, description: string): string {
  const label = title || url;
  const link = url ? `[${label.replaceAll("\n", " ")}](${url})` : title;
  if (!description) return link;
  if (!link) return description;
  return `${link}\n\n${description}`;
}

/** Renders generated headings as a nested-looking Markdown list. */
function tocMarkdown(entries: readonly TocEntry[]): string {
  return entries.map((entry) => {
    const text = entry.text.replaceAll("\n", " ");
    return `${"  ".repeat(Math.max(0, entry.depth - 1))}- ${text}`;
  }).join("\n");
}

/** Wraps a display equation in `$$` fences. */
function mathFence(content: string): string {
  return `$$\n${content}\n$$`;
}

/**
 * Installs one block registration and its clipboard formatter together.
 *
 * @param reactEditor - Runtime receiving both registrations.
 * @param registration - Definition, renderer, and optional slash command.
 * @param formatter - Portable plain, Markdown, and HTML contribution.
 * @returns Nothing. Both registrations dispose with the editor extension lifecycle.
 */
function registerHostBlock(
  reactEditor: ReactEditor,
  registration: ReactBlockRegistration,
  formatter: ClipboardFormatter,
): void {
  blockExtension(registration).setup(reactEditor);
  reactEditor.clipboard.registerFormatter(formatter);
}

/**
 * Editable Markdown inside a note, tip, or warning box.
 *
 * @param blockId - Stable callout block ID.
 * @returns The tone controls and Markdown body, or null after deletion.
 */
function CalloutBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<CalloutProps>(blockId);
  const committedEmoji = editing.getProp("emoji") ?? DEFAULT_CALLOUT_EMOJI;
  const [emojiDraft, setEmojiDraft] = useState<string | null>(null);
  if (!editing.block) return null;
  const variant = editing.getProp("variant") ?? DEFAULT_CALLOUT_VARIANT;
  const emoji = emojiDraft ?? committedEmoji;
  return (
    <div className={`${CALLOUT_CLASS} ${CALLOUT_CLASS}-${variant}`} data-callout-variant={variant}>
      <div className={CALLOUT_CONTROLS_CLASS}>
        <label className={CALLOUT_FIELD_CLASS}>
          Variant
          <select
            value={variant}
            onMouseDown={(event) => {
              if (isClaimedSelectionClick(event)) event.preventDefault();
            }}
            onChange={(event) => {
              const next = event.target.value;
              if (isCalloutVariant(next)) editing.setProp("variant", next);
            }}
          >
            {CALLOUT_VARIANTS.map((option) => (
              <option key={option} value={option}>{CALLOUT_VARIANT_LABELS[option]}</option>
            ))}
          </select>
        </label>
        <label className={CALLOUT_FIELD_CLASS}>
          Emoji
          <input
            className={CALLOUT_EMOJI_CLASS}
            type="text"
            value={emoji}
            maxLength={32}
            spellCheck={false}
            onChange={(event) => setEmojiDraft(event.target.value)}
            onBlur={() => {
              const next = (emojiDraft ?? committedEmoji).trim();
              setEmojiDraft(null);
              if (!next || next === (editing.getProp("emoji") ?? DEFAULT_CALLOUT_EMOJI)) return;
              editing.setProp("emoji", next);
            }}
          />
        </label>
      </div>
      <MarkdownContent blockId={blockId} />
    </div>
  );
}

/**
 * Bookmark with an editable title, a manual description, and an HTTP(S) link.
 *
 * An empty URL shows a setup form. The URL is validated when the form is
 * submitted, so a half-typed value stays in the field and is not written.
 *
 * @param blockId - Stable bookmark block ID.
 * @returns Title, description, and either the link or the URL form.
 */
function BookmarkBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<BookmarkProps>(blockId);
  const committedUrl = editing.getProp("url") ?? "";
  const committedDescription = editing.getProp("description") ?? "";
  const [trackedUrl, setTrackedUrl] = useState(committedUrl);
  const [urlDraft, setUrlDraft] = useState(committedUrl);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState<string | null>(null);
  const urlErrorId = useId();
  if (trackedUrl !== committedUrl) {
    setTrackedUrl(committedUrl);
    setUrlDraft(committedUrl);
    setEditingUrl(false);
    setUrlError(null);
  }
  if (!editing.block) return null;
  const description = descriptionDraft ?? committedDescription;
  const showUrlForm = committedUrl === "" || editingUrl;

  const submitUrl = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = urlDraft.trim();
    if (!isHttpUrl(next)) {
      setUrlError("Enter an HTTP or HTTPS URL.");
      return;
    }
    setUrlError(null);
    if (next !== (editing.getProp("url") ?? "")) editing.setProp("url", next);
    setEditingUrl(false);
  };

  return (
    <div className={BOOKMARK_CLASS}>
      <MarkdownContent blockId={blockId} />
      <label className={BOOKMARK_FIELD_CLASS}>
        Description
        <textarea
          className={BOOKMARK_DESCRIPTION_CLASS}
          rows={2}
          value={description}
          onFocus={() => setDescriptionDraft(editing.getProp("description") ?? "")}
          onChange={(event) => setDescriptionDraft(event.target.value)}
          onBlur={() => {
            const next = descriptionDraft ?? (editing.getProp("description") ?? "");
            setDescriptionDraft(null);
            if (next !== (editing.getProp("description") ?? "")) editing.setProp("description", next);
          }}
        />
      </label>
      {showUrlForm ? (
        <form className={BOOKMARK_FORM_CLASS} noValidate onSubmit={submitUrl}>
          <label className={BOOKMARK_FIELD_CLASS}>
            URL
            <input
              className={BOOKMARK_URL_CLASS}
              type="text"
              inputMode="url"
              value={urlDraft}
              aria-invalid={urlError ? true : undefined}
              aria-describedby={urlError ? urlErrorId : undefined}
              onChange={(event) => {
                setUrlDraft(event.target.value);
                if (urlError) setUrlError(null);
              }}
            />
          </label>
          <div className={BOOKMARK_ACTIONS_CLASS}>
            <button
              type="submit"
              onClick={(event) => {
                if (isClaimedSelectionClick(event)) event.preventDefault();
              }}
            >
              Save link
            </button>
            {committedUrl ? (
              <button
                type="button"
                onClick={(event) => {
                  if (isClaimedSelectionClick(event)) return;
                  setEditingUrl(false);
                  setUrlDraft(editing.getProp("url") ?? "");
                  setUrlError(null);
                }}
              >
                Cancel
              </button>
            ) : null}
          </div>
          {urlError ? <p id={urlErrorId} className={BOOKMARK_ERROR_CLASS} role="alert">{urlError}</p> : null}
        </form>
      ) : (
        <div className={BOOKMARK_ACTIONS_CLASS}>
          <a
            className={BOOKMARK_LINK_CLASS}
            href={committedUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (isClaimedSelectionClick(event)) event.preventDefault();
            }}
          >
            {committedUrl}
          </a>
          <button
            type="button"
            onClick={(event) => {
              if (isClaimedSelectionClick(event)) return;
              setUrlDraft(editing.getProp("url") ?? "");
              setUrlError(null);
              setEditingUrl(true);
            }}
          >
            Change URL
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Lists headings in the parent subtree, or the whole root forest at the root.
 *
 * The list is derived on each document revision. Activating an entry expands
 * collapsed ancestors and scrolls the owning block into view on the page.
 *
 * @param blockId - Stable table-of-contents block ID.
 * @returns A structural selection region containing the heading list.
 */
function TableOfContentsBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId, { textEdit: false });
  const reactEditor = useReactEditor();
  const revision = useDocumentBlockRevision();
  const entries = useMemo(
    () => collectTocEntries(tocDocumentView(reactEditor), blockId),
    [blockId, reactEditor, revision],
  );
  if (!editing.block) return null;
  return (
    <div {...editing.attributes} className={TOC_CLASS}>
      <nav aria-label="Table of contents">
        {entries.length === 0 ? <p className={TOC_EMPTY_CLASS}>No headings</p> : (
          <ol className={TOC_LIST_CLASS}>
            {entries.map((entry, index) => {
              const label = entry.text.trim() || "Empty heading";
              return (
                <li className={TOC_ENTRY_CLASS} key={`${entry.blockId}:${index}`}>
                  <button
                    type="button"
                    data-toc-entry=""
                    data-toc-target={entry.blockId}
                    style={{ paddingInlineStart: `${(entry.depth - 1) * 12}px` }}
                    onClick={(event) => {
                      if (isClaimedSelectionClick(event)) return;
                      navigateToTocEntry(reactEditor, entry.blockId);
                    }}
                  >
                    {label}
                  </button>
                </li>
              );
            })}
          </ol>
        )}
      </nav>
    </div>
  );
}

/**
 * Editable LaTeX source with a display-mode KaTeX preview.
 *
 * Parse errors stay in the source and are shown from KaTeX's own markup.
 *
 * @param blockId - Stable math equation block ID.
 * @returns The source editor and preview, or null after deletion.
 */
function MathEquationBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  const source = editing.block?.content ?? "";
  const rendered = useMemo(() => renderEquation(source), [source]);
  if (!editing.block) return null;
  const empty = source.trim() === "";
  return (
    <div className={MATH_CLASS}>
      <div
        {...editing.attributes}
        className={`${PAGE_BLOCK_CONTENT_CLASS} ${MATH_SOURCE_CLASS}`}
        role="textbox"
        aria-label="Equation source"
        aria-multiline="true"
        spellCheck={false}
      />
      <div className={MATH_PREVIEW_CLASS} data-math-preview="" aria-label="Equation preview">
        {empty ? <p className={MATH_EMPTY_CLASS}>Equation preview</p> : (
          <>
            {rendered.html ? <div dangerouslySetInnerHTML={{ __html: rendered.html }} /> : null}
            {rendered.invalid ? <p className={MATH_ERROR_CLASS} role="alert">Invalid formula</p> : null}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Registers the callout block and its quoted Markdown clipboard form.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function calloutBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.callout",
    setup: (reactEditor) => {
      registerHostBlock(reactEditor, {
        definition: calloutBlockDefinition,
        render: CalloutBlock,
        slashCommand: {
          title: "Callout",
          group: "Turn into",
          keywords: ["note", "tip", "warning", "admonition"],
        },
      }, {
        id: "demo.callout",
        matches: ({ block }) => block.type === CALLOUT_BLOCK_TYPE,
        format: ({ block, depth, children }): PortableBlockFormats => {
          const rawVariant = String(block.props.variant ?? "");
          const variant = isCalloutVariant(rawVariant) ? rawVariant : DEFAULT_CALLOUT_VARIANT;
          const emoji = typeof block.props.emoji === "string" && block.props.emoji
            ? block.props.emoji
            : DEFAULT_CALLOUT_EMOJI;
          const markdown = indentLines(calloutMarkdown(variant, emoji, block.content), depth);
          const plain = indentLines(`${emoji} ${block.content}`.trimEnd(), depth);
          const body = escapeHtml(block.content).replace(/\r\n?|\n/g, "<br>");
          return {
            plain: joinPortableText(plain, children.plain),
            markdown: joinPortableText(markdown, children.markdown),
            html: `<blockquote>${escapeHtml(emoji)} ${body}</blockquote>${children.html}`,
          };
        },
      });
    },
  };
}

/**
 * Registers the bookmark block and its link clipboard form.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function bookmarkBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.bookmark",
    setup: (reactEditor) => {
      registerHostBlock(reactEditor, {
        definition: bookmarkBlockDefinition,
        render: BookmarkBlock,
        slashCommand: {
          title: "Bookmark",
          group: "Turn into",
          keywords: ["link", "url", "hyperlink"],
        },
      }, {
        id: "demo.bookmark",
        matches: ({ block }) => block.type === BOOKMARK_BLOCK_TYPE,
        format: ({ block, depth, children }): PortableBlockFormats => {
          const url = typeof block.props.url === "string" ? block.props.url : "";
          const description = typeof block.props.description === "string" ? block.props.description : "";
          const safeUrl = isHttpUrl(url) ? url : "";
          const markdown = indentLines(bookmarkMarkdown(block.content, safeUrl, description), depth);
          const plain = indentLines(
            [block.content, safeUrl, description].filter((line) => line.length > 0).join("\n"),
            depth,
          );
          const title = escapeHtml(block.content || safeUrl);
          const link = safeUrl
            ? `<a href="${escapeHtml(safeUrl)}">${title}</a>`
            : title;
          const descriptionHtml = description ? `<p>${escapeHtml(description)}</p>` : "";
          return {
            plain: joinPortableText(plain, children.plain),
            markdown: joinPortableText(markdown, children.markdown),
            html: `<p>${link}</p>${descriptionHtml}${children.html}`,
          };
        },
      });
    },
  };
}

/**
 * Registers the table-of-contents block.
 *
 * Slash conversion is offered only when the block has no text of its own, so
 * turning a paragraph into a table of contents cannot hide existing writing.
 * Clipboard text is the generated heading list, not the empty stored content.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function tableOfContentsBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.table-of-contents",
    setup: (reactEditor) => {
      registerHostBlock(reactEditor, {
        definition: tableOfContentsBlockDefinition,
        render: TableOfContentsBlock,
        slashCommand: {
          title: "Table of contents",
          group: "Turn into",
          keywords: ["toc", "outline", "contents", "headings"],
          isAvailable: ({ blockId }) => {
            const content = reactEditor.blocks.getBlockNode(blockId)?.content;
            return content !== undefined && isTocConversionAvailable(content);
          },
        },
      }, {
        id: "demo.table-of-contents",
        matches: ({ block }) => block.type === TABLE_OF_CONTENTS_BLOCK_TYPE,
        format: ({ block, depth, children }): PortableBlockFormats => {
          const entries = collectTocEntries(tocDocumentView(reactEditor), block.id);
          const markdown = indentLines(tocMarkdown(entries), depth);
          const items = entries.map((entry) => `<li>${escapeHtml(entry.text)}</li>`).join("");
          return {
            plain: joinPortableText(markdown, children.plain),
            markdown: joinPortableText(markdown, children.markdown),
            html: `<ul>${items}</ul>${children.html}`,
          };
        },
      });
    },
  };
}

/**
 * Registers the math equation block and its fenced display-math clipboard form.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function mathEquationBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.math-equation",
    setup: (reactEditor) => {
      registerHostBlock(reactEditor, {
        definition: mathEquationBlockDefinition,
        render: MathEquationBlock,
        slashCommand: {
          title: "Math equation",
          group: "Turn into",
          keywords: ["math", "latex", "katex", "formula", "equation"],
        },
      }, {
        id: "demo.math-equation",
        matches: ({ block }) => block.type === MATH_EQUATION_BLOCK_TYPE,
        format: ({ block, depth, children }): PortableBlockFormats => {
          const fence = indentLines(mathFence(block.content), depth);
          const rendered = renderEquation(block.content);
          const html = rendered.html || `<pre>${escapeHtml(block.content)}</pre>`;
          return {
            plain: joinPortableText(fence, children.plain),
            markdown: joinPortableText(fence, children.markdown),
            html: `${html}${children.html}`,
          };
        },
      });
    },
  };
}
