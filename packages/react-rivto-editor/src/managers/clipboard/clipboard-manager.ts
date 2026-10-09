import { ClipboardManager as CoreClipboardManager, BLOCK_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID, PRESERVE_NEWLINES_PASTE_STRATEGY_ID } from "@chulane/rivto";
import type { ReactEditorView, ClipboardCapability } from "../../capabilities";
import type { ReactEditor } from "../../types";
import type {
  PasteStrategy,
  EditorBlock,
  EditorBlockInput,
  RivtoEditorApi,
} from "@chulane/rivto";
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

/** Optional view binding for paste algorithms that depend on a rendered surface. */
export interface ViewPasteStrategy extends PasteStrategy {
  /** Returns an algorithm bound to the receiving occurrence, without changing registrations. */
  createViewStrategy(reactEditor: ReactEditor): PasteStrategy;
}

/** Ordered React-owned portable clipboard contributions. */
export class ClipboardManager {
  private readonly formatters: ClipboardFormatter[] = [];
  private readonly parsers: ClipboardParser[] = [];

  /**
   * Creates the React-owned formatter and parser registry.
   *
   * @param reactEditor - Owning React runtime providing extension lifecycle.
   * @param editor - Core runtime providing clipboard operations.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    private readonly editor: RivtoEditorApi,
  ) {}

  /** Binds clipboard operations to a view; parsers and formatters stay document-owned. */
  createViewApi(reactEditor: ReactEditorView): ClipboardCapability {
    return {
      createViewApi: (view) => this.createViewApi(view),
      pasteStrategies: this.pasteStrategies,
      copy: (selection) => {
        const current = selection ?? reactEditor.selection.get();
        return current ? this.copy(current) : undefined;
      },
      copyText: (selection) => this.copyText(selection),
      cut: () => {
        const selection = reactEditor.selection.get();
        if (!selection) return;
        const bundle = this.copy(selection);
        if (bundle) reactEditor.selection.delete();
        return bundle;
      },
      paste: (input) => this.paste(input, reactEditor),
      registerFormatter: (formatter) => this.registerFormatter(formatter),
      registerParser: (parser) => this.registerParser(parser),
      format: (blocks) => this.format(blocks),
      parse: (data) => this.parse(data),
    };
  }

  /** Core paste strategies extended by React clipboard integrations. */
  get pasteStrategies(): CoreClipboardManager["pasteStrategies"] { return this.editor.clipboard.pasteStrategies; }

  /** Copies the current or supplied selection as structured data. */
  copy(...args: Parameters<CoreClipboardManager["copy"]>): ReturnType<CoreClipboardManager["copy"]> {
    return this.editor.clipboard.copy(...args);
  }

  /** Copies an explicit text selection. */
  copyText(...args: Parameters<CoreClipboardManager["copyText"]>): ReturnType<CoreClipboardManager["copyText"]> {
    return this.editor.clipboard.copyText(...args);
  }

  /** Copies and deletes the current selection. */
  cut(): ReturnType<CoreClipboardManager["cut"]> { return this.editor.clipboard.cut(); }

  /** Pastes structured or plain clipboard data. */
  paste(input: Parameters<CoreClipboardManager["paste"]>[0] = {}, reactEditor: ReactEditor = this.reactEditor.events.getDocumentView() ?? this.reactEditor): ReturnType<CoreClipboardManager["paste"]> {
    // A local pipeline retains the destination even if a strategy invokes another paste.
    const clipboard = new CoreClipboardManager(this.editor);
    for (const id of [BLOCK_PASTE_STRATEGY_ID, TEXT_PASTE_STRATEGY_ID, PRESERVE_NEWLINES_PASTE_STRATEGY_ID]) {
      clipboard.pasteStrategies.unregister(id);
    }
    this.pasteStrategies.getPasteStrategies().forEach((strategy, index) => {
      const bind = (strategy as Partial<ViewPasteStrategy>).createViewStrategy;
      clipboard.pasteStrategies.register(String(index), bind ? bind.call(strategy, reactEditor) : strategy);
    });
    // An inactive view has no caret; undefined would make core borrow another view's selection.
    const selection = input.textTarget ?? reactEditor.selection.get() ?? { type: "selection" as const, blocks: [], elements: [] };
    return clipboard.paste({ ...input, textTarget: selection });
  }

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
