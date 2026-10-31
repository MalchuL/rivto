/**
 * Opt-in Intelligent UI block. The persisted block content is an OpenUI Lang
 * program. The block runs that program with the Intelligent UI library, so a
 * person or an assistant can build a small interactive app by writing code.
 * Source editing stays behind an explicit control.
 *
 * The extension is not part of `standardPreset`. Component appearance is loaded
 * with the package stylesheet.
 *
 * @module
 */
import type { EditorBlockInput } from "@chulane/rivto";
import { Renderer, type ActionEvent, type Library, type OpenUIError } from "@openuidev/react-lang";
import { PencilIcon } from "lucide-react";
import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { editorControlProps } from "../../constants";
import {
  useBlockNode,
  useBlockSelectionAnchor,
  usePanel,
  usePreventTextEditing,
} from "../../hooks";
import type { ReactEditorExtension } from "../../managers";
import { escapeClipboardHTML } from "../../managers/clipboard/clipboard-format-registry";
import { intelligentUiLibrary } from "./library";

/** Persisted native type installed by {@link intelligentUiExtension}. */
export const INTELLIGENT_UI_BLOCK_TYPE = "intelligent-ui";

const INTELLIGENT_UI_BLOCK_CLASS = "rivto-intelligent-ui";
const INTELLIGENT_UI_TOOLBAR_CLASS = "rivto-intelligent-ui-toolbar";
const INTELLIGENT_UI_CANVAS_CLASS = "rivto-intelligent-ui-canvas";
const INTELLIGENT_UI_SOURCE_CLASS = "rivto-intelligent-ui-source";
const INTELLIGENT_UI_EMPTY_CLASS = "rivto-intelligent-ui-empty";
const INTELLIGENT_UI_ISSUES_CLASS = "rivto-intelligent-ui-issues";
const INTELLIGENT_UI_NOTICE_CLASS = "rivto-intelligent-ui-notice";

/** Configuration accepted by {@link intelligentUiExtension}. */
export interface IntelligentUiExtensionOptions {
  /**
   * Component library used to run every Intelligent UI block.
   *
   * Defaults to {@link intelligentUiLibrary}.
   */
  readonly library?: Library;
  /**
   * Handles an action before the block's clipboard, link, and notice behavior.
   *
   * Return true when the event is fully handled.
   */
  readonly onAction?: (event: ActionEvent) => boolean;
}

/** Props accepted by {@link IntelligentUiBlock}. */
export interface IntelligentUiBlockProps {
  readonly blockId: string;
  /** Library closed over at registration time. */
  readonly library?: Library;
  /** Optional host handler closed over at registration time. */
  readonly onAction?: (event: ActionEvent) => boolean;
}

/**
 * Builds insertion input for one Intelligent UI block.
 *
 * @param source - OpenUI Lang program stored as the block's content.
 * @returns A leaf block input with no children.
 */
export function createIntelligentUiBlockInput(source = ""): EditorBlockInput {
  return { type: INTELLIGENT_UI_BLOCK_TYPE, content: source };
}

/**
 * Formats one parser or runtime issue for the block's issue list.
 *
 * @param error - Structured error reported by the OpenUI renderer.
 * @returns A single readable line.
 */
function formatIntelligentUiIssue(error: OpenUIError): string {
  const where = error.statementId ? `${error.statementId}: ` : "";
  const hint = error.hint ? ` (${error.hint})` : "";
  return `${where}${error.message}${hint}`;
}

/**
 * Returns an absolute http(s) URL, or null when the value is not one.
 *
 * Relative and non-http URLs are rejected so a generated program cannot
 * navigate the editor origin.
 *
 * @param value - Action parameter that may contain a URL.
 * @returns The trimmed URL, or null when it is missing or unsafe.
 */
function webUrl(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  try {
    const protocol = new URL(value.trim()).protocol;
    if (protocol === "http:" || protocol === "https:") {
      return value.trim();
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Copies text, using a hidden textarea when the async clipboard API refuses.
 *
 * @param text - Text the program asked to copy.
 * @returns Whether the browser accepted the copy.
 */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.setAttribute("readonly", "");
    area.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/**
 * Runs clipboard and link actions emitted by a drawn program.
 *
 * Assistant-facing actions stay in the page as a notice. The document is not
 * modified. Copy completion is reported after the browser accepts or refuses it.
 *
 * @param event - Action emitted by the OpenUI renderer.
 * @param report - Receives the notice to show under the drawing.
 * @returns Nothing. The completed side effect is the copy, navigation, or notice.
 */
function presentIntelligentUiAction(event: ActionEvent, report: (notice: string) => void): void {
  if (event.type === "CopyToClipboard") {
    const text = event.params.text;
    if (typeof text !== "string") {
      report("Could not copy");
      return;
    }
    void copyText(text).then((ok) => {
      report(ok ? "Copied to the clipboard" : "Could not copy");
    });
    return;
  }
  if (event.type === "open_url") {
    const url = webUrl(event.params.url);
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
      return;
    }
  }
  const message = event.humanFriendlyMessage.trim();
  report(message || event.type);
}

/**
 * Formats one Intelligent UI program for portable clipboard export.
 *
 * The source is the program. Descendant text is appended when the block has
 * children. The document is not read or modified.
 *
 * @param block - Detached block whose content is the program.
 * @param block.content - OpenUI Lang source.
 * @param children - Already formatted descendant forest.
 * @returns Plain text, a fenced Markdown block, and an HTML code listing.
 */
function formatIntelligentUiBlock(
  block: { readonly content: string },
  children: { readonly plain: string; readonly markdown: string; readonly html: string },
): { readonly plain: string; readonly markdown: string; readonly html: string } {
  const fenced = `\`\`\`intelligent-ui\n${block.content}\n\`\`\``;
  return {
    plain: children.plain ? `${block.content}\n${children.plain}` : block.content,
    markdown: children.markdown ? `${fenced}\n${children.markdown}` : fenced,
    html: `<pre><code>${escapeClipboardHTML(block.content)}</code></pre>${children.html}`,
  };
}

/**
 * Runs a toolbar action before Firefox can scroll the focused button away.
 *
 * A primary pointer focuses the button without scrolling, then runs the
 * action immediately. Keyboard activation still arrives as a click.
 *
 * @param event - Pointer down on the toolbar button.
 * @param preventTextEditing - Stops this gesture from editing block text.
 * @param action - Edit or draw behavior for this button.
 * @returns Nothing. The action runs unless the pointer was already claimed.
 */
function runIntelligentUiToolbarAction(
  event: PointerEvent<HTMLButtonElement>,
  preventTextEditing: (event: PointerEvent<HTMLButtonElement>) => void,
  action: () => void,
): void {
  preventTextEditing(event);
  if (event.button !== 0 || event.defaultPrevented) {
    return;
  }
  event.preventDefault();
  event.currentTarget.focus({ preventScroll: true });
  action();
}

/**
 * Runs one OpenUI program, or edits that same block's source.
 *
 * Draw mode has no contenteditable surface. Edit mode is a textarea owned by
 * this renderer. The shell is `contentEditable={false}` so an inherited editing
 * host does not treat the toolbar as text and cancel its clicks. Draw writes
 * the draft back as one content update. Interactive state inside the program
 * stays in the renderer until the program changes.
 *
 * @param props - Stable block ID, library, and optional host action handler.
 * @param props.blockId - Stable persisted ID of this block.
 * @param props.library - Library selected when the extension was installed.
 * @param props.onAction - Host handler invoked before built-in action behavior.
 * @returns The toolbar plus either the running program or the source editor.
 * @throws If called outside an editor panel, or when a content write fails.
 */
export function IntelligentUiBlock({
  blockId,
  library = intelligentUiLibrary,
  onAction,
}: IntelligentUiBlockProps) {
  const { block, operations } = useBlockNode(blockId);
  const panel = usePanel();
  const anchor = useBlockSelectionAnchor(blockId);
  const preventTextEditing = usePreventTextEditing();
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"draw" | "edit">("draw");
  const [draft, setDraft] = useState("");
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const source = block?.content ?? "";

  useEffect(() => {
    if (mode === "edit") {
      sourceRef.current?.focus();
    }
  }, [mode]);

  if (!block) {
    return null;
  }

  /**
   * Opens the source editor for this block without changing the document.
   *
   * @returns Nothing. The draft matches the current program.
   */
  const beginEdit = () => {
    setDraft(panel.blocks.getBlockNode(blockId)?.content ?? "");
    setNotice(null);
    setMode("edit");
  };

  /**
   * Persists the draft when it changed and returns to the running program.
   *
   * @returns Nothing. One content update is written when the source changed.
   */
  const draw = () => {
    const current = panel.blocks.getBlockNode(blockId)?.content ?? "";
    if (draft !== current) {
      operations.setContent(draft);
    }
    setIssues([]);
    setNotice(null);
    setMode("draw");
  };

  let body: ReactNode;
  if (mode === "edit") {
    body = (
      <Textarea
        ref={sourceRef}
        {...preventTextEditing}
        className={`${INTELLIGENT_UI_SOURCE_CLASS} min-h-40 w-full min-w-0 font-mono text-sm`}
        aria-label="Intelligent UI source"
        spellCheck={false}
        autoComplete="off"
        value={draft}
        placeholder={'root = Col([title])\ntitle = Title("Hello", "lg")'}
        onChange={(event) => setDraft(event.currentTarget.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault();
            draw();
          }
        }}
      />
    );
  } else if (source.trim()) {
    body = (
      <div
        {...preventTextEditing}
        className={`${INTELLIGENT_UI_CANVAS_CLASS} min-w-0 max-w-full overflow-x-auto [content-visibility:auto] [contain-intrinsic-size:auto_240px]`}
      >
        <Renderer
          library={library}
          response={source}
          isStreaming={false}
          publishObservability={false}
          onAction={(event) => {
            if (onAction?.(event)) {
              return;
            }
            presentIntelligentUiAction(event, setNotice);
          }}
          onError={(errors) => setIssues(errors.map(formatIntelligentUiIssue))}
        />
        {issues.length > 0 && (
          <ul
            className={`${INTELLIGENT_UI_ISSUES_CLASS} mt-2 list-disc pl-5 text-sm text-destructive`}
            role="alert"
          >
            {issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        )}
        {notice && (
          <p className={`${INTELLIGENT_UI_NOTICE_CLASS} mt-2 text-sm text-muted-foreground`}>
            {notice}
          </p>
        )}
      </div>
    );
  } else {
    body = (
      <p
        className={`${INTELLIGENT_UI_EMPTY_CLASS} m-0 min-h-(--rivto-default-block-height) text-sm text-muted-foreground`}
      >
        No program yet. Edit this block to write OpenUI Lang, then Draw it.
      </p>
    );
  }

  return (
    <div
      {...anchor}
      contentEditable={false}
      className={`${INTELLIGENT_UI_BLOCK_CLASS} box-border flex w-full min-w-0 max-w-full flex-col gap-2 rounded-md border border-border bg-background p-2`}
      data-intelligent-ui-mode={mode}
    >
      <div
        className={`${INTELLIGENT_UI_TOOLBAR_CLASS} flex min-w-0 items-center justify-between gap-2`}
      >
        <span className="text-xs font-medium text-muted-foreground">Intelligent UI</span>
        {mode === "draw" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label="Edit intelligent UI source"
            {...editorControlProps}
            {...preventTextEditing}
            onPointerDown={(event) => {
              runIntelligentUiToolbarAction(event, preventTextEditing.onPointerDown, beginEdit);
            }}
            onClick={(event) => {
              if (event.defaultPrevented || event.detail !== 0) {
                return;
              }
              beginEdit();
            }}
          >
            <PencilIcon aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label="Draw intelligent UI source"
            {...editorControlProps}
            {...preventTextEditing}
            onPointerDown={(event) => {
              runIntelligentUiToolbarAction(event, preventTextEditing.onPointerDown, draw);
            }}
            onClick={(event) => {
              if (event.defaultPrevented || event.detail !== 0) {
                return;
              }
              draw();
            }}
          >
            Draw
          </Button>
        )}
      </div>
      {body}
    </div>
  );
}

/**
 * Installs the Intelligent UI block, its slash conversion, and plain-text export.
 *
 * The block is a leaf: children are not part of the running program. Source
 * stays in `content` so snapshots, undo, and structured copy keep the program.
 * Calling it again on another editor installs another independent registration.
 *
 * @param options - Optional replacement library and action handler.
 * @returns Explicit opt-in React editor extension.
 */
export function intelligentUiExtension(
  options: IntelligentUiExtensionOptions = {},
): ReactEditorExtension {
  const library = options.library ?? intelligentUiLibrary;
  const onAction = options.onAction;
  return {
    id: "block.intelligent-ui",
    setup: (reactEditor) => {
      reactEditor.blockTypes.register({
        definition: {
          type: INTELLIGENT_UI_BLOCK_TYPE,
          title: "Intelligent UI",
        },
        render: ({ blockId }) => (
          <IntelligentUiBlock blockId={blockId} library={library} onAction={onAction} />
        ),
        slashCommand: {
          title: "Intelligent UI",
          group: "Turn into",
          keywords: ["intelligent", "openui", "app", "ui"],
        },
        clipboard: {
          format: ({ block, children }) => formatIntelligentUiBlock(block, children),
        },
      });
    },
  };
}
