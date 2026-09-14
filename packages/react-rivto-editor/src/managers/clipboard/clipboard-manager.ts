import type { ClipboardBundle, EditorBlock, EditorBlockInput } from "@chulane/rivto";
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

/** One binary representation contributed for a single copied attachment. */
export interface ClipboardBinaryRepresentation {
  readonly name: string;
  readonly mimeType: string;
  readonly data: Blob | Promise<Blob>;
}

/** Context supplied while refining the final clipboard payload. */
export interface ClipboardPostprocessContext {
  readonly bundle: ClipboardBundle;
  readonly formats: PortableBlockFormats;
}

/** Ordered extension hook that may contribute single-object binary data. */
export interface ClipboardPostprocessor {
  readonly id: string;
  readonly process: (context: ClipboardPostprocessContext) => ClipboardBinaryRepresentation | undefined;
}

/** Host bridge for MIME formats unavailable through the browser clipboard. */
export interface ClipboardWriter {
  readonly id: string;
  readonly supports: (mimeType: string) => boolean;
  readonly write: (input: ClipboardBinaryRepresentation & PortableBlockFormats) => void | Promise<void>;
}

const escapeHtml = (value: string): string => value.replace(/[&<>"']/g, (character) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;",
})[character]!);

/**
 * Returns the exact or generic binary MIME type accepted by a browser clipboard.
 *
 * Browsers predating `ClipboardItem.supports` are allowed to attempt the exact
 * type; the eventual write remains the authoritative capability check.
 *
 * @param view - Window owning the editor surface.
 * @param mimeType - Exact binary MIME type requested by the extension.
 * @returns Accepted browser MIME type, or undefined when binary writing is unavailable.
 */
function browserClipboardType(view: (Window & typeof globalThis) | null | undefined, mimeType: string): string | undefined {
  const ClipboardItemConstructor = view?.ClipboardItem;
  const clipboard = view?.navigator.clipboard;
  if (!ClipboardItemConstructor || !clipboard?.write) return undefined;
  if (!ClipboardItemConstructor.supports) return mimeType;
  if (ClipboardItemConstructor.supports(mimeType)) return mimeType;
  return ClipboardItemConstructor.supports("application/octet-stream") ? "application/octet-stream" : undefined;
}

/** Ordered React-owned portable clipboard contributions. */
export class ClipboardManager {
  private readonly formatters: ClipboardFormatter[] = [];
  private readonly parsers: ClipboardParser[] = [];
  private readonly postprocessors: ClipboardPostprocessor[] = [];
  private writer?: ClipboardWriter;

  /**
   * Creates the React-owned formatter and parser registry.
   *
   * @param reactEditor - Owning React editor used for extension lifecycle cleanup.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Registers one ordered final clipboard refinement.
   * @param postprocessor - Single-object binary contribution hook.
   * @returns Lifecycle-owned disposer.
   */
  registerPostprocessor(postprocessor: ClipboardPostprocessor): () => void {
    this.reactEditor.extensions.assertActive();
    if (!postprocessor.id.trim() || this.postprocessors.some(({ id }) => id === postprocessor.id)) {
      throw new Error(`Clipboard postprocessor ${postprocessor.id || "<empty>"} is already registered`);
    }
    this.postprocessors.push(postprocessor);
    return this.reactEditor.extensions.own(() => {
      const index = this.postprocessors.indexOf(postprocessor);
      if (index >= 0) this.postprocessors.splice(index, 1);
    });
  }

  /**
   * Registers the single host binary writer used before the browser fallback.
   * @param writer - Privileged host clipboard bridge.
   * @returns Lifecycle-owned disposer.
   */
  registerWriter(writer: ClipboardWriter): () => void {
    this.reactEditor.extensions.assertActive();
    if (!writer.id.trim()) throw new Error("Clipboard writer ID is required");
    if (this.writer) throw new Error(`Clipboard writer ${this.writer.id} is already registered`);
    this.writer = writer;
    return this.reactEditor.extensions.own(() => {
      if (this.writer === writer) this.writer = undefined;
    });
  }

  /**
   * Reports whether a registered host or the current browser can attempt a binary write.
   *
   * @param mimeType - Exact file MIME type proposed for copying.
   * @returns Whether the custom copy menu should handle this type.
   */
  canWriteBinary(mimeType: string): boolean {
    const writer = this.writer;
    if (writer?.supports(mimeType) || writer?.supports("application/octet-stream")) return true;
    const view = this.reactEditor.events.getRoot()?.ownerDocument.defaultView;
    return browserClipboardType(view, mimeType) !== undefined;
  }

  /**
   * Runs postprocessors and starts a binary write without delaying the copy event.
   * @param bundle - Structured selected objects.
   * @param formats - Synchronous portable clipboard formats.
   * @returns Nothing.
   */
  writeProcessed(bundle: ClipboardBundle, formats: PortableBlockFormats): void {
    try {
      const binary = this.postprocessors.map((processor) => processor.process({ bundle, formats })).find(Boolean);
      if (binary) void this.writeBinary(binary, formats).catch(() => undefined);
    } catch {
      // The synchronous event already contains portable formats; refinement is optional.
    }
  }

  /**
   * Writes exact MIME bytes, falling back to application/octet-stream.
   * @param binary - Named attachment bytes and original MIME type.
   * @param formats - Portable representations included beside binary data.
   * @returns Whether a host or browser writer accepted the payload.
   */
  async writeBinary(
    binary: ClipboardBinaryRepresentation,
    formats: PortableBlockFormats = { plain: binary.name, markdown: binary.name, html: binary.name },
  ): Promise<boolean> {
    const fallbackType = "application/octet-stream";
    const writer = this.writer;
    const hostType = writer?.supports(binary.mimeType)
      ? binary.mimeType
      : writer?.supports(fallbackType) ? fallbackType : undefined;
    if (writer && hostType) {
      try {
        await writer.write({ ...binary, ...formats, mimeType: hostType });
        return true;
      } catch {
        // A failed host bridge may still be recoverable through ClipboardItem.
      }
    }
    const view = this.reactEditor.events.getRoot()?.ownerDocument.defaultView;
    const ClipboardItemConstructor = view?.ClipboardItem;
    const clipboard = view?.navigator.clipboard;
    const browserType = browserClipboardType(view, binary.mimeType);
    if (!ClipboardItemConstructor || !clipboard?.write || !browserType) return false;
    const data = Promise.resolve(binary.data).then((blob) => new Blob([blob], { type: browserType }));
    await clipboard.write([new ClipboardItemConstructor({
      [browserType]: data,
      "text/plain": new Blob([formats.plain], { type: "text/plain" }),
      "text/html": new Blob([formats.html], { type: "text/html" }),
    }, { presentationStyle: "attachment" })]);
    return true;
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
