import {
  Children,
  isValidElement,
  type ReactNode,
} from "react";
import type { Components } from "react-markdown";

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
  if (!label) return;

  const basename = label.split(/[\\/]/).at(-1) ?? label;
  const extensionIndex = basename.lastIndexOf(".");
  const extension = extensionIndex > 0
    ? basename.slice(extensionIndex + 1).toLowerCase()
    : undefined;
  const extensionLanguage = extension ? EXTENSION_LANGUAGES[extension] : undefined;
  const filename = label.includes("/") || label.includes("\\") || Boolean(extensionLanguage);

  return {
    label,
    language: filename
      ? extensionLanguage
      : LANGUAGE_ALIASES[label.toLowerCase()] ?? label.toLowerCase(),
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
        const properties = node.properties ??= {};
        const classes = Array.isArray(properties.className)
          ? properties.className.map(String)
          : [];
        const languageClass = classes.find((name) => name.startsWith("language-"));
        const info = resolveCodeFenceInfo(languageClass?.slice("language-".length));

        if (info) {
          properties.dataCodeLabel = info.label;
          properties.dataCodeFilename = info.filename ? "true" : "false";
          if (info.language) properties.dataCodeLanguage = info.language;
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

/**
 * Renders a visible filename/language header around one fenced code block.
 *
 * Inline code never produces a `pre` element and therefore bypasses this
 * component. Syntax spans remain owned by `rehype-highlight`.
 */
export const MarkdownCodeBlock: NonNullable<Components["pre"]> = ({
  node: _node,
  children,
  ...attributes
}) => {
  const code = Children.toArray(children)[0];
  const metadata = isValidElement<AnnotatedCodeProps>(code)
    ? code.props
    : undefined;
  const label = metadata?.["data-code-label"];
  const language = metadata?.["data-code-language"];
  const languageTitle = language
    ? LANGUAGE_TITLES[language] ?? language
    : undefined;
  const showLanguage = Boolean(
    languageTitle && languageTitle.toLowerCase() !== label?.toLowerCase(),
  );

  return (
    <figure className="markdown-code-block">
      {(label || showLanguage) && (
        <figcaption className="markdown-code-header">
          {label && <span className="markdown-code-label">{label}</span>}
          {showLanguage && (
            <span className="markdown-code-language">{languageTitle}</span>
          )}
        </figcaption>
      )}
      <pre {...attributes}>{children}</pre>
    </figure>
  );
};
