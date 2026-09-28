/**
 * Opt-in OpenUI block. The persisted block content is an OpenUI Lang program.
 * The block draws that program with the host library and keeps source editing
 * behind an explicit control, so focusing the block never turns it into a
 * Markdown-style text editor.
 *
 * Hosts must import `@openuidev/react-ui/components.css` (or an equivalent
 * library stylesheet) for the drawn components to appear styled. This
 * extension is not part of `standardPreset`.
 *
 * @module
 */
import type { EditorBlockInput } from "@chulane/rivto";
import {
  Renderer,
  type ActionEvent,
  type Library,
  type OpenUIError,
} from "@openuidev/react-lang";
import { openuiLibrary } from "@openuidev/react-ui";
import { PencilIcon } from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
} from "react";
import { Button } from "../../components/ui/button";
import { Textarea } from "../../components/ui/textarea";
import { useBlockEditing } from "../../hooks";
import type { ReactEditorExtension } from "../../managers";

/** Persisted native type installed by {@link openuiExtension}. */
export const OPENUI_BLOCK_TYPE = "openui";

const OPENUI_BLOCK_CLASS = "rivto-openui-block";
const OPENUI_TOOLBAR_CLASS = "rivto-openui-toolbar";
const OPENUI_CANVAS_CLASS = "rivto-openui-canvas";
const OPENUI_SOURCE_CLASS = "rivto-openui-source";
const OPENUI_EMPTY_CLASS = "rivto-openui-empty";
const OPENUI_ISSUES_CLASS = "rivto-openui-issues";
const OPENUI_ACTION_CLASS = "rivto-openui-action";

/** Configuration accepted by {@link openuiExtension}. */
export interface OpenUiExtensionOptions {
  /**
   * Component library used to draw every OpenUI block.
   *
   * Defaults to the stock `openuiLibrary` (`root = Stack(...)`).
   */
  readonly library?: Library;
}

/** Props accepted by the exported OpenUI renderer. */
export interface OpenUiBlockProps {
  readonly blockId: string;
  /** Library closed over at registration time. */
  readonly library?: Library;
}

/**
 * Builds insertion input for one OpenUI block.
 *
 * @param source - OpenUI Lang program stored as the block's content.
 * @returns A leaf block input with no children.
 */
export function createOpenUiBlockInput(source = ""): EditorBlockInput {
  return { type: OPENUI_BLOCK_TYPE, content: source };
}

/**
 * Formats one parser or runtime issue for the block's issue list.
 *
 * @param error - Structured error reported by the OpenUI renderer.
 * @returns A single readable line.
 */
function formatOpenUiIssue(error: OpenUIError): string {
  const where = error.statementId ? `${error.statementId}: ` : "";
  const hint = error.hint ? ` (${error.hint})` : "";
  return `${where}${error.message}${hint}`;
}

/**
 * Reads the chat-facing label from a drawn control's action.
 *
 * @param event - Action emitted by a button or other interactive component.
 * @returns Text safe to show under the drawing.
 */
function actionLabel(event: ActionEvent): string {
  const message = event.humanFriendlyMessage.trim();
  return message || event.type;
}

/**
 * Escapes text placed into the clipboard HTML representation.
 *
 * @param value - Raw OpenUI source.
 * @returns HTML-escaped source.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;",
  })[character] ?? character);
}

/**
 * Draws one OpenUI program, or edits that same block's source.
 *
 * Draw mode has no contenteditable surface. Edit mode is a textarea owned by
 * this renderer; Draw writes the draft back as one content update.
 *
 * @param props - Stable block ID and the library selected by the extension.
 * @returns The toolbar plus either the drawing or the source editor.
 */
export function OpenUiBlock({
  blockId,
  library = openuiLibrary,
}: OpenUiBlockProps) {
  const editing = useBlockEditing(blockId, { textEdit: false });
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const [mode, setMode] = useState<"draw" | "edit">("draw");
  const [draft, setDraft] = useState("");
  const [issues, setIssues] = useState<readonly string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const source = editing.block?.content ?? "";

  useEffect(() => {
    if (mode === "edit") sourceRef.current?.focus();
  }, [mode]);

  if (!editing.block) return null;

  /**
   * Opens the source editor for this block without changing the document.
   *
   * @param event - Click on the Edit control.
   * @returns Nothing.
   */
  const beginEdit = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.defaultPrevented) return;
    setDraft(editing.block?.content ?? "");
    setNotice(null);
    setMode("edit");
  };

  /**
   * Persists the draft when it changed and returns to the drawing.
   *
   * @returns Nothing.
   */
  const draw = () => {
    const next = draft;
    if (next !== (editing.block?.content ?? "")) editing.operations.setContent(next);
    setIssues([]);
    setNotice(null);
    setMode("draw");
  };

  /**
   * Draws from the editor when the click was not claimed by a selection drag.
   *
   * @param event - Click on the Draw control.
   * @returns Nothing.
   */
  const drawFromClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (event.defaultPrevented) return;
    draw();
  };

  /**
   * Draws on Ctrl/Cmd+Enter so a long program can be committed from the keyboard.
   *
   * @param event - Key event from the source textarea.
   * @returns Nothing.
   */
  const drawFromKeyboard = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) return;
    event.preventDefault();
    draw();
  };

  return (
    <div
      {...editing.attributes}
      className={`${OPENUI_BLOCK_CLASS} box-border flex w-full min-w-0 max-w-full flex-col gap-2 rounded-md border border-border bg-background p-2`}
      data-openui-mode={mode}
    >
      <div className={`${OPENUI_TOOLBAR_CLASS} flex min-w-0 items-center justify-between gap-2`}>
        <span className="text-xs font-medium text-muted-foreground">OpenUI</span>
        {mode === "draw" ? (
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label="Edit OpenUI source"
            {...editing.preventTextEditingAttributes}
            onClick={beginEdit}
          >
            <PencilIcon aria-hidden="true" />
            Edit
          </Button>
        ) : (
          <Button
            type="button"
            size="xs"
            variant="outline"
            aria-label="Draw OpenUI source"
            {...editing.preventTextEditingAttributes}
            onClick={drawFromClick}
          >
            Draw
          </Button>
        )}
      </div>
      {mode === "edit" ? (
        <Textarea
          ref={sourceRef}
          {...editing.preventTextEditingAttributes}
          className={`${OPENUI_SOURCE_CLASS} min-h-40 w-full min-w-0 font-mono text-sm`}
          aria-label="OpenUI source"
          spellCheck={false}
          autoComplete="off"
          value={draft}
          placeholder={'root = Stack([title])\ntitle = TextContent("Hello", "large-heavy")'}
          onChange={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={drawFromKeyboard}
        />
      ) : source.trim() ? (
        <div className={`${OPENUI_CANVAS_CLASS} min-w-0 max-w-full overflow-x-auto`}>
          <Renderer
            library={library}
            response={source}
            isStreaming={false}
            publishObservability={false}
            onAction={(event) => setNotice(actionLabel(event))}
            onError={(errors) => setIssues(errors.map(formatOpenUiIssue))}
          />
          {issues.length > 0 && (
            <ul className={`${OPENUI_ISSUES_CLASS} mt-2 list-disc pl-5 text-sm text-destructive`} role="alert">
              {issues.map((issue) => <li key={issue}>{issue}</li>)}
            </ul>
          )}
          {notice && (
            <p className={`${OPENUI_ACTION_CLASS} mt-2 text-sm text-muted-foreground`}>{notice}</p>
          )}
        </div>
      ) : (
        <p className={`${OPENUI_EMPTY_CLASS} m-0 min-h-(--rivto-default-block-height) text-sm text-muted-foreground`}>
          No OpenUI source yet. Edit this block to write a program, then Draw it.
        </p>
      )}
    </div>
  );
}

/**
 * Installs the OpenUI block, its slash conversion, and plain-text export.
 *
 * The block is a leaf: children are not part of the drawing. Source stays in
 * `content` so snapshots, undo, and structured copy keep the program.
 *
 * @param options - Optional replacement for the stock component library.
 * @returns Explicit opt-in React editor extension.
 */
export function openuiExtension(
  options: OpenUiExtensionOptions = {},
): ReactEditorExtension {
  const library = options.library ?? openuiLibrary;
  return {
    id: "block.openui",
    setup: (reactEditor) => {
      reactEditor.blockTypes.register({
        definition: {
          type: OPENUI_BLOCK_TYPE,
          title: "OpenUI",
        },
        render: ({ blockId }) => <OpenUiBlock blockId={blockId} library={library} />,
        slashCommand: {
          title: "OpenUI",
          group: "Turn into",
          keywords: ["openui", "ui", "generative"],
        },
      });
      reactEditor.clipboard.registerFormatter({
        id: "openui",
        matches: ({ block }) => block.type === OPENUI_BLOCK_TYPE,
        format: ({ block, children }, current) => {
          const fenced = `\`\`\`openui\n${block.content}\n\`\`\``;
          return {
            plain: current.plain,
            markdown: children.markdown ? `${fenced}\n${children.markdown}` : fenced,
            html: `<pre><code>${escapeHtml(block.content)}</code></pre>${children.html}`,
          };
        },
      });
    },
  };
}
