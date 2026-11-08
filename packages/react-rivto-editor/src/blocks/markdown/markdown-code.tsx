import {
  Children,
  cloneElement,
  isValidElement,
  useLayoutEffect,
  useRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type KeyboardEvent,
} from "react";
import { CopyIcon, PencilIcon } from "lucide-react";
import { restoreDOMSelection, saveDOMSelection } from "../../managers/selection/dom-text-selection";

/** Minimal HAST shape needed by the fenced-code metadata transform. */
interface SyntaxNode {
  readonly type: string;
  readonly tagName?: string;
  properties?: Record<string, unknown>;
  readonly children?: SyntaxNode[];
}

/** Language and visible label resolved from a Markdown fence info string. */
export interface CodeFenceInfo {
  /** Original language name or file path displayed above the code. */
  readonly label: string;
  /** highlight.js language inferred from an alias or file extension. */
  readonly language?: string;
  /** Whether the label was interpreted as a file name or path. */
  readonly filename: boolean;
}

/** Common file extensions accepted as fenced-code labels. */
const EXTENSION_LANGUAGES: Readonly<Record<string, string>> = {
  bash: "bash",
  c: "c",
  cc: "cpp",
  cjs: "javascript",
  cpp: "cpp",
  cs: "csharp",
  css: "css",
  cts: "typescript",
  cxx: "cpp",
  dart: "dart",
  go: "go",
  h: "c",
  hpp: "cpp",
  htm: "xml",
  html: "xml",
  java: "java",
  js: "javascript",
  json: "json",
  jsonc: "json",
  jsx: "javascript",
  kt: "kotlin",
  kts: "kotlin",
  less: "less",
  md: "markdown",
  mdx: "markdown",
  mjs: "javascript",
  mts: "typescript",
  php: "php",
  py: "python",
  pyw: "python",
  rb: "ruby",
  rs: "rust",
  sass: "scss",
  scss: "scss",
  sh: "bash",
  sql: "sql",
  svg: "xml",
  swift: "swift",
  ts: "typescript",
  tsx: "typescript",
  vue: "xml",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  zsh: "bash",
};

/** Friendly aliases normalized before they reach highlight.js. */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  csharp: "csharp",
  cs: "csharp",
  html: "xml",
  js: "javascript",
  jsx: "javascript",
  md: "markdown",
  py: "python",
  rb: "ruby",
  shell: "bash",
  sh: "bash",
  ts: "typescript",
  tsx: "typescript",
  yml: "yaml",
};

/** Human-readable names shown beside inferred file paths. */
const LANGUAGE_TITLES: Readonly<Record<string, string>> = {
  bash: "Bash",
  cpp: "C++",
  csharp: "C#",
  javascript: "JavaScript",
  markdown: "Markdown",
  python: "Python",
  typescript: "TypeScript",
  xml: "HTML/XML",
};

/**
 * Resolves a fence info string as either a language or a file path.
 *
 * Markdown exposes the token immediately after the opening fence as a
 * `language-*` class. A recognized extension changes that class to the actual
 * highlight.js grammar while retaining the original path as the visible label.
 *
 * @param value - Text following the opening triple backticks.
 * @returns Display metadata, or undefined for an unlabelled fence.
 */
export function resolveCodeFenceInfo(value: string | undefined): CodeFenceInfo | undefined {
  const label = value?.trim();
  if (!label) {
    return;
  }

  const basename = label.split(/[\\/]/).at(-1) ?? label;
  const extensionIndex = basename.lastIndexOf(".");
  const extension =
    extensionIndex > 0 ? basename.slice(extensionIndex + 1).toLowerCase() : undefined;
  const extensionLanguage = extension ? EXTENSION_LANGUAGES[extension] : undefined;
  const filename = label.includes("/") || label.includes("\\") || Boolean(extensionLanguage);

  return {
    label,
    language: filename
      ? extensionLanguage
      : (LANGUAGE_ALIASES[label.toLowerCase()] ?? label.toLowerCase()),
    filename,
  };
}

/**
 * Adds display metadata and normalized language classes before highlighting.
 *
 * @returns A unified transformer that mutates fenced `pre > code` elements.
 */
export function rehypeCodeFenceMetadata() {
  return (tree: SyntaxNode): void => {
    const visit = (node: SyntaxNode, parent?: SyntaxNode): void => {
      if (node.tagName === "code" && parent?.tagName === "pre") {
        const properties = (node.properties ??= {});
        const classes = Array.isArray(properties.className) ? properties.className.map(String) : [];
        const languageClass = classes.find((name) => name.startsWith("language-"));
        const info = resolveCodeFenceInfo(languageClass?.slice("language-".length));

        if (info) {
          properties.dataCodeLabel = info.label;
          properties.dataCodeFilename = info.filename ? "true" : "false";
          if (info.language) {
            properties.dataCodeLanguage = info.language;
          }
          properties.className = [
            ...classes.filter((name) => !name.startsWith("language-")),
            ...(info.language ? [`language-${info.language}`] : []),
          ];
        }
      }
      node.children?.forEach((child) => visit(child, node));
    };
    visit(tree);
  };
}

/** Data attributes added to the highlighted `code` React element. */
interface AnnotatedCodeProps {
  readonly "data-code-label"?: string;
  readonly "data-code-language"?: string;
  readonly children?: ReactNode;
}

export interface PositionedNode {
  readonly position?: {
    readonly start: { readonly offset?: number };
    readonly end: { readonly offset?: number };
  };
}

/** Replaces one rendered code body's source while preserving its Markdown wrapper. */
export function replaceMarkdownCode(source: string, node: PositionedNode, value: string): string {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) {
    return source;
  }
  const block = source.slice(start, end);
  const opening = block.match(/^([ \t]*)(`{3,}|~{3,})[^\r\n]*(\r?\n)/);
  const normalized = value.replace(/\r\n?/g, "\n");
  const closingStart = opening ? block.lastIndexOf("\n") : -1;
  let result: string;
  if (opening && closingStart >= opening[0].length - 1) {
    result =
      source.slice(0, start) +
      block.slice(0, opening[0].length) +
      normalized +
      block.slice(closingStart) +
      source.slice(end);
  } else {
    const newline = block.includes("\r\n") ? "\r\n" : "\n";
    const indent = block.match(/^(?: {4}|\t)/)?.[0] ?? "";
    const replacement = normalized
      .split("\n")
      .map((line) => indent + line)
      .join(newline);
    result = source.slice(0, start) + replacement + source.slice(end);
  }
  return result;
}

/**
 * Renders a visible filename/language header around one fenced code block.
 *
 * Inline code never produces a `pre` element and therefore bypasses this
 * component. Syntax spans remain owned by `rehype-highlight`.
 */
/** Props supplied by react-markdown for one rendered preformatted block. */
export interface MarkdownCodeBlockProps extends HTMLAttributes<HTMLPreElement> {
  readonly node?: PositionedNode;
  readonly onCodeChange?: (node: PositionedNode, value: string) => void;
  /**
   * Opens the complete Markdown block for editing.
   *
   * @returns The completed focus request.
   */
  readonly onEditMarkdown?: () => void;
  /**
   * Requests focus in the surrounding Markdown editor at a code edge.
   *
   * @param node - Rendered code block with its Markdown source positions.
   * @param direction - Edge reached by the caret, either up or down.
   * @returns The completed focus request.
   */
  readonly onCodeEdge?: (node: PositionedNode, direction: "up" | "down") => void;
  readonly preventTextEditingAttributes?: HTMLAttributes<HTMLElement>;
}

function textContent(node: ReactNode): string {
  return Children.toArray(node)
    .map((child) => {
      let text = "";
      if (typeof child === "string" || typeof child === "number" || typeof child === "bigint") {
        text = String(child);
      } else if (isValidElement<{ readonly children?: ReactNode }>(child)) {
        text = textContent(child.props.children);
      }
      return text;
    })
    .join("");
}

function EditableCode({
  children,
  onChange,
  onEdge,
  preventTextEditingAttributes,
}: {
  readonly children: ReactNode;
  readonly onChange: (value: string) => void;
  readonly onEdge?: (direction: "up" | "down") => void;
  readonly preventTextEditingAttributes?: HTMLAttributes<HTMLElement>;
}) {
  const editorRef = useRef<HTMLElement>(null);
  const value = textContent(children).replace(/\n$/, "");

  // React owns the highlighted layer, while the browser owns this plaintext
  // editor. Only reconcile external changes; local input already matches value.
  useLayoutEffect(() => {
    const element = editorRef.current;
    if (
      !element ||
      element.textContent === value ||
      (element.textContent === `${value}\n` && hasTrailingCaretPlaceholder(element))
    ) {
      return;
    }
    const selection = saveDOMSelection(element);
    element.textContent = value;
    restoreDOMSelection(element, selection);
  }, [editorRef, value]);

  return (
    <code
      {...preventTextEditingAttributes}
      ref={editorRef}
      className="markdown-code-editor"
      aria-label="Code block content"
      contentEditable="plaintext-only"
      suppressContentEditableWarning
      spellCheck={false}
      tabIndex={0}
      onInput={(event) => onChange(codeInputText(event.currentTarget, event.nativeEvent))}
      onKeyDown={onEdge ? (event) => moveFromCodeEdge(event, onEdge) : undefined}
    />
  );
}

/**
 * Reads code input and preserves the browser caret at a trailing empty line.
 *
 * Removes Chromium's extra placeholder newline from the saved text and supplies
 * a trailing break when deletion leaves the caret without a visible empty line.
 *
 * @param element - The browser-owned code editor after its input event.
 * @param event - Native input event describing the browser edit.
 * @returns Plain code text, including intentional trailing newlines.
 */
function codeInputText(element: HTMLElement, event: Event): string {
  const text = element.textContent ?? "";
  const selection = element.ownerDocument.getSelection();
  const last = element.lastChild;
  if (
    event instanceof InputEvent &&
    event.inputType === "deleteContentBackward" &&
    text.endsWith("\n") &&
    last?.nodeType === Node.TEXT_NODE &&
    selection?.isCollapsed &&
    selection.anchorNode === last &&
    selection.anchorOffset === last.textContent?.length
  ) {
    element.append(element.ownerDocument.createElement("br"));
    selection.setPosition(element, element.childNodes.length - 1);
  }
  if (
    event instanceof InputEvent &&
    event.inputType === "insertLineBreak" &&
    hasTrailingCaretPlaceholder(element)
  ) {
    return text.slice(0, -1);
  }
  return text;
}

/**
 * Identifies Chromium's extra newline needed to place a caret on the last empty line.
 *
 * @param element - Browser-owned code editor containing the current caret.
 * @returns Whether the final text node is the browser's caret placeholder.
 */
function hasTrailingCaretPlaceholder(element: HTMLElement): boolean {
  const selection = element.ownerDocument.getSelection();
  const last = element.lastChild;
  return Boolean(
    selection?.isCollapsed &&
    selection.anchorNode === last &&
    selection.anchorOffset === 0 &&
    last?.nodeType === Node.TEXT_NODE &&
    last.textContent === "\n" &&
    last.previousSibling?.textContent?.endsWith("\n"),
  );
}

export function MarkdownCodeBlock({
  node,
  onCodeChange,
  onCodeEdge,
  onEditMarkdown,
  preventTextEditingAttributes,
  children,
  ...attributes
}: MarkdownCodeBlockProps) {
  const code = Children.toArray(children)[0];
  const codeElement = isValidElement<AnnotatedCodeProps>(code)
    ? (code as ReactElement<AnnotatedCodeProps & HTMLAttributes<HTMLElement>>)
    : undefined;
  const metadata = codeElement ? codeElement.props : undefined;
  const label = metadata?.["data-code-label"];
  const language = metadata?.["data-code-language"];
  const languageTitle = language ? (LANGUAGE_TITLES[language] ?? language) : undefined;
  const showLanguage = Boolean(
    languageTitle && languageTitle.toLowerCase() !== label?.toLowerCase(),
  );
  const codeContent =
    codeElement && node && onCodeChange ? (
      <span className="markdown-code-content">
        {cloneElement(codeElement, {
          "aria-hidden": true,
          className: `${codeElement.props.className ?? ""} markdown-code-preview`.trim(),
        })}
        <EditableCode
          preventTextEditingAttributes={preventTextEditingAttributes}
          onChange={(value) => onCodeChange(node, value)}
          onEdge={onCodeEdge ? (direction) => onCodeEdge(node, direction) : undefined}
        >
          {codeElement.props.children}
        </EditableCode>
      </span>
    ) : (
      code
    );

  return (
    <figure className="markdown-code-block">
      <figcaption className="markdown-code-header">
        <span className="markdown-code-labels">
          {label && <span className="markdown-code-label">{label}</span>}
          {showLanguage && <span className="markdown-code-language">{languageTitle}</span>}
        </span>
        <span className="markdown-code-actions" {...preventTextEditingAttributes}>
          <button
            type="button"
            title="Copy code"
            aria-label="Copy code"
            onClick={() =>
              void navigator.clipboard.writeText(
                textContent(codeElement?.props.children).replace(/\n$/, ""),
              )
            }
          >
            <CopyIcon aria-hidden="true" />
          </button>
          {onEditMarkdown && (
            <button
              type="button"
              title="Edit block"
              aria-label="Edit block"
              onClick={onEditMarkdown}
            >
              <PencilIcon aria-hidden="true" />
            </button>
          )}
        </span>
      </figcaption>
      <pre {...attributes}>{codeContent}</pre>
    </figure>
  );
}

/**
 * Opens the surrounding editor when an unmodified vertical arrow reaches a code edge.
 *
 * @param event - Key event from the editable code element.
 * @param onEdge - Receives the edge reached by the collapsed caret.
 * @returns Nothing when the caret can move within the code; otherwise requests the handoff.
 */
function moveFromCodeEdge(
  event: KeyboardEvent<HTMLElement>,
  onEdge: (direction: "up" | "down") => void,
): void {
  if (
    (event.key !== "ArrowUp" && event.key !== "ArrowDown") ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  ) {
    return;
  }
  const element = event.currentTarget;
  const selection = element.ownerDocument.getSelection();
  if (!selection?.isCollapsed || !selection.anchorNode || !element.contains(selection.anchorNode)) {
    return;
  }
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  if (event.key === "ArrowUp") {
    range.setEnd(selection.anchorNode, selection.anchorOffset);
  } else {
    range.setStart(selection.anchorNode, selection.anchorOffset);
  }
  if (range.toString().includes("\n")) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  onEdge(event.key === "ArrowUp" ? "up" : "down");
}
