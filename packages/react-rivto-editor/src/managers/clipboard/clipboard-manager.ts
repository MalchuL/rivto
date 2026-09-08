import type { EditorBlock, EditorBlockInput } from "@chulane/rivto";
import type { ReactEditorImpl } from "../../react-editor";

/** Portable text representations produced for one block forest. */
export interface PortableBlockFormats {
  /** Unformatted text suitable for `text/plain`. */
  readonly plain: string;
  /** Markdown representation suitable for `text/markdown`. */
  readonly markdown: string;
  /** HTML fragment suitable for `text/html`. */
  readonly html: string;
}

/** Structural context supplied while formatting one block. */
export interface ClipboardFormatContext {
  /** Current detached block being formatted. */
  readonly block: EditorBlock;
  /** Ordered siblings containing the current block. */
  readonly siblings: readonly EditorBlock[];
  /** Zero-based position of the current block among its siblings. */
  readonly index: number;
  /** Zero-based nesting depth in the copied block forest. */
  readonly depth: number;
  /** Already formatted descendant forest. */
  readonly children: PortableBlockFormats;
}

/** Ordered contribution that may rewrite portable formats for matching blocks. */
export interface ClipboardFormatter {
  /** Stable ID used to prevent duplicate formatter registration. */
  readonly id: string;
  /** Optional predicate; returning `false` skips this formatter for the block. */
  readonly matches?: (context: ClipboardFormatContext) => boolean;
  /** Produces the next formats from structural context and preceding output. */
  readonly format: (context: ClipboardFormatContext, current: PortableBlockFormats) => PortableBlockFormats;
}

/** Candidate parser consulted in registration order for external clipboard data. */
export interface ClipboardParser {
  /** Stable ID used to prevent duplicate parser registration. */
  readonly id: string;
  /** Returns parsed block inputs on a match or `undefined` to try the next parser. */
  readonly parse: (data: { readonly html: string; readonly text: string }) => EditorBlockInput[] | undefined;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

/** Ordered React-owned portable clipboard contributions. */
export class ClipboardManager {
  private readonly formatters: ClipboardFormatter[] = [];
  private readonly parsers: ClipboardParser[] = [];

  /**
   * Creates the React-owned formatter and parser registry.
   *
   * @param reactEditor - Owning React editor used for extension lifecycle cleanup.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Appends a formatter to the ordered, composable formatting pipeline.
   *
   * @param formatter - Stable formatter definition to register.
   * @returns An idempotent disposer owned by the active extension lifecycle.
   * @throws {Error} When the formatter ID is empty or already registered.
   */
  registerFormatter(formatter: ClipboardFormatter): () => void {
    if (!formatter.id || this.formatters.some(({ id }) => id === formatter.id)) {
      throw new Error(`Clipboard formatter ${formatter.id || "<empty>"} is already registered`);
    }
    this.formatters.push(formatter);
    return this.reactEditor.extensions.own(() => {
      const index = this.formatters.indexOf(formatter);
      if (index >= 0) this.formatters.splice(index, 1);
    });
  }

  /**
   * Appends a parser to the first-match parsing pipeline.
   *
   * @param parser - Stable parser definition to register.
   * @returns An idempotent disposer owned by the active extension lifecycle.
   * @throws {Error} When the parser ID is empty or already registered.
   */
  registerParser(parser: ClipboardParser): () => void {
    if (!parser.id || this.parsers.some(({ id }) => id === parser.id)) {
      throw new Error(`Clipboard parser ${parser.id || "<empty>"} is already registered`);
    }
    this.parsers.push(parser);
    return this.reactEditor.extensions.own(() => {
      const index = this.parsers.indexOf(parser);
      if (index >= 0) this.parsers.splice(index, 1);
    });
  }

  /**
   * Formats a detached block forest through every applicable formatter.
   *
   * Children are visited recursively and appended to their parent's resulting
   * formats. The supplied blocks are never mutated.
   *
   * @param blocks - Ordered root block subtrees to serialize.
   * @returns Composed plain-text, Markdown, and HTML representations.
   */
  format(blocks: readonly EditorBlock[]): PortableBlockFormats {
    const visit = (siblings: readonly EditorBlock[], depth: number): PortableBlockFormats => {
      const items = siblings.map((block, index) => {
        const children = visit(block.children, depth + 1);
        const indent = "  ".repeat(depth);
        const ownPlain = block.content.split(/\r\n?|\n/).map((line) => indent + line).join("\n");
        const ownHtml = `<p>${escapeHtml(block.content).replace(/\r\n?|\n/g, "<br>")}</p>`;
        const context = { block, siblings, index, depth, children };
        let current: PortableBlockFormats = {
          plain: children.plain ? `${ownPlain}\n${children.plain}` : ownPlain,
          markdown: children.markdown ? `${ownPlain}\n${children.markdown}` : ownPlain,
          html: ownHtml + children.html,
        };
        this.formatters.forEach((formatter) => {
          if (formatter.matches?.(context) !== false) current = formatter.format(context, current);
        });
        return current;
      });
      return {
        plain: items.map(({ plain }) => plain).join("\n"),
        markdown: items.map(({ markdown }) => markdown).join("\n"),
        html: items.map(({ html }) => html).join(""),
      };
    };
    return visit(blocks, 0);
  }

  /**
   * Parses external clipboard flavors with the first parser that matches.
   *
   * @param data - Available HTML and plain-text clipboard values.
   * @returns Parsed block inputs from the first match, or `undefined` when no
   * registered parser accepts the data.
   */
  parse(data: { readonly html: string; readonly text: string }): EditorBlockInput[] | undefined {
    for (const parser of this.parsers) {
      const blocks = parser.parse(data);
      if (blocks) return blocks;
    }
    return undefined;
  }
}
