/**
 * Demo extensions for note, tip, warning, bookmark, table of contents, and math.
 *
 * Each factory registers one block through the public `blockExtension` API and
 * a portable clipboard formatter. The shared block shell still owns selection,
 * drag, and child layout. Note, tip, and warning are separate block types, each
 * with its own slash command.
 *
 * @module
 */
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
import { Link2Icon, PencilIcon } from "lucide-react";
import {
  useCallback,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type FormEvent,
  type MouseEvent,
} from "react";
import { Badge } from "../../../../packages/react-rivto-editor/src/components/ui/badge";
import { Button } from "../../../../packages/react-rivto-editor/src/components/ui/button";
import { Input } from "../../../../packages/react-rivto-editor/src/components/ui/input";
import { Label } from "../../../../packages/react-rivto-editor/src/components/ui/label";
import { Textarea } from "../../../../packages/react-rivto-editor/src/components/ui/textarea";
import {
  ADMONITION_BLOCK_TYPE,
  ADMONITION_DEFAULT_EMOJI,
  ADMONITION_LABELS,
  BOOKMARK_BLOCK_TYPE,
  MATH_BLOCK_TYPE,
  TABLE_OF_CONTENTS_BLOCK_TYPE,
  admonitionTone,
  bookmarkBlockDefinition,
  isHttpUrl,
  mathBlockDefinition,
  noteBlockDefinition,
  tableOfContentsBlockDefinition,
  tipBlockDefinition,
  warningBlockDefinition,
  type AdmonitionProps,
  type AdmonitionTone,
  type BookmarkProps,
} from "./definitions";
import { evaluateMathSource } from "./math-value";
import {
  collectTocEntries,
  isTocConversionAvailable,
  type TocDocumentView,
  type TocEntry,
} from "./toc-entries";

const BLOCK_FRAME_CLASS = "box-border w-full min-w-0 max-w-full";
const SCREEN_READER_CLASS = "sr-only";
/** Left accent drawn inline so it wins over the shared `border` shorthand. */
const ACCENT_RULE_WIDTH = 3;

const ADMONITION_ACCENT: Record<AdmonitionTone, string> = {
  note: "var(--rivto-primary)",
  tip: "var(--rivto-subtle-foreground)",
  warning: "var(--rivto-destructive)",
};
const ADMONITION_CLASS = `demo-callout ${BLOCK_FRAME_CLASS} flex items-start gap-2 rounded-lg border border-solid py-2 pr-2 pl-3`;
const ADMONITION_SURFACE_CLASS: Record<AdmonitionTone, string> = {
  note: "border-primary/20 bg-muted/70",
  tip: "border-primary/15 bg-accent/60",
  warning: "border-destructive/25 bg-destructive/10",
};
const ADMONITION_EMOJI_CLASS = "demo-callout-emoji mt-0.5 size-8 shrink-0 rounded-md border-border/80 bg-background/80 px-0 text-center text-base shadow-none";
const ADMONITION_BODY_CLASS = "demo-callout-body min-w-0 flex-1 text-foreground";
const ADMONITION_BADGE_CLASS = "demo-callout-tone mt-0.5 shrink-0";
const ADMONITION_DEFINITION = {
  note: noteBlockDefinition,
  tip: tipBlockDefinition,
  warning: warningBlockDefinition,
} as const;
const ADMONITION_KEYWORDS: Record<AdmonitionTone, readonly string[]> = {
  note: ["note", "info"],
  tip: ["tip", "hint"],
  warning: ["warning", "caution", "alert"],
};
const BOOKMARK_CLASS = `demo-bookmark ${BLOCK_FRAME_CLASS} flex flex-col gap-1 rounded-lg border border-solid border-border bg-card px-3 py-2.5 shadow-xs`;
const BOOKMARK_TITLE_CLASS = "demo-bookmark-title min-w-0 text-sm font-semibold leading-snug text-foreground";
const BOOKMARK_DESCRIPTION_CLASS = "demo-bookmark-description field-sizing-content min-h-5 resize-none border-transparent bg-transparent px-0 py-0 text-xs leading-5 text-muted-foreground shadow-none placeholder:text-muted-foreground/70 md:text-xs";
const BOOKMARK_META_CLASS = "demo-bookmark-meta mt-1 flex min-w-0 items-center gap-2";
const BOOKMARK_FORM_CLASS = "demo-bookmark-form mt-1 flex min-w-0 flex-wrap items-center gap-2";
const BOOKMARK_URL_CLASS = "demo-bookmark-url h-8 min-w-0 flex-1 basis-40";
const BOOKMARK_LINK_CLASS = "demo-bookmark-link inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary";
const BOOKMARK_HOST_CLASS = "truncate";
const MESSAGE_CLASS = "m-0 text-sm text-destructive";
const QUIET_CLASS = "m-0 text-sm text-muted-foreground";
const TOC_CLASS = `demo-toc ${BLOCK_FRAME_CLASS} min-h-(--rivto-default-block-height) rounded-r-md bg-muted/40 py-1 pr-1 pl-3`;
const TOC_LIST_CLASS = "demo-toc-list m-0 list-none p-0";
const TOC_ENTRY_CLASS = "demo-toc-entry";
const TOC_BUTTON_CLASS = "h-auto w-full justify-start rounded-md px-1.5 py-1 text-left text-sm font-normal text-foreground";
const MATH_CLASS = `demo-math ${BLOCK_FRAME_CLASS} flex items-stretch overflow-hidden rounded-lg border border-solid border-border bg-card`;
const MATH_SOURCE_CLASS = "demo-math-source min-h-[4.5em] min-w-0 flex-1 border-r border-solid border-border bg-background px-3 py-2 font-mono text-sm";
const MATH_VALUE_CLASS = "demo-math-value flex w-40 max-w-[40%] shrink-0 items-center justify-end bg-muted/50 px-3 py-2 text-right font-mono text-sm break-words";
const PAGE_BLOCK_CONTENT_CLASS = "page-block-content";

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
function isClaimedSelectionClick(event: Pick<MouseEvent, "defaultPrevented" | "ctrlKey" | "metaKey">): boolean {
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

/** Quotes admonition content as a GitHub-style alert, including its emoji. */
function admonitionMarkdown(tone: AdmonitionTone, emoji: string, content: string): string {
  const label = tone.toUpperCase();
  const lines = content.length > 0 ? content.split("\n") : [""];
  const quoted = lines.map((line, index) => (
    index === 0 ? `> ${emoji} ${line}`.trimEnd() : `> ${line}`
  ));
  return [`> [!${label}]`, ...quoted].join("\n");
}

/**
 * Returns the site name shown on a bookmark card.
 *
 * Link previews show the hostname, not the full path. A leading `www.` is dropped.
 *
 * @param url - Committed HTTP(S) URL.
 * @returns Hostname, or the original string when it cannot be parsed.
 */
function bookmarkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
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

/** Renders a math source plus its evaluated value when evaluation succeeds. */
function mathMarkdown(content: string): string {
  const evaluated = evaluateMathSource(content);
  if (!evaluated.value) return content;
  if (!content) return `= ${evaluated.value}`;
  return `${content}\n\n= ${evaluated.value}`;
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
 * The tone comes from the block type. Slash commands create each type on its own.
 *
 * @param blockId - Stable admonition block ID.
 * @returns The emoji, Markdown body, and tone badge, or null after deletion.
 */
function AdmonitionBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing<AdmonitionProps>(blockId);
  const emojiId = useId();
  const tone = admonitionTone(editing.block?.type ?? "") ?? "note";
  const committedEmoji = editing.getProp("emoji") ?? ADMONITION_DEFAULT_EMOJI[tone];
  const [emojiDraft, setEmojiDraft] = useState<string | null>(null);
  if (!editing.block) return null;
  const emoji = emojiDraft ?? committedEmoji;
  return (
    <div
      className={`${ADMONITION_CLASS} ${ADMONITION_SURFACE_CLASS[tone]}`}
      data-callout-tone={tone}
      style={{ borderLeftWidth: ACCENT_RULE_WIDTH, borderLeftColor: ADMONITION_ACCENT[tone] }}
    >
      <Label className={SCREEN_READER_CLASS} htmlFor={emojiId}>Emoji</Label>
      <Input
        id={emojiId}
        className={ADMONITION_EMOJI_CLASS}
        type="text"
        value={emoji}
        maxLength={32}
        spellCheck={false}
        onMouseDown={(event) => {
          if (isClaimedSelectionClick(event)) event.preventDefault();
        }}
        onChange={(event) => setEmojiDraft(event.target.value)}
        onBlur={() => {
          const next = (emojiDraft ?? committedEmoji).trim();
          setEmojiDraft(null);
          if (!next || next === (editing.getProp("emoji") ?? ADMONITION_DEFAULT_EMOJI[tone])) return;
          editing.setProp("emoji", next);
        }}
      />
      <div className={ADMONITION_BODY_CLASS}>
        <MarkdownContent blockId={blockId} />
      </div>
      <Badge variant="outline" className={ADMONITION_BADGE_CLASS}>{ADMONITION_LABELS[tone]}</Badge>
    </div>
  );
}

/**
 * Bookmark with an editable title, a manual description, and an HTTP(S) link.
 *
 * A saved link shows the page title, the description, and the site name,
 * which is the usual link-preview stack. An empty URL shows a paste field.
 * The URL is validated when the form is submitted, so a half-typed value
 * stays in the field and is not written.
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
  const descriptionId = useId();
  const urlId = useId();
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
      <div className={BOOKMARK_TITLE_CLASS}>
        <MarkdownContent blockId={blockId} />
      </div>
      <Label className={SCREEN_READER_CLASS} htmlFor={descriptionId}>Description</Label>
      <Textarea
        id={descriptionId}
        className={BOOKMARK_DESCRIPTION_CLASS}
        rows={1}
        value={description}
        placeholder="Add a description"
        onFocus={() => setDescriptionDraft(editing.getProp("description") ?? "")}
        onChange={(event) => setDescriptionDraft(event.target.value)}
        onBlur={() => {
          const next = descriptionDraft ?? (editing.getProp("description") ?? "");
          setDescriptionDraft(null);
          if (next !== (editing.getProp("description") ?? "")) editing.setProp("description", next);
        }}
      />
      {showUrlForm ? (
        <form className={BOOKMARK_FORM_CLASS} noValidate onSubmit={submitUrl}>
          <Label className={SCREEN_READER_CLASS} htmlFor={urlId}>URL</Label>
          <Input
            id={urlId}
            className={BOOKMARK_URL_CLASS}
            type="text"
            inputMode="url"
            value={urlDraft}
            placeholder="Paste a link"
            aria-invalid={urlError ? true : undefined}
            aria-describedby={urlError ? urlErrorId : undefined}
            onChange={(event) => {
              setUrlDraft(event.target.value);
              if (urlError) setUrlError(null);
            }}
          />
          <Button
            type="submit"
            size="sm"
            onClick={(event) => {
              if (isClaimedSelectionClick(event)) event.preventDefault();
            }}
          >
            Save link
          </Button>
          {committedUrl ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(event) => {
                if (isClaimedSelectionClick(event)) return;
                setEditingUrl(false);
                setUrlDraft(editing.getProp("url") ?? "");
                setUrlError(null);
              }}
            >
              Cancel
            </Button>
          ) : null}
          {urlError ? <p id={urlErrorId} className={`${MESSAGE_CLASS} basis-full`} role="alert">{urlError}</p> : null}
        </form>
      ) : (
        <div className={BOOKMARK_META_CLASS}>
          <a
            className={BOOKMARK_LINK_CLASS}
            href={committedUrl}
            title={committedUrl}
            aria-label={committedUrl}
            target="_blank"
            rel="noreferrer"
            onClick={(event) => {
              if (isClaimedSelectionClick(event)) event.preventDefault();
            }}
          >
            <Link2Icon className="size-3 shrink-0 pointer-events-none" aria-hidden="true" />
            <span className={BOOKMARK_HOST_CLASS}>{bookmarkHost(committedUrl)}</span>
          </a>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="ml-auto text-muted-foreground"
            aria-label="Change URL"
            onClick={(event) => {
              if (isClaimedSelectionClick(event)) return;
              setUrlDraft(editing.getProp("url") ?? "");
              setUrlError(null);
              setEditingUrl(true);
            }}
          >
            <PencilIcon className="pointer-events-none" aria-hidden="true" />
          </Button>
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
    <div
      {...editing.attributes}
      className={TOC_CLASS}
      style={{ borderLeftWidth: ACCENT_RULE_WIDTH, borderLeftStyle: "solid", borderLeftColor: "var(--rivto-primary)" }}
    >
      <nav aria-label="Table of contents">
        {entries.length === 0 ? <p className={QUIET_CLASS}>No headings</p> : (
          <ol className={TOC_LIST_CLASS}>
            {entries.map((entry, index) => {
              const label = entry.text.trim() || "Empty heading";
              return (
                <li className={TOC_ENTRY_CLASS} key={`${entry.blockId}:${index}`}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className={TOC_BUTTON_CLASS}
                    data-toc-entry=""
                    data-toc-target={entry.blockId}
                    style={{ paddingInlineStart: `${(entry.depth - 1) * 12}px` }}
                    onClick={(event) => {
                      if (isClaimedSelectionClick(event)) return;
                      navigateToTocEntry(reactEditor, entry.blockId);
                    }}
                  >
                    {label}
                  </Button>
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
 * Multiline mathjs source with the evaluated value on the right.
 *
 * Lines share one scope, so a later line can use a name assigned above.
 * Invalid lines stay in the editor and show the library message in the value column.
 *
 * @param blockId - Stable math block ID.
 * @returns The source editor and result, or null after deletion.
 */
function MathBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  const source = editing.block?.content ?? "";
  const evaluated = useMemo(() => evaluateMathSource(source), [source]);
  if (!editing.block) return null;
  return (
    <div className={MATH_CLASS}>
      <div
        {...editing.attributes}
        className={`${PAGE_BLOCK_CONTENT_CLASS} ${MATH_SOURCE_CLASS}`}
        role="textbox"
        aria-label="Math source"
        aria-multiline="true"
        spellCheck={false}
      />
      <div className={MATH_VALUE_CLASS} data-math-value="" aria-label="Math result">
        {evaluated.error ? (
          <p className={MESSAGE_CLASS} role="alert">{evaluated.error}</p>
        ) : (
          <p className="m-0 font-medium text-foreground">{evaluated.value}</p>
        )}
      </div>
    </div>
  );
}

/**
 * Registers one admonition type and its quoted Markdown clipboard form.
 *
 * @param tone - Note, tip, or warning. Each tone is its own block type.
 * @returns An extension that installs that type wherever it is set up.
 */
function admonitionBlockExtension(tone: AdmonitionTone): ReactEditorExtension {
  const type = ADMONITION_BLOCK_TYPE[tone];
  return {
    id: type,
    setup: (reactEditor) => {
      registerHostBlock(reactEditor, {
        definition: ADMONITION_DEFINITION[tone],
        render: AdmonitionBlock,
        slashCommand: {
          title: ADMONITION_LABELS[tone],
          group: "Turn into",
          keywords: [...ADMONITION_KEYWORDS[tone]],
        },
      }, {
        id: type,
        matches: ({ block }) => block.type === type,
        format: ({ block, depth, children }): PortableBlockFormats => {
          const emoji = typeof block.props.emoji === "string" && block.props.emoji
            ? block.props.emoji
            : ADMONITION_DEFAULT_EMOJI[tone];
          const markdown = indentLines(admonitionMarkdown(tone, emoji, block.content), depth);
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

/** @returns The note block extension. Invoke it with `/note`. */
export function noteBlockExtension(): ReactEditorExtension {
  return admonitionBlockExtension("note");
}

/** @returns The tip block extension. Invoke it with `/tip`. */
export function tipBlockExtension(): ReactEditorExtension {
  return admonitionBlockExtension("tip");
}

/** @returns The warning block extension. Invoke it with `/warning`. */
export function warningBlockExtension(): ReactEditorExtension {
  return admonitionBlockExtension("warning");
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
 * Registers the math block and a clipboard form that includes the evaluated value.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function mathBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.math",
    setup: (reactEditor) => {
      registerHostBlock(reactEditor, {
        definition: mathBlockDefinition,
        render: MathBlock,
        slashCommand: {
          title: "Math",
          group: "Turn into",
          keywords: ["math", "calculate", "evaluate", "expression"],
        },
      }, {
        id: "demo.math",
        matches: ({ block }) => block.type === MATH_BLOCK_TYPE,
        format: ({ block, depth, children }): PortableBlockFormats => {
          const evaluated = evaluateMathSource(block.content);
          const markdown = indentLines(mathMarkdown(block.content), depth);
          const plain = indentLines(
            evaluated.value ? `${block.content}\n= ${evaluated.value}` : block.content,
            depth,
          );
          const valueHtml = evaluated.value
            ? `<p>= ${escapeHtml(evaluated.value)}</p>`
            : evaluated.error
              ? `<p>${escapeHtml(evaluated.error)}</p>`
              : "";
          return {
            plain: joinPortableText(plain, children.plain),
            markdown: joinPortableText(markdown, children.markdown),
            html: `<pre>${escapeHtml(block.content)}</pre>${valueHtml}${children.html}`,
          };
        },
      });
    },
  };
}

/** Host blocks installed together on every demo editor. */
export const hostBlockExtensions: readonly ReactEditorExtension[] = [
  noteBlockExtension(),
  tipBlockExtension(),
  warningBlockExtension(),
  bookmarkBlockExtension(),
  tableOfContentsBlockExtension(),
  mathBlockExtension(),
];
