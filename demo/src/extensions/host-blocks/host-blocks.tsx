/**
 * Demo extensions for note, tip, warning, bookmark, table of contents, and math.
 *
 * Each factory registers one block through the public block-type API and
 * a portable clipboard formatter. The shared block shell still owns selection,
 * drag, and child layout. Note, tip, and warning are separate block types, each
 * with its own slash command.
 *
 * @module
 */
import {
  BLOCK_ID_ATTRIBUTE,
  BLOCK_TEXT_METADATA_KEY,
  MarkdownContent,
  BlockText,
  useBlockContent,
  useBlockEditing,
  useReactPanel,
  type ClipboardFormatter,
  type PortableBlockFormats,
  type ReactBlockRegistration,
  type ReactEditorApi,
  type ReactPanelApi,
  type ReactEditorExtension,
} from "@chulane/rivto-react/authoring";
import "./host-blocks.css";
import { createCaretSelection } from "@chulane/rivto";
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
import { evaluateMathSource, type MathEvaluation } from "./math-value";
import { collectTocEntries, type TocDocumentView, type TocEntry } from "./toc-entries";

const BLOCK_FRAME_CLASS = "box-border w-full min-w-0 max-w-full";
const SCREEN_READER_CLASS = "sr-only";
/** Left accent drawn inline so it wins over the shared `border` shorthand. */
const ACCENT_RULE_WIDTH = 3;

const ADMONITION_ACCENT: Record<AdmonitionTone, string> = {
  note: "var(--rivto-primary)",
  tip: "var(--rivto-subtle-foreground)",
  warning: "var(--rivto-destructive)",
};

const ADMONITION_CLASS = `demo-callout ${BLOCK_FRAME_CLASS} flex items-center gap-2 rounded-lg py-2 pr-2 pl-3`;
const ADMONITION_SURFACE_CLASS: Record<AdmonitionTone, string> = {
  note: "bg-muted/70",
  tip: "bg-accent/60",
  warning: "bg-destructive/10",
};
const ADMONITION_EMOJI_CLASS =
  "demo-callout-emoji size-8 shrink-0 rounded-md border-0 bg-transparent px-0 text-center text-base shadow-none";
const ADMONITION_BODY_CLASS = "demo-callout-body min-w-0 flex-1 text-foreground";
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
const BOOKMARK_TITLE_CLASS =
  "demo-bookmark-title min-w-0 text-sm font-semibold leading-snug text-foreground";
const BOOKMARK_DESCRIPTION_CLASS =
  "demo-bookmark-description field-sizing-content min-h-5 resize-none border-transparent bg-transparent px-0 py-0 text-xs leading-5 text-muted-foreground shadow-none placeholder:text-muted-foreground/70 md:text-xs";
const BOOKMARK_META_CLASS = "demo-bookmark-meta mt-1 flex min-w-0 items-center gap-2";
const BOOKMARK_FORM_CLASS = "demo-bookmark-form mt-1 flex min-w-0 flex-wrap items-center gap-2";
const BOOKMARK_URL_CLASS = "demo-bookmark-url h-8 min-w-0 flex-1 basis-40";
const BOOKMARK_LINK_CLASS =
  "demo-bookmark-link inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-primary";
const BOOKMARK_HOST_CLASS = "truncate";
const MESSAGE_CLASS = "m-0 text-sm text-destructive";
const QUIET_CLASS = "m-0 text-sm text-muted-foreground";
const TOC_CLASS = `demo-toc ${BLOCK_FRAME_CLASS} min-h-(--rivto-default-block-height) rounded-r-md bg-muted/40 py-1 pr-1 pl-3`;
const TOC_LIST_CLASS = "demo-toc-list m-0 list-none p-0";
const TOC_ENTRY_CLASS = "demo-toc-entry";
const TOC_BUTTON_CLASS =
  "h-auto w-full justify-start rounded-md px-1.5 py-1 text-left text-sm font-normal text-foreground";
const MATH_CLASS = `demo-math ${BLOCK_FRAME_CLASS}`;
const MATH_SOURCE_CLASS = "demo-math-source";
const MATH_VALUE_CLASS = "demo-math-value";
const PAGE_BLOCK_CONTENT_CLASS = "page-block-content";

/** Escapes text that will be placed in a portable HTML clipboard flavor. */
function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;",
      })[character] ?? character,
  );
}

/** Joins a block's own portable text with its already formatted descendants. */
function joinPortableText(own: string, children: string): string {
  if (!own) {
    return children;
  }
  if (!children) {
    return own;
  }
  return `${own}\n${children}`;
}

/** Indents every line so nested clipboard text keeps its depth. */
function indentLines(value: string, depth: number): string {
  const indent = "  ".repeat(depth);
  return value
    .split("\n")
    .map((line) => `${indent}${line}`)
    .join("\n");
}

/**
 * Ignores a click that a completed selection drag or modifier selection already claimed.
 *
 * @param event - Click on a native control inside a block.
 * @returns True when the control should not perform its own action.
 */
function isClaimedSelectionClick(
  event: Pick<MouseEvent, "defaultPrevented" | "ctrlKey" | "metaKey">,
): boolean {
  return event.defaultPrevented || event.ctrlKey || event.metaKey;
}

/** Reads the block tree through the public editor API. */
function tocDocumentView(reactEditor: Pick<ReactEditorApi, "blocks">): TocDocumentView {
  return {
    getBlock: (id) => {
      const block = reactEditor.blocks.getBlockNode(id);
      if (!block) {
        return undefined;
      }
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
  const reactEditor = useReactPanel().document;
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
 * Expands collapsed ancestors and, on the page surface, aligns the target with the scroll viewport start.
 *
 * Canvas mode still opens collapsed ancestors so the heading can render inside
 * its card. It does not change pan or zoom.
 *
 * @param panel - Panel that owns navigation and the mounted surface.
 * @param blockId - Heading block to reveal.
 * @returns After scheduling the page scroll, or after expanding ancestors on canvas.
 */
function navigateToTocEntry(panel: ReactPanelApi, blockId: string): void {
  const reactEditor = panel.document;
  const collapsedAncestorIds: string[] = [];
  let parentId = reactEditor.blocks.getParentId(blockId);
  while (typeof parentId === "string") {
    const parent = reactEditor.blocks.getBlockNode(parentId);
    if (parent?.listProps.collapsed === true) {
      collapsedAncestorIds.push(parentId);
    }
    const next = reactEditor.blocks.getParentId(parentId);
    if (typeof next !== "string") {
      break;
    }
    parentId = next;
  }
  if (collapsedAncestorIds.length > 0) {
    reactEditor.history.batchUpdates(() => {
      for (const id of collapsedAncestorIds) {
        reactEditor.blocks.updateBlock(id, { listProps: { collapsed: false } });
      }
    });
  }
  if (panel.getSurfaceType() !== "block") {
    return;
  }
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const surface = panel.getRoot();
      const target = surface?.querySelector<HTMLElement>(
        `[${BLOCK_ID_ATTRIBUTE}="${CSS.escape(blockId)}"]`,
      );
      target?.scrollIntoView({ block: "start", inline: "nearest" });
      // Offscreen content can acquire its real height after the first scroll.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (target?.isConnected) {
            target.scrollIntoView({ block: "start", inline: "nearest" });
          }
        });
      });
    });
  });
}

/** Quotes admonition content as a GitHub-style alert, including its emoji. */
function admonitionMarkdown(tone: AdmonitionTone, emoji: string, content: string): string {
  const label = tone.toUpperCase();
  const lines = content.length > 0 ? content.split("\n") : [""];
  const quoted = lines.map((line, index) =>
    index === 0 ? `> ${emoji} ${line}`.trimEnd() : `> ${line}`,
  );
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
  if (!description) {
    return link;
  }
  if (!link) {
    return description;
  }
  return `${link}\n\n${description}`;
}

/** Renders generated headings as a nested-looking Markdown list. */
function tocMarkdown(entries: readonly TocEntry[]): string {
  return entries
    .map((entry) => {
      const text = entry.text.replaceAll("\n", " ");
      return `${"  ".repeat(Math.max(0, entry.depth - 1))}- ${text}`;
    })
    .join("\n");
}

/**
 * Pairs each source line with its successfully evaluated value for clipboard text.
 *
 * @param content - Original multiline source.
 * @param evaluated - Results in the same order as the source lines.
 * @returns Source lines and their values, preserving blank and invalid lines.
 */
function mathMarkdown(content: string, evaluated: readonly MathEvaluation[]): string {
  return content
    .split(/\r?\n/)
    .map((line, index) => {
      const value = evaluated[index]?.value;
      return value ? `${line}\n= ${value}` : line;
    })
    .join("\n");
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
  reactEditor: ReactEditorApi,
  registration: ReactBlockRegistration,
  formatter: ClipboardFormatter,
): void {
  reactEditor.blockTypes.register(registration);
  reactEditor.clipboardFormats.registerFormatter(formatter);
}

/** Input state and mutation callback for the callout's independent emoji control. */
interface AdmonitionEmojiProps {
  readonly blockId: string;
  readonly tone: AdmonitionTone;
  readonly committedEmoji: string;
  readonly onCommit: (emoji: string) => void;
}

/**
 * Edits the callout emoji without claiming the block's selection gestures.
 *
 * The draft stays local until blur; the current document value is checked before
 * writing to avoid committing the same emoji again.
 *
 * @param props - Callout identity, tone, current emoji and mutation callback.
 * @param props.blockId - Persisted callout whose live emoji is checked on blur.
 * @param props.tone - Tone supplying the default emoji when none is persisted.
 * @param props.committedEmoji - Emoji from the current block snapshot.
 * @param props.onCommit - Writes a changed, nonempty emoji when the input blurs.
 * @returns Accessible emoji input with a local draft.
 */
function AdmonitionEmoji({ blockId, tone, committedEmoji, onCommit }: AdmonitionEmojiProps) {
  const panel = useReactPanel();
  const emojiId = useId();
  const [emojiDraft, setEmojiDraft] = useState<string | null>(null);
  return (
    <>
      <Label className={SCREEN_READER_CLASS} htmlFor={emojiId}>
        Emoji
      </Label>
      <Input
        id={emojiId}
        className={ADMONITION_EMOJI_CLASS}
        type="text"
        value={emojiDraft ?? committedEmoji}
        maxLength={32}
        spellCheck={false}
        onMouseDown={(event) => {
          if (isClaimedSelectionClick(event)) {
            event.preventDefault();
          }
        }}
        onChange={(event) => setEmojiDraft(event.target.value)}
        onBlur={() => {
          const next = (emojiDraft ?? committedEmoji).trim();
          setEmojiDraft(null);
          if (
            !next ||
            next ===
              (panel.blocks.getBlockNode(blockId)?.props.emoji ?? ADMONITION_DEFAULT_EMOJI[tone])
          ) {
            return;
          }
          onCommit(next);
        }}
      />
    </>
  );
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
  const tone = admonitionTone(editing.block?.type ?? "") ?? "note";
  const committedEmoji = editing.block?.props.emoji ?? ADMONITION_DEFAULT_EMOJI[tone];
  if (!editing.block) {
    return null;
  }
  return (
    <div
      className={`${ADMONITION_CLASS} ${ADMONITION_SURFACE_CLASS[tone]}`}
      data-callout-tone={tone}
      style={{
        borderLeftWidth: ACCENT_RULE_WIDTH,
        borderLeftStyle: "solid",
        borderLeftColor: ADMONITION_ACCENT[tone],
      }}
      role="group"
      aria-label={ADMONITION_LABELS[tone]}
    >
      <AdmonitionEmoji
        blockId={blockId}
        tone={tone}
        committedEmoji={committedEmoji}
        onCommit={(emoji) => editing.operations.setProp("emoji", emoji)}
      />
      <div className={ADMONITION_BODY_CLASS}>
        <MarkdownContent blockId={blockId} />
      </div>
    </div>
  );
}

/** Live block reads used before committing a bookmark control draft. */
interface BookmarkBlockReader {
  readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode">;
}

/**
 * Reads a bookmark property from the current document snapshot.
 *
 * @param panel - Borrowed block lookup for the invoking occurrence.
 * @param blockId - Persisted bookmark ID.
 * @param key - Property to inspect before committing a draft.
 * @returns Current string value, or an empty string when absent or non-string.
 */
function readBookmarkProp(panel: BookmarkBlockReader, blockId: string, key: keyof BookmarkProps) {
  const value = panel.blocks.getBlockNode(blockId)?.props[key];
  return typeof value === "string" ? value : "";
}

/** Current persisted value and write callback for one bookmark field. */
interface BookmarkFieldProps {
  readonly blockId: string;
  readonly committed: string;
  readonly onCommit: (value: string) => void;
}

/**
 * Edits the manual description and commits its draft on blur.
 *
 * @param props - Bookmark identity, current description and write callback.
 * @param props.blockId - Persisted bookmark whose live property is checked on blur.
 * @param props.committed - Description from the current block snapshot.
 * @param props.onCommit - Writes a changed description after focus leaves the field.
 * @returns Accessible description textarea with a local draft.
 */
function BookmarkDescription({ blockId, committed, onCommit }: BookmarkFieldProps) {
  const panel = useReactPanel();
  const [draft, setDraft] = useState<string | null>(null);
  const descriptionId = useId();
  return (
    <>
      <Label className={SCREEN_READER_CLASS} htmlFor={descriptionId}>
        Description
      </Label>
      <Textarea
        id={descriptionId}
        className={BOOKMARK_DESCRIPTION_CLASS}
        rows={1}
        value={draft ?? committed}
        placeholder="Add a description"
        onFocus={() => setDraft(readBookmarkProp(panel, blockId, "description"))}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => {
          const next = draft ?? readBookmarkProp(panel, blockId, "description");
          setDraft(null);
          if (next !== readBookmarkProp(panel, blockId, "description")) {
            onCommit(next);
          }
        }}
      />
    </>
  );
}

/** Values needed to validate and commit a URL form submission. */
interface BookmarkUrlSubmission {
  readonly urlDraft: string;
  readonly currentUrl: () => string;
  readonly onCommit: (value: string) => void;
  readonly setUrlError: (error: string | null) => void;
  readonly setEditingUrl: (editing: boolean) => void;
}

/**
 * Validates and commits the submitted URL, keeping invalid text in the form.
 *
 * @param event - Form submission event.
 * @param state - Current draft, live URL reader and form update callbacks.
 * @returns Updates validation state and commits a changed HTTP(S) URL.
 * @throws If the delegated property update fails.
 */
function submitBookmarkUrl(event: FormEvent<HTMLFormElement>, state: BookmarkUrlSubmission): void {
  event.preventDefault();
  const next = state.urlDraft.trim();
  if (!isHttpUrl(next)) {
    state.setUrlError("Enter an HTTP or HTTPS URL.");
    return;
  }
  state.setUrlError(null);
  if (next !== state.currentUrl()) {
    state.onCommit(next);
  }
  state.setEditingUrl(false);
}

/**
 * Owns URL draft and validation state for one mounted bookmark.
 *
 * A changed persisted URL resets the draft and closes the form; invalid input
 * remains local until the user corrects or cancels it.
 *
 * @param blockId - Persisted bookmark whose current URL is read before writing.
 * @param committed - URL from the current block snapshot.
 * @param onCommit - Writes a validated URL when the submitted value changed.
 * @returns URL form state and callbacks for submission, cancellation and editing.
 * @throws If rendered outside a panel; callbacks propagate delegated write failures.
 */
function useBookmarkUrl(blockId: string, committed: string, onCommit: (value: string) => void) {
  const panel = useReactPanel();
  const [trackedUrl, setTrackedUrl] = useState(committed);
  const [urlDraft, setUrlDraft] = useState(committed);
  const [urlError, setUrlError] = useState<string | null>(null);
  const [editingUrl, setEditingUrl] = useState(false);
  const urlId = useId();
  const urlErrorId = useId();
  /**
   * Reads the current URL before a draft is committed or reset.
   *
   * @returns The live URL, or an empty string when the block or property is absent.
   */
  const currentUrl = () => readBookmarkProp(panel, blockId, "url");
  if (trackedUrl !== committed) {
    setTrackedUrl(committed);
    setUrlDraft(committed);
    setEditingUrl(false);
    setUrlError(null);
  }
  /**
   * Submits the current draft through the shared validation and commit path.
   *
   * @param event - Form submission event.
   * @returns Updates validation state and commits a changed HTTP(S) URL.
   * @throws If the delegated property update fails.
   */
  const submitUrl = (event: FormEvent<HTMLFormElement>) => {
    submitBookmarkUrl(event, { urlDraft, currentUrl, onCommit, setUrlError, setEditingUrl });
  };
  return {
    committed,
    urlDraft,
    setUrlDraft,
    urlError,
    setUrlError,
    editingUrl,
    setEditingUrl,
    urlId,
    urlErrorId,
    submitUrl,
    currentUrl,
  };
}

/** URL state borrowed by the form and link presentation. */
type BookmarkUrlState = ReturnType<typeof useBookmarkUrl>;

/**
 * Renders the controlled URL input and its accessible validation link.
 *
 * @param props - URL draft and validation state.
 * @param props.state - Input IDs, draft, error and their update callbacks.
 * @returns Labeled URL input without an additional DOM wrapper.
 */
function BookmarkUrlField({
  state,
}: {
  readonly state: Pick<
    BookmarkUrlState,
    "urlId" | "urlErrorId" | "urlDraft" | "setUrlDraft" | "urlError" | "setUrlError"
  >;
}) {
  return (
    <>
      <Label className={SCREEN_READER_CLASS} htmlFor={state.urlId}>
        URL
      </Label>
      <Input
        id={state.urlId}
        className={BOOKMARK_URL_CLASS}
        type="text"
        inputMode="url"
        value={state.urlDraft}
        placeholder="Paste a link"
        aria-invalid={state.urlError ? true : undefined}
        aria-describedby={state.urlError ? state.urlErrorId : undefined}
        onChange={(event) => {
          state.setUrlDraft(event.target.value);
          if (state.urlError) {
            state.setUrlError(null);
          }
        }}
      />
    </>
  );
}

/**
 * Renders URL validation, save and optional cancellation controls.
 *
 * @param props - URL draft and form actions.
 * @param props.state - Current URL form state and its update callbacks.
 * @returns URL form that preserves editor selection gestures.
 */
function BookmarkUrlForm({ state }: { readonly state: Omit<BookmarkUrlState, "editingUrl"> }) {
  return (
    <form className={BOOKMARK_FORM_CLASS} noValidate onSubmit={state.submitUrl}>
      <BookmarkUrlField state={state} />
      <Button
        type="submit"
        size="sm"
        onClick={(event) => {
          if (isClaimedSelectionClick(event)) {
            event.preventDefault();
          }
        }}
      >
        Save link
      </Button>
      {state.committed ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            if (isClaimedSelectionClick(event)) {
              return;
            }
            state.setEditingUrl(false);
            state.setUrlDraft(state.currentUrl());
            state.setUrlError(null);
          }}
        >
          Cancel
        </Button>
      ) : null}
      {state.urlError ? (
        <p id={state.urlErrorId} className={`${MESSAGE_CLASS} basis-full`} role="alert">
          {state.urlError}
        </p>
      ) : null}
    </form>
  );
}

/**
 * Renders the saved link and its URL-editing control.
 *
 * @param props - Persisted URL and edit actions.
 * @param props.state - Current URL state used to reopen editing with live data.
 * @returns Link metadata and an accessible edit button.
 */
function BookmarkUrlLink({
  state,
}: {
  readonly state: Pick<
    BookmarkUrlState,
    "committed" | "setUrlDraft" | "setUrlError" | "setEditingUrl" | "currentUrl"
  >;
}) {
  return (
    <div className={BOOKMARK_META_CLASS}>
      <a
        className={BOOKMARK_LINK_CLASS}
        href={state.committed}
        title={state.committed}
        aria-label={state.committed}
        target="_blank"
        rel="noreferrer"
        onClick={(event) => {
          if (isClaimedSelectionClick(event)) {
            event.preventDefault();
          }
        }}
      >
        <Link2Icon className="size-3 shrink-0 pointer-events-none" aria-hidden="true" />
        <span className={BOOKMARK_HOST_CLASS}>{bookmarkHost(state.committed)}</span>
      </a>
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        className="ml-auto text-muted-foreground"
        aria-label="Change URL"
        onClick={(event) => {
          if (isClaimedSelectionClick(event)) {
            return;
          }
          state.setUrlDraft(state.currentUrl());
          state.setUrlError(null);
          state.setEditingUrl(true);
        }}
      >
        <PencilIcon className="pointer-events-none" aria-hidden="true" />
      </Button>
    </div>
  );
}

/**
 * Selects the URL form or saved-link view for one bookmark.
 *
 * @param props - Bookmark identity, persisted URL and update callback.
 * @param props.blockId - Persisted bookmark whose current URL is read before changes.
 * @param props.committed - URL from the current block snapshot.
 * @param props.onCommit - Writes a validated URL when the form is submitted.
 * @returns URL form for an empty or edited link, otherwise its saved-link view.
 */
function BookmarkUrl({ blockId, committed, onCommit }: BookmarkFieldProps) {
  const state = useBookmarkUrl(blockId, committed, onCommit);
  return committed === "" || state.editingUrl ? (
    <BookmarkUrlForm state={state} />
  ) : (
    <BookmarkUrlLink state={state} />
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
  if (!editing.block) {
    return null;
  }
  return (
    <div className={BOOKMARK_CLASS}>
      <div className={BOOKMARK_TITLE_CLASS}>
        <MarkdownContent blockId={blockId} />
      </div>
      <BookmarkDescription
        blockId={blockId}
        committed={editing.block.props.description ?? ""}
        onCommit={(value) => editing.operations.setProp("description", value)}
      />
      <BookmarkUrl
        blockId={blockId}
        committed={editing.block.props.url ?? ""}
        onCommit={(value) => editing.operations.setProp("url", value)}
      />
    </div>
  );
}

/**
 * Renders one heading navigation control inside the table of contents.
 *
 * @param panel - Current panel used to expand and navigate to the heading.
 * @param entry - Heading identity, text and depth in the current outline.
 * @param index - Occurrence index used with the block ID as the React key.
 * @returns List item whose button respects selection gestures.
 */
function renderTocEntry(panel: ReactPanelApi, entry: TocEntry, index: number) {
  const label = entry.text.trim() || "Empty heading";
  return (
    <li className={TOC_ENTRY_CLASS} key={`${entry.blockId}:${index}`}>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={TOC_BUTTON_CLASS}
        data-toc-entry=""
        data-toc-level={entry.depth}
        data-toc-target={entry.blockId}
        style={{ paddingInlineStart: `${(entry.depth - 1) * 12}px` }}
        onClick={(event) => {
          if (isClaimedSelectionClick(event)) {
            return;
          }
          navigateToTocEntry(panel, entry.blockId);
        }}
      >
        {label}
      </Button>
    </li>
  );
}

/**
 * Lists headings in the parent subtree, or the whole root forest at the root.
 *
 * The list is derived on each document revision. Activating an entry expands
 * collapsed ancestors and aligns the owning block with the scroll viewport start on the page.
 *
 * @param blockId - Stable table-of-contents block ID.
 * @returns A structural selection region containing the heading list.
 */
function TableOfContentsBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockContent(blockId);
  const attributes = editing.selectionProps;
  const panel = useReactPanel();
  const reactEditor = panel.document;
  const revision = useDocumentBlockRevision();
  const entries = useMemo(
    () => collectTocEntries(tocDocumentView(reactEditor), blockId),
    [blockId, reactEditor, revision],
  );
  if (!editing.block) {
    return null;
  }
  return (
    <div
      {...attributes}
      className={TOC_CLASS}
      style={{
        borderLeftWidth: ACCENT_RULE_WIDTH,
        borderLeftStyle: "solid",
        borderLeftColor: "var(--rivto-primary)",
      }}
    >
      <nav aria-label="Table of contents">
        {entries.length === 0 ? (
          <p className={QUIET_CLASS}>No headings</p>
        ) : (
          <ol className={TOC_LIST_CLASS}>
            {entries.map((entry, index) => renderTocEntry(panel, entry, index))}
          </ol>
        )}
      </nav>
    </div>
  );
}

/**
 * Renders a horizontally scrollable math source and a result for each line.
 *
 * Lines share one scope, so a later line can use a name assigned above.
 * Invalid lines stay editable and display their error beside the source line.
 *
 * @param blockId - Stable math block ID.
 * @returns The source editor and aligned results, or null after deletion.
 */
function MathBlock({ blockId }: { readonly blockId: string }) {
  const editing = useBlockEditing(blockId);
  const source = editing.block?.content ?? "";
  const evaluated = useMemo(() => evaluateMathSource(source), [source]);
  if (!editing.block) {
    return null;
  }
  return (
    <div className={MATH_CLASS}>
      <div className="demo-math-header" aria-hidden="true">
        <span>Expressions</span>
        <span>Results</span>
      </div>
      <BlockText
        attributes={editing.attributes}
        className={`${PAGE_BLOCK_CONTENT_CLASS} ${MATH_SOURCE_CLASS}`}
        label="Math source"
        spellCheck={false}
      />
      <div className={MATH_VALUE_CLASS} data-math-value="" aria-label="Math results">
        {evaluated.map((result, index) => (
          <div className="demo-math-result" data-math-line={index + 1} key={index}>
            {result.error ? (
              <span className={MESSAGE_CLASS} role="alert" title={result.error}>
                {result.error}
              </span>
            ) : (
              result.value
            )}
          </div>
        ))}
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
      registerHostBlock(
        reactEditor,
        {
          definition: {
            ...ADMONITION_DEFINITION[tone],
            metadata: { [BLOCK_TEXT_METADATA_KEY]: true },
          },
          render: AdmonitionBlock,
          slashCommand: {
            title: ADMONITION_LABELS[tone],
            group: "Turn into",
            keywords: [...ADMONITION_KEYWORDS[tone]],
          },
        },
        {
          id: type,
          matches: ({ block }) => block.type === type,
          format: ({ block, depth, children }): PortableBlockFormats => {
            const emoji =
              typeof block.props.emoji === "string" && block.props.emoji
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
        },
      );
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
      registerHostBlock(
        reactEditor,
        {
          definition: { ...bookmarkBlockDefinition, metadata: { [BLOCK_TEXT_METADATA_KEY]: true } },
          render: BookmarkBlock,
          slashCommand: {
            title: "Bookmark",
            group: "Turn into",
            keywords: ["link", "url", "hyperlink"],
          },
        },
        {
          id: "demo.bookmark",
          matches: ({ block }) => block.type === BOOKMARK_BLOCK_TYPE,
          format: ({ block, depth, children }): PortableBlockFormats => {
            const url = typeof block.props.url === "string" ? block.props.url : "";
            const description =
              typeof block.props.description === "string" ? block.props.description : "";
            const safeUrl = isHttpUrl(url) ? url : "";
            const markdown = indentLines(
              bookmarkMarkdown(block.content, safeUrl, description),
              depth,
            );
            const plain = indentLines(
              [block.content, safeUrl, description].filter((line) => line.length > 0).join("\n"),
              depth,
            );
            const title = escapeHtml(block.content || safeUrl);
            const link = safeUrl ? `<a href="${escapeHtml(safeUrl)}">${title}</a>` : title;
            const descriptionHtml = description ? `<p>${escapeHtml(description)}</p>` : "";
            return {
              plain: joinPortableText(plain, children.plain),
              markdown: joinPortableText(markdown, children.markdown),
              html: `<p>${link}</p>${descriptionHtml}${children.html}`,
            };
          },
        },
      );
    },
  };
}

/**
 * Registers the table-of-contents block.
 *
 * Slash conversion preserves the block's existing content, though the table of
 * contents renderer does not display it. Clipboard text is the generated heading
 * list rather than the stored content.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function tableOfContentsBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.table-of-contents",
    setup: (reactEditor) => {
      registerHostBlock(
        reactEditor,
        {
          definition: tableOfContentsBlockDefinition,
          render: TableOfContentsBlock,
          slashCommand: {
            title: "Table of contents",
            group: "Turn into",
            keywords: ["toc", "outline", "contents", "headings"],
          },
        },
        {
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
        },
      );
    },
  };
}

/** Editing behavior used only by math blocks. */
const MATH_BEHAVIOR: NonNullable<ReactBlockRegistration["behavior"]> = {
  /**
   * Selects only math blocks for this editing behavior.
   *
   * @param context - Current block and owning editor.
   * @returns Whether the block contains math source.
   */
  isAvailable: ({ block }) => block.type === MATH_BLOCK_TYPE,
  /**
   * Inserts a line break at the current caret within the caller's transaction.
   *
   * Expanded text selections are removed by the keyboard dispatcher first.
   * A structural target is left to the ordinary block behavior.
   *
   * @param context - Current block and panel that owns the selection.
   * @param target - Caret position after any selected text was removed.
   * @returns Handled after inserting a line break, or unhandled for structural selection.
   * @throws If the block update or browser selection operation fails.
   */
  onSplit: ({ block, reactPanel, root }, target) => {
    if (!target.collapsed) {
      return "unhandled";
    }
    const offset = Math.min(target.offset ?? 0, block.content.length);
    const content = `${block.content.slice(0, offset)}\n${block.content.slice(offset)}`;
    reactPanel.blocks.updateBlock(block.id, { content });
    const editable = root.ownerDocument.activeElement;
    if (
      editable instanceof HTMLElement &&
      editable.hasAttribute("data-block-content") &&
      editable.closest(`[${BLOCK_ID_ATTRIBUTE}]`)?.getAttribute(BLOCK_ID_ATTRIBUTE) === block.id
    ) {
      // Put the caret after the new line before the next keystroke arrives.
      editable.textContent = content;
      // A trailing line break needs a placeholder so the browser retains its caret position.
      if (content.endsWith("\n")) {
        editable.appendChild(root.ownerDocument.createElement("br"));
      }
      const range = root.ownerDocument.createRange();
      range.setStart(editable.firstChild!, offset + 1);
      range.collapse(true);
      const selection = root.ownerDocument.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
    reactPanel.selection.set(createCaretSelection(block.id, offset + 1));
    reactPanel.selection.scheduleIfSelectionUnchanged(() => reactPanel.selection.restoreDOM());
    return "handled";
  },
};

/**
 * Registers the math block and clipboard forms that include each evaluated value.
 *
 * @returns An extension that installs the block wherever it is set up.
 */
export function mathBlockExtension(): ReactEditorExtension {
  return {
    id: "demo.math",
    setup: (reactEditor) => {
      registerHostBlock(
        reactEditor,
        {
          definition: { ...mathBlockDefinition, metadata: { [BLOCK_TEXT_METADATA_KEY]: true } },
          render: MathBlock,
          behavior: { ...MATH_BEHAVIOR },
          slashCommand: {
            title: "Math",
            group: "Turn into",
            keywords: ["math", "calculate", "evaluate", "expression"],
          },
        },
        {
          id: "demo.math",
          matches: ({ block }) => block.type === MATH_BLOCK_TYPE,
          format: ({ block, depth, children }): PortableBlockFormats => {
            const evaluated = evaluateMathSource(block.content);
            const text = mathMarkdown(block.content, evaluated);
            const markdown = indentLines(text, depth);
            const errors = evaluated
              .filter((result) => result.error)
              .map((result) => `<p>${escapeHtml(result.error ?? "")}</p>`)
              .join("");
            return {
              plain: joinPortableText(markdown, children.plain),
              markdown: joinPortableText(markdown, children.markdown),
              html: `<pre>${escapeHtml(text)}</pre>${errors}${children.html}`,
            };
          },
        },
      );
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
